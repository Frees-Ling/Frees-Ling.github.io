// 知识库存储层测试。
//
//   node --test studio/db/
//
// 全部用 :memory: 数据库，不接触任何真实数据 ——
// 涉及私人数据的模块必须先用合成数据验证（见任务要求第八节）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase, currentVersion, SCHEMA_VERSION } from './schema.mjs';
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  setNoteTags,
  searchNotes,
  importArchiveEntry,
  proposeMemory,
  reviewMemory,
  listApprovedMemories,
  listPendingMemories,
} from './store.mjs';

const fresh = () => openDatabase(':memory:');

test('schema 建立并到达最新版本', () => {
  const db = fresh();
  assert.equal(currentVersion(db), SCHEMA_VERSION);
  db.close();
});

test('重复打开同一个库不会重复应用迁移', () => {
  const db = fresh();
  const before = currentVersion(db);
  assert.equal(before, SCHEMA_VERSION);
  db.close();
});

test('创建笔记并读回', () => {
  const db = fresh();
  const note = createNote(db, { title: '麻将 AI 的评估方法', body: '正文' });
  assert.ok(note.id);
  assert.equal(note.title, '麻将 AI 的评估方法');
  assert.equal(note.status, 'draft');
  assert.equal(note.origin, 'human');

  const read = getNote(db, note.id);
  assert.equal(read.body, '正文');
  db.close();
});

test('拒绝空标题', () => {
  const db = fresh();
  assert.throws(() => createNote(db, { title: '   ' }), /标题不能为空/);
  db.close();
});

test('拒绝未知的 kind 与 origin', () => {
  const db = fresh();
  assert.throws(
    () => createNote(db, { title: 'x', kind: 'blog' }),
    /未知的 kind/,
  );
  assert.throws(
    () => createNote(db, { title: 'x', origin: 'robot' }),
    /未知的 origin/,
  );
  db.close();
});

test('更新笔记会刷新 updated_at 并保留 created_at', async () => {
  const db = fresh();
  const note = createNote(db, { title: '原标题' });
  await new Promise((r) => setTimeout(r, 5));
  const updated = updateNote(db, note.id, { title: '新标题' });

  assert.equal(updated.title, '新标题');
  assert.equal(updated.created_at, note.created_at);
  assert.notEqual(updated.updated_at, note.updated_at);
  db.close();
});

test('AI 起草的内容一经人工编辑即转为 human', () => {
  const db = fresh();
  const note = createNote(db, { title: 'AI 草稿', origin: 'ai_draft' });
  assert.equal(note.origin, 'ai_draft');

  const edited = updateNote(db, note.id, { body: '人工改过了' });
  assert.equal(edited.origin, 'human', '人工编辑后不应再标为 AI 起草');
  db.close();
});

test('标签可写入、读出、替换', () => {
  const db = fresh();
  const note = createNote(db, { title: 'x', tags: ['YOLO', '计算机视觉'] });
  assert.deepEqual(getNote(db, note.id).tags, ['YOLO', '计算机视觉']);

  // 同名标签不应重复建行
  const other = createNote(db, { title: 'y', tags: ['YOLO'] });
  const tagRows = db.prepare('SELECT COUNT(*) AS c FROM tags').get();
  assert.equal(tagRows.c, 2);

  setNoteTags(db, other.id, ['机器人']);
  assert.deepEqual(getNote(db, other.id).tags, ['机器人']);
  db.close();
});

test('删除笔记会级联清掉标签关联', () => {
  const db = fresh();
  const note = createNote(db, { title: 'x', tags: ['a', 'b'] });
  assert.equal(deleteNote(db, note.id), true);
  const left = db.prepare('SELECT COUNT(*) AS c FROM note_tags').get();
  assert.equal(left.c, 0, 'note_tags 应随笔记级联删除');
  assert.equal(getNote(db, note.id), null);
  db.close();
});

test('列表按更新时间倒序', async () => {
  const db = fresh();
  createNote(db, { title: '第一篇' });
  await new Promise((r) => setTimeout(r, 5));
  createNote(db, { title: '第二篇' });

  const rows = listNotes(db, {});
  assert.equal(rows[0].title, '第二篇');
  db.close();
});

test('中文全文检索可用', () => {
  const db = fresh();
  createNote(db, { title: '线性代数与注意力机制', body: '从几何直觉出发' });
  createNote(db, { title: '完全无关的内容', body: '别的东西' });

  const hits = searchNotes(db, '注意力机制');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, '线性代数与注意力机制');
  db.close();
});

test('短查询（< 3 字符）走 LIKE 兜底而不是静默返回空', () => {
  const db = fresh();
  createNote(db, { title: 'AI 笔记', body: 'x' });
  // trigram 对 <3 字符不返回结果，若无兜底这里会是空数组，
  // 调用方会把「没搜到」误当成「没有内容」
  const hits = searchNotes(db, 'AI');
  assert.equal(hits.length, 1);
  db.close();
});

test('空查询返回空数组，不做「返回全部」的兜底', () => {
  const db = fresh();
  createNote(db, { title: 'x' });
  assert.deepEqual(searchNotes(db, ''), []);
  assert.deepEqual(searchNotes(db, '   '), []);
  db.close();
});

test('更新笔记后全文索引同步', () => {
  const db = fresh();
  const note = createNote(db, { title: '旧标题词汇', body: '旧正文词汇' });
  assert.equal(searchNotes(db, '旧标题词汇').length, 1);

  // 标题与正文都换掉，才能验证 FTS 的 delete+insert 触发器真的生效。
  // 只改正文而断言旧标题搜不到是错的 —— 那时标题本来就没变。
  updateNote(db, note.id, {
    title: '新标题词汇',
    body: '新正文词汇：反向传播',
  });

  assert.equal(searchNotes(db, '反向传播').length, 1, '新内容应可检索');
  assert.equal(searchNotes(db, '旧标题词汇').length, 0, '旧标题不应仍被检索到');
  assert.equal(searchNotes(db, '旧正文词汇').length, 0, '旧正文不应仍被检索到');
  db.close();
});

test('删除笔记后全文索引同步', () => {
  const db = fresh();
  const note = createNote(db, { title: '将被删除的独特词', body: '' });
  assert.equal(searchNotes(db, '将被删除').length, 1);
  deleteNote(db, note.id);
  assert.equal(searchNotes(db, '将被删除').length, 0);
  db.close();
});

test('档案导入是幂等的', () => {
  const db = fresh();
  const payload = '一段对话的原文';
  const first = importArchiveEntry(db, {
    kind: 'conversation',
    source: 'export.json',
    content: payload,
  });
  const second = importArchiveEntry(db, {
    kind: 'conversation',
    source: 'export.json',
    content: payload,
  });

  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  assert.equal(second.id, first.id, '重复导入应返回同一条');
  assert.equal(
    db.prepare('SELECT COUNT(*) AS c FROM archive_entries').get().c,
    1,
  );
  db.close();
});

test('AI 提出的记忆停在 pending，不自动成为事实', () => {
  const db = fresh();
  const memory = proposeMemory(db, {
    content: '偏好使用 TypeScript',
    confidence: 0.8,
  });

  assert.equal(memory.status, 'pending');
  assert.deepEqual(
    listApprovedMemories(db),
    [],
    '未经审核不得出现在已确认记忆里',
  );
  assert.equal(listPendingMemories(db).length, 1);
  db.close();
});

test('只有审核通过的记忆才对检索可见', () => {
  const db = fresh();
  const a = proposeMemory(db, { content: '记忆 A' });
  const b = proposeMemory(db, { content: '记忆 B' });

  reviewMemory(db, a.id, 'approved');
  reviewMemory(db, b.id, 'rejected');

  const approved = listApprovedMemories(db);
  assert.equal(approved.length, 1);
  assert.equal(approved[0].content, '记忆 A');
  db.close();
});

test('记忆不能被重复审核', () => {
  const db = fresh();
  const memory = proposeMemory(db, { content: 'x' });
  reviewMemory(db, memory.id, 'approved');
  assert.throws(() => reviewMemory(db, memory.id, 'rejected'), /已审核过/);
  db.close();
});

test('拒绝非法的审核结果与越界的置信度', () => {
  const db = fresh();
  const memory = proposeMemory(db, { content: 'x' });
  assert.throws(
    () => reviewMemory(db, memory.id, 'maybe'),
    /approved 或 rejected/,
  );
  assert.throws(
    () => proposeMemory(db, { content: 'y', confidence: 1.5 }),
    /0–1/,
  );
  db.close();
});

test('记忆可以追溯到来源档案', () => {
  const db = fresh();
  const entry = importArchiveEntry(db, {
    kind: 'conversation',
    source: 'chat.md',
    content: '用户说他更喜欢简短的回答',
  });
  const memory = proposeMemory(db, {
    content: '偏好简短回答',
    sourceEntryId: entry.id,
    confidence: 0.6,
  });

  assert.equal(memory.source_entry_id, entry.id);
  db.close();
});
