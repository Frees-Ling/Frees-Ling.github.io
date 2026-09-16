// 导出 / 导入 / 向量重建测试（KB-008）。
//
// 全部用合成数据 —— 导出与导入涉及「整库搬运」，
// 只在测试数据上验证，不碰任何真实私人内容。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, currentVersion } from './schema.mjs';
import {
  createNote,
  proposeMemory,
  reviewMemory,
  linkMemoryToNote,
  importArchiveEntry,
  createConversation,
  addMessage,
  proposeMemoryFromMessage,
  getEmbedding,
  semanticSearch,
} from './store.mjs';
import {
  exportAll,
  exportToFile,
  importAll,
  importFromFile,
  rebuildEmbeddings,
  EXPORT_FORMAT,
} from './portable.mjs';
import { createMockEmbedder, createEmbedder } from '../ai/embeddings.mjs';

const fresh = () => openDatabase(':memory:');

/** 造一份有代表性的数据：三层都有，且有关联与来源。 */
async function seed(db) {
  const entry = importArchiveEntry(db, {
    kind: 'conversation',
    source: 'chat.md',
    content: '讨论注意力机制',
  });
  const note = createNote(db, {
    title: '注意力机制笔记',
    body: '从几何直觉出发',
    tags: ['机器学习', '几何'],
  });
  const conv = createConversation(db, { model: 'mock' });
  const msg = addMessage(db, conv.id, { role: 'assistant', content: '结论' });
  const memory = proposeMemoryFromMessage(db, {
    messageId: msg.id,
    content: '先看几何直觉',
  });
  reviewMemory(db, memory.id, 'approved');
  linkMemoryToNote(db, memory.id, note.id);
  proposeMemory(db, { content: '仍待审核的推测', sourceEntryId: entry.id });

  const embedder = createMockEmbedder({ dim: 16 });
  db.prepare(
    `INSERT INTO embeddings (owner_kind, owner_id, model, dim, vector, created_at)
     VALUES ('note', ?, 'mock', 16, ?, ?)`,
  ).run(
    note.id,
    Buffer.from(
      new Float32Array(await embedder.embed('注意力机制笔记')).buffer,
    ),
    new Date().toISOString(),
  );

  return { note, memory, conv, msg, entry };
}

test('导出包含三层数据且不含向量', async () => {
  const db = fresh();
  await seed(db);
  const data = exportAll(db);

  assert.equal(data.format, EXPORT_FORMAT);
  assert.equal(data.schemaVersion, currentVersion(db));
  assert.equal(data.notes.length, 1);
  assert.equal(data.memories.length, 2, '待审核的也要导出');
  assert.equal(data.conversations.length, 1);
  assert.equal(data.messages.length, 1);
  assert.equal(data.archive.length, 1);
  assert.equal(data.memoryNotes.length, 1);

  assert.equal(data.embeddings, undefined, '向量是派生数据，不应进导出文件');
  assert.doesNotMatch(JSON.stringify(data), /"vector"/);
  db.close();
});

test('导出到空库后数据等价', async () => {
  const src = fresh();
  await seed(src);
  const json = JSON.stringify(exportAll(src));

  const dst = fresh();
  const counts = importAll(dst, JSON.parse(json));

  assert.equal(counts.notes, 1);
  assert.equal(counts.memories, 2);
  assert.equal(counts.messages, 1);

  // 逐项比对，而不是「看起来一样」
  const pick = (db) =>
    db
      .prepare(
        'SELECT id, title, body, kind, status, origin FROM notes ORDER BY id',
      )
      .all();
  assert.deepEqual(pick(dst), pick(src));

  const mem = (db) =>
    db
      .prepare(
        'SELECT id, content, status, confidence, source_message_id FROM memories ORDER BY id',
      )
      .all();
  assert.deepEqual(mem(dst), mem(src));

  const tag = (db) => db.prepare('SELECT name FROM tags ORDER BY name').all();
  assert.deepEqual(tag(dst), tag(src));

  const link = (db) =>
    db
      .prepare('SELECT memory_id, note_id FROM memory_notes ORDER BY memory_id')
      .all();
  assert.deepEqual(link(dst), link(src));

  const msgRow = (db) =>
    db
      .prepare('SELECT id, role, content, citations FROM messages ORDER BY id')
      .all();
  assert.deepEqual(msgRow(dst), msgRow(src));

  src.close();
  dst.close();
});

test('导入幂等：重复导入同一份文件不产生重复', async () => {
  const src = fresh();
  await seed(src);
  const json = JSON.stringify(exportAll(src));

  const dst = fresh();
  importAll(dst, JSON.parse(json));
  // 第二次应被拒绝（目标库非空），而不是默默插入第二份
  assert.throws(() => importAll(dst, JSON.parse(json)), /目标库非空/);
  assert.equal(dst.prepare('SELECT COUNT(*) c FROM notes').get().c, 1);
  src.close();
  dst.close();
});

test('拒绝非本项目的导出文件与过高版本', () => {
  const db = fresh();
  assert.throws(
    () => importAll(db, { format: 'other' }),
    /不是本项目的导出文件/,
  );
  assert.throws(
    () => importAll(db, { format: EXPORT_FORMAT, version: 999 }),
    /高于本程序支持/,
  );
  db.close();
});

test('文件往返', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb8-'));
  try {
    const src = fresh();
    await seed(src);
    const { path, counts } = exportToFile(src, join(dir, 'export.json'));
    assert.equal(counts.notes, 1);

    const dst = fresh();
    importFromFile(dst, path);
    assert.equal(dst.prepare('SELECT COUNT(*) c FROM notes').get().c, 1);

    // 导出文件不含向量
    assert.doesNotMatch(readFileSync(path, 'utf8'), /"vector"/);
    src.close();
    dst.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────── 向量重建 ───────────────────────

test('重建会重算全部向量并报告数量', async () => {
  const db = fresh();
  await seed(db);
  const embedder = createMockEmbedder({ dim: 16 });

  const result = await rebuildEmbeddings(db, embedder);
  // 1 条笔记 + 1 条已确认记忆（待审核的不参与检索，无需向量）
  assert.equal(result.rebuilt, 2);
  assert.deepEqual(result.failed, []);
  db.close();
});

test('重建只处理已确认记忆，不给待审核的建向量', async () => {
  const db = fresh();
  await seed(db);
  await rebuildEmbeddings(db, createMockEmbedder({ dim: 16 }));

  const kinds = db
    .prepare(
      'SELECT owner_kind, COUNT(*) c FROM embeddings GROUP BY owner_kind',
    )
    .all();
  const byKind = Object.fromEntries(kinds.map((k) => [k.owner_kind, k.c]));
  assert.equal(byKind.note, 1);

  const pendingCount = db
    .prepare("SELECT COUNT(*) c FROM memories WHERE status='pending'")
    .get().c;
  assert.ok(pendingCount > 0, '用例里应有待审核记忆');
  assert.equal(byKind.memory, 1, '待审核记忆不应有向量');
  db.close();
});

test('重建后语义检索可用', async () => {
  const db = fresh();
  await seed(db);
  const embedder = createMockEmbedder({ dim: 16 });
  await rebuildEmbeddings(db, embedder);

  const hits = semanticSearch(db, await embedder.embed('注意力机制笔记'), {
    minScore: 0,
  });
  assert.ok(hits.length > 0);
  db.close();
});

test('端点不可用时重建中止，且不留下半新半旧的状态', async () => {
  const db = fresh();
  await seed(db);
  const before = db.prepare('SELECT COUNT(*) c FROM embeddings').get().c;
  assert.ok(before > 0);

  const broken = createEmbedder({
    baseUrl: 'http://127.0.0.1:9/v1',
    timeoutMs: 1200,
  });
  await assert.rejects(
    () => rebuildEmbeddings(db, broken),
    /重建在第 1 条中止/,
  );

  // 旧向量必须原封不动 —— 半新半旧比完全不重建更糟
  assert.equal(db.prepare('SELECT COUNT(*) c FROM embeddings').get().c, before);
  const model = db.prepare('SELECT DISTINCT model FROM embeddings').all();
  assert.equal(model.length, 1, '不应出现两个模型的向量共存');
  db.close();
});

test('没有嵌入端点时明确报错', async () => {
  const db = fresh();
  await assert.rejects(() => rebuildEmbeddings(db, null), /未配置嵌入端点/);
  db.close();
});

test('空库重建返回 0 而不是报错', async () => {
  const db = fresh();
  const r = await rebuildEmbeddings(db, createMockEmbedder());
  assert.equal(r.rebuilt, 0);
  db.close();
});
