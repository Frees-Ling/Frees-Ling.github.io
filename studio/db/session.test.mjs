// 编辑会话测试（EDITOR-001）。
//
// 这一条需求是「重启恢复编辑状态」，所以关键在于**真的重启**：
// 用真实文件库关掉再打开，而不是在同一个连接里读一遍就算数。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from './schema.mjs';
import { createNote, deleteNote } from './store.mjs';
import { getSession, saveSession, clearSession } from './session.mjs';

const fresh = () => openDatabase(':memory:');

test('没有会话时返回 null，而不是一个空壳对象', () => {
  const db = fresh();
  assert.equal(getSession(db), null);
  db.close();
});

test('保存后读回，标签与脏标记都还原', () => {
  const db = fresh();
  saveSession(db, {
    title: '草稿',
    body: '# 正文',
    tags: ['甲', '乙'],
    dirty: true,
  });
  const s = getSession(db);
  assert.equal(s.title, '草稿');
  assert.equal(s.body, '# 正文');
  assert.deepEqual(s.tags, ['甲', '乙']);
  assert.equal(s.dirty, true);
  assert.equal(s.noteId, null);
  db.close();
});

test('再次保存是覆盖同一行，不会堆积', () => {
  const db = fresh();
  saveSession(db, { title: '第一次' });
  saveSession(db, { title: '第二次' });
  const rows = db.prepare('SELECT COUNT(*) AS c FROM editor_sessions').get();
  assert.equal(rows.c, 1);
  assert.equal(getSession(db).title, '第二次');
  db.close();
});

test('重启后会话仍在，且未保存的改动一字不少', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sess-'));
  const path = join(dir, 's.db');
  const draft = '# 还没保存的标题\n\n这一段是没点保存就关掉的内容。\n';
  try {
    const first = openDatabase(path);
    saveSession(first, { title: '未保存的草稿', body: draft, dirty: true });
    first.close();

    // 换一个连接就是「重启」：进程重开走的也是这条路径
    const second = openDatabase(path);
    const s = getSession(second);
    assert.equal(s.title, '未保存的草稿');
    assert.equal(s.body, draft, '未保存的正文必须一字不少');
    assert.equal(s.dirty, true, '要记得它是未保存的，界面才好提示');
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('关联的笔记被删除后，草稿仍能恢复并标明已孤立', () => {
  const db = fresh();
  const note = createNote(db, { title: '会被删掉的', body: '', tags: [] });
  saveSession(db, {
    noteId: note.id,
    title: '正在编辑',
    body: '内容',
    dirty: true,
  });

  deleteNote(db, note.id);

  const s = getSession(db);
  assert.equal(s.noteId, null, '不能把已删除的 id 交给前端去请求');
  assert.equal(s.title, '正在编辑');
  assert.equal(s.body, '内容', '删另一条笔记不该连带抹掉正在写的草稿');
  db.close();
});

test('脏标记为假时不会误报成未保存', () => {
  const db = fresh();
  saveSession(db, { title: '已保存的', dirty: false });
  assert.equal(getSession(db).dirty, false);
  db.close();
});

test('清除会话后回到 null', () => {
  const db = fresh();
  saveSession(db, { title: 'x' });
  assert.equal(clearSession(db), true);
  assert.equal(getSession(db), null);
  assert.equal(clearSession(db), false, '重复清除应返回 false');
  db.close();
});

test('超长或格式不对的输入被拒绝', () => {
  const db = fresh();
  assert.throws(() => saveSession(db, { title: 'x'.repeat(501) }), /标题过长/);
  assert.throws(
    () => saveSession(db, { tags: 'not-an-array' }),
    /标签过多或格式不对/,
  );
  assert.throws(
    () => saveSession(db, { tags: Array(201).fill('t') }),
    /标签过多或格式不对/,
  );
  db.close();
});

test('标签里的非字符串元素被剔除，而不是让整次保存失败', () => {
  const db = fresh();
  saveSession(db, { tags: ['正常', 42, null, '也正常'] });
  assert.deepEqual(getSession(db).tags, ['正常', '也正常']);
  db.close();
});

test('库里的标签 JSON 被改坏时返回空数组，不让编辑器打不开', () => {
  const db = fresh();
  saveSession(db, { title: 'x', tags: ['a'] });
  db.prepare(
    "UPDATE editor_sessions SET tags = '不是 JSON' WHERE id = 'current'",
  ).run();
  assert.deepEqual(
    getSession(db).tags,
    [],
    '会话坏了是小事，编辑器打不开是大事',
  );
  db.close();
});

test('空标题空正文可以存 —— 草稿允许不完整', () => {
  const db = fresh();
  // 校验属于「保存笔记」那一步，不属于草稿
  saveSession(db, { title: '', body: '', tags: [], dirty: true });
  const s = getSession(db);
  assert.equal(s.title, '');
  assert.equal(s.body, '');
  db.close();
});
