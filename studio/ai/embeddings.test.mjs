// 嵌入与语义检索测试。
//
// 用模拟嵌入器 —— 它按字符重叠给向量，足以测存储、维度校验、排序与降级，
// **但测不了语义质量**（模拟器不理解语义，这一条必须说清楚）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../db/schema.mjs';
import {
  createNote,
  proposeMemory,
  reviewMemory,
  upsertEmbedding,
  getEmbedding,
  semanticSearch,
} from '../db/store.mjs';
import {
  vectorToBlob,
  blobToVector,
  cosineSimilarity,
  createMockEmbedder,
  createEmbedder,
} from './embeddings.mjs';

const fresh = () => openDatabase(':memory:');

// ─────────────────────── 向量与相似度 ───────────────────────

test('Float32 与 BLOB 往返不丢精度', () => {
  const original = new Float32Array([0.1, -0.25, 0, 1, 0.333333]);
  const back = blobToVector(vectorToBlob(original));
  assert.equal(back.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(back[i] - original[i]) < 1e-6, `第 ${i} 位不一致`);
  }
});

test('余弦相似度：相同为 1，正交为 0', () => {
  assert.ok(
    Math.abs(
      cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0])) - 1,
    ) < 1e-6,
  );
  assert.ok(
    Math.abs(
      cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1])),
    ) < 1e-6,
  );
});

test('零向量返回 0 而不是 NaN', () => {
  const zero = new Float32Array([0, 0, 0]);
  const v = cosineSimilarity(zero, new Float32Array([1, 2, 3]));
  assert.equal(v, 0);
  assert.ok(!Number.isNaN(v), 'NaN 会污染整个排序');
});

test('维度不一致时抛错而不是给出错误答案', () => {
  assert.throws(
    () =>
      cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1, 2, 3])),
    /维度不一致/,
  );
});

// ─────────────────────── 存储 ───────────────────────

test('嵌入可写入、读回、覆盖', async () => {
  const db = fresh();
  const note = createNote(db, { title: 'x' });
  const embedder = createMockEmbedder({ dim: 8 });

  const v1 = await embedder.embed('第一版内容');
  upsertEmbedding(db, {
    ownerKind: 'note',
    ownerId: note.id,
    model: 'mock',
    vector: v1,
  });
  assert.equal(getEmbedding(db, 'note', note.id).dim, 8);

  const v2 = await embedder.embed('改过的内容');
  upsertEmbedding(db, {
    ownerKind: 'note',
    ownerId: note.id,
    model: 'mock',
    vector: v2,
  });
  const back = getEmbedding(db, 'note', note.id).vector;
  assert.ok(Math.abs(back[0] - v2[0]) < 1e-6, '应被覆盖而不是新增一行');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM embeddings').get().c, 1);
  db.close();
});

test('拒绝未知的 ownerKind 与空向量', () => {
  const db = fresh();
  assert.throws(
    () =>
      upsertEmbedding(db, {
        ownerKind: 'chat',
        ownerId: 'x',
        model: 'm',
        vector: new Float32Array([1]),
      }),
    /未知的 ownerKind/,
  );
  assert.throws(
    () =>
      upsertEmbedding(db, {
        ownerKind: 'note',
        ownerId: 'x',
        model: 'm',
        vector: new Float32Array([]),
      }),
    /向量不能为空/,
  );
  db.close();
});

// ─────────────────────── 检索 ───────────────────────

test('语义检索返回笔记与已确认记忆，排除待审核', async () => {
  const db = fresh();
  const embedder = createMockEmbedder({ dim: 16 });

  const note = createNote(db, { title: '注意力机制笔记', body: '' });
  const approved = proposeMemory(db, { content: '注意力机制要先看几何直觉' });
  const pending = proposeMemory(db, { content: '注意力机制的未确认推测' });
  reviewMemory(db, approved.id, 'approved');

  for (const [kind, id, text] of [
    ['note', note.id, '注意力机制笔记'],
    ['memory', approved.id, '注意力机制要先看几何直觉'],
    ['memory', pending.id, '注意力机制的未确认推测'],
  ]) {
    upsertEmbedding(db, {
      ownerKind: kind,
      ownerId: id,
      model: 'mock',
      vector: await embedder.embed(text),
    });
  }

  const hits = semanticSearch(db, await embedder.embed('注意力机制笔记'), {
    minScore: 0,
  });
  assert.ok(
    hits.some((h) => h.id === note.id),
    '应命中笔记',
  );
  assert.ok(
    hits.some((h) => h.id === approved.id),
    '应命中已确认记忆',
  );
  assert.ok(
    !hits.some((h) => h.id === pending.id),
    '待审核记忆不得出现在语义检索里 —— 换检索方式不改变这条约束',
  );
  db.close();
});

test('minScore 过滤掉不相关的结果', async () => {
  const db = fresh();
  const embedder = createMockEmbedder({ dim: 16 });
  const note = createNote(db, { title: '完全无关的内容', body: '' });
  upsertEmbedding(db, {
    ownerKind: 'note',
    ownerId: note.id,
    model: 'mock',
    vector: await embedder.embed('完全无关的内容'),
  });

  const strict = semanticSearch(db, await embedder.embed('注意力机制'), {
    minScore: 0.99,
  });
  assert.equal(strict.length, 0, '阈值高时应被过滤');
  db.close();
});

test('维度不一致的旧向量被跳过，而不是让整个检索失败', async () => {
  const db = fresh();
  const a = createNote(db, { title: '短向量' });
  const b = createNote(db, { title: '长向量' });
  upsertEmbedding(db, {
    ownerKind: 'note',
    ownerId: a.id,
    model: 'old',
    vector: new Float32Array([1, 0]),
  });
  upsertEmbedding(db, {
    ownerKind: 'note',
    ownerId: b.id,
    model: 'new',
    vector: new Float32Array([1, 0, 0, 0]),
  });

  const hits = semanticSearch(db, new Float32Array([1, 0, 0, 0]), {
    minScore: 0,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, b.id);
  db.close();
});

test('被删除的笔记不会留在检索结果里', async () => {
  const db = fresh();
  const embedder = createMockEmbedder({ dim: 8 });
  const note = createNote(db, { title: '将被删除' });
  upsertEmbedding(db, {
    ownerKind: 'note',
    ownerId: note.id,
    model: 'mock',
    vector: await embedder.embed('将被删除'),
  });
  db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);

  const hits = semanticSearch(db, await embedder.embed('将被删除'), {
    minScore: 0,
  });
  assert.equal(hits.length, 0);
  db.close();
});

// ─────────────────────── 端点与降级 ───────────────────────

test('嵌入端点同样拒绝非本机地址', () => {
  assert.throws(
    () => createEmbedder({ baseUrl: 'https://api.openai.com/v1' }),
    /拒绝向非本机端点/,
  );
});

test('端点不可达时给出可读错误', async () => {
  const embedder = createEmbedder({
    baseUrl: 'http://127.0.0.1:9/v1',
    timeoutMs: 1500,
  });
  await assert.rejects(() => embedder.embed('x'), /确认本地推理服务已启动/);
});

test('模拟嵌入器可重复：相同输入给相同向量', async () => {
  const e = createMockEmbedder({ dim: 16 });
  const a = await e.embed('一样的内容');
  const b = await e.embed('一样的内容');
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-6);
});
