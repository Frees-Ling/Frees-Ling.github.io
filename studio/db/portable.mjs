// 完整导出 / 导入 / 向量重建（KB-008）。
//
// ── 为什么导出不含向量 ──
//
// 向量是**派生数据**：同样的文本 + 同样的嵌入模型必然得到同样的向量。
// 把它写进导出文件会让体积大数倍（1024 维 float32 ≈ 4KB/条），
// 而且会让「导出文件能否被将来某个模型使用」变成一个假问题 ——
// 换模型后那些向量本来就该作废。导出**语义数据**，向量由重建恢复。
//
// ── 为什么导入要求空库 ──
//
// 合并两份来源不同的知识库，冲突处理（同 id 不同内容怎么办？）
// 是一个需要人来判断的问题。脚本静默选一边，等于替人做了一个
// 他不知道做过的决定。因此这里**拒绝**而非合并，把判断留给人。

import { readFileSync, writeFileSync } from 'node:fs';
import { currentVersion } from './schema.mjs';

export const EXPORT_FORMAT = 'frees-studio-export';
export const EXPORT_VERSION = 1;

/** 导出全部语义数据。不含向量。 */
export function exportAll(db) {
  const rows = (sql) => db.prepare(sql).all();

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    schemaVersion: currentVersion(db),
    exportedAt: new Date().toISOString(),
    notes: rows('SELECT * FROM notes ORDER BY created_at, id'),
    tags: rows('SELECT * FROM tags ORDER BY id'),
    noteTags: rows('SELECT * FROM note_tags ORDER BY note_id, tag_id'),
    links: rows('SELECT * FROM links ORDER BY from_id, to_id, kind'),
    memoryNotes: rows('SELECT * FROM memory_notes ORDER BY memory_id, note_id'),
    archive: rows('SELECT * FROM archive_entries ORDER BY created_at, id'),
    memories: rows('SELECT * FROM memories ORDER BY created_at, id'),
    conversations: rows('SELECT * FROM conversations ORDER BY created_at, id'),
    messages: rows('SELECT * FROM messages ORDER BY created_at, id'),
  };
}

export function exportToFile(db, path) {
  const data = exportAll(db);
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  return {
    path,
    counts: countEntities(data),
  };
}

export function countEntities(data) {
  return {
    notes: data.notes?.length ?? 0,
    memories: data.memories?.length ?? 0,
    archive: data.archive?.length ?? 0,
    conversations: data.conversations?.length ?? 0,
    messages: data.messages?.length ?? 0,
  };
}

function assertEmpty(db) {
  for (const table of [
    'notes',
    'tags',
    'note_tags',
    'links',
    'memory_notes',
    'archive_entries',
    'memories',
    'conversations',
    'messages',
  ]) {
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
    if (c > 0) {
      throw new Error(
        `目标库非空（${table} 有 ${c} 行）。导入只在空库上进行 —— ` +
          '合并两份来源不同的知识库需要人判断冲突，脚本不该替你做这个决定。',
      );
    }
  }
}

/**
 * 导入到**空库**。整个过程在一个事务里：失败即回滚，不留半导入状态。
 *
 * 返回逐表写入行数，便于与导出侧比对 —— 「看起来一样」不是验收标准。
 */
export function importAll(db, data) {
  if (data?.format !== EXPORT_FORMAT) {
    throw new Error(`不是本项目的导出文件（format=${data?.format}）`);
  }
  if (data.version > EXPORT_VERSION) {
    throw new Error(
      `导出文件版本 ${data.version} 高于本程序支持的 ${EXPORT_VERSION}，请先升级`,
    );
  }
  assertEmpty(db);

  const counts = {};
  db.exec('BEGIN');
  try {
    const insert = (table, rows, columns) => {
      if (!rows?.length) {
        counts[table] = 0;
        return;
      }
      const stmt = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      );
      for (const row of rows) stmt.run(...columns.map((c) => row[c]));
      counts[table] = rows.length;
    };

    // 顺序必须严格遵循外键依赖。写错不会报错，只会让导入失败：
    //   notes    ← note_tags / links / memory_notes 都指向它
    //   archive  ← memories.source_entry_id 指向它
    //   messages ← memories.source_message_id 指向它（因此必须在 memories 之前）
    // 实测踩过：先插 memories 再插 messages，外键失败 ——
    // 这与「逻辑上谁先谁后」无关，只取决于 REFERENCES 指向谁。
    insert('notes', data.notes, [
      'id',
      'title',
      'body',
      'kind',
      'status',
      'origin',
      'created_at',
      'updated_at',
    ]);
    insert('tags', data.tags, ['id', 'name']);
    insert('note_tags', data.noteTags, ['note_id', 'tag_id']);
    insert('archive_entries', data.archive, [
      'id',
      'kind',
      'source',
      'content',
      'created_at',
      'hash',
    ]);
    insert('conversations', data.conversations, [
      'id',
      'title',
      'model',
      'created_at',
      'updated_at',
    ]);
    insert('messages', data.messages, [
      'id',
      'conversation_id',
      'role',
      'content',
      'citations',
      'created_at',
    ]);
    insert('memories', data.memories, [
      'id',
      'content',
      'source_entry_id',
      'source_message_id',
      'confidence',
      'status',
      'created_at',
      'reviewed_at',
    ]);
    insert('links', data.links, ['from_id', 'to_id', 'kind']);
    insert('memory_notes', data.memoryNotes, [
      'memory_id',
      'note_id',
      'created_at',
    ]);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error(`导入失败，已回滚：${error.message}`);
  }

  return counts;
}

export function importFromFile(db, path) {
  return importAll(db, JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * 重建全部向量。
 *
 * 换嵌入模型后旧向量不可用（维度可能都不同），需要重算。
 *
 * **失败即中止并回滚**：留下「一半是旧模型向量、一半是新模型」的状态
 * 比完全不重建更糟 —— 检索结果会变得不可解释，而没有任何提示。
 */
export async function rebuildEmbeddings(db, embedder, { batchSize = 16 } = {}) {
  if (!embedder) throw new Error('未配置嵌入端点，无法重建向量');

  const targets = [
    ...db
      .prepare('SELECT id, title, body FROM notes')
      .all()
      .map((n) => ({
        kind: 'note',
        id: n.id,
        text: `${n.title}\n${n.body}`,
      })),
    ...db
      .prepare("SELECT id, content FROM memories WHERE status = 'approved'")
      .all()
      .map((m) => ({ kind: 'memory', id: m.id, text: m.content })),
  ];

  if (targets.length === 0) return { rebuilt: 0, failed: [] };

  const failed = [];
  const done = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    let vectors;
    try {
      vectors = await embedder.embedMany(batch.map((t) => t.text));
    } catch (error) {
      // 端点在批中间挂掉：中止，不写任何东西
      throw new Error(
        `重建在第 ${i + 1} 条中止，未写入任何向量：${error.message}`,
      );
    }
    batch.forEach((t, j) => {
      const v = vectors[j];
      if (!v || v.length === 0) {
        failed.push(t.id);
        return;
      }
      done.push({ ...t, vector: v });
    });
  }

  // 全部算完才落库，保证不会出现半新半旧
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM embeddings').run();
    for (const t of done) {
      db.prepare(
        `INSERT INTO embeddings (owner_kind, owner_id, model, dim, vector, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        t.kind,
        t.id,
        embedder.model,
        t.vector.length,
        Buffer.from(new Float32Array(t.vector).buffer),
        new Date().toISOString(),
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error(`写入向量失败，已回滚（旧向量保持不变）：${error.message}`);
  }

  return { rebuilt: done.length, failed, model: embedder.model };
}
