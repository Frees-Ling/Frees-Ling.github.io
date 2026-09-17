// 原始档案导入测试（ARCH-001）。
//
// 这一层的失败方式是**静默丢失**：丢一条不报错，只会在几个月后想查某段原始
// 内容时才发现它从来没进来过。所以用例集中在「丢了会不会被发现」。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../db/schema.mjs';
import { proposeMemory } from '../db/store.mjs';
import {
  importMarkdown,
  importJson,
  importFile,
  importDirectory,
  findConflicts,
} from './import.mjs';

const fresh = () => openDatabase(':memory:');
const count = (db) =>
  db.prepare('SELECT COUNT(*) AS c FROM archive_entries').get().c;

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 幂等：这是最要紧的一条 ──

test('同一段内容导两次只留一条', () => {
  const db = fresh();
  const a = importMarkdown(db, { text: '原始内容', source: 'a.md' });
  assert.equal(a.deduped, false);
  const b = importMarkdown(db, { text: '原始内容', source: 'a.md' });
  assert.equal(b.deduped, true, '第二次必须报「去重了」而不是又插一条');
  assert.equal(count(db), 1);
  db.close();
});

test('导十次仍然只有一条 —— 幂等不是「大概不重复」', () => {
  const db = fresh();
  for (let i = 0; i < 10; i++) {
    importMarkdown(db, { text: '重复导入同一份', source: 'x' });
  }
  assert.equal(count(db), 1);
  db.close();
});

test('内容变了则另存一条，两条都留着', () => {
  const db = fresh();
  importMarkdown(db, { text: '第一版', source: 'doc.md' });
  importMarkdown(db, { text: '第二版', source: 'doc.md' });
  assert.equal(count(db), 2, '底档不能被覆盖 —— 覆盖就不叫底档了');
  db.close();
});

test('行尾与结尾空白不算新版本（传输产物，不是内容差异）', () => {
  const db = fresh();
  importMarkdown(db, { text: '内容', source: 'a' });
  importMarkdown(db, { text: '内容\n\n', source: 'a' });
  assert.equal(count(db), 1, '结尾换行是编辑器与导出工具最常见的差异');

  importMarkdown(db, { text: '内容', source: 'b' });
  importMarkdown(db, { text: '内容\r\n', source: 'b' });
  assert.equal(count(db), 2, 'CRLF 与 LF 是同一份内容，第二个来源不该多出一条');
  db.close();
});

test('**行首**空白算内容差异 —— 在 Markdown 里它是缩进代码块', () => {
  // 归一化只该吃掉传输产物，不该吃掉内容。行首空格在 Markdown 里有语义，
  // 抹掉它等于把「缩进代码块」变成普通段落 —— 那是篡改，不是去重。
  const db = fresh();
  importMarkdown(db, { text: '内容', source: 'a' });
  importMarkdown(db, { text: '    内容', source: 'a' });
  assert.equal(count(db), 2, '行首缩进必须被当成不同的内容');
  db.close();
});

// ── 遗漏必须被看见 ──

test('空内容被拒绝，而不是悄悄存一条空的', () => {
  const db = fresh();
  assert.throws(
    () => importMarkdown(db, { text: '', source: 'a' }),
    /内容为空/,
  );
  assert.throws(
    () => importMarkdown(db, { text: '   \n', source: 'a' }),
    /内容为空/,
  );
  assert.equal(count(db), 0);
  db.close();
});

test('JSON 里缺内容的条目被记进 errors，而不是静默跳过', () => {
  const db = fresh();
  const r = importJson(db, {
    data: [{ content: '好的' }, { 没有内容字段: 1 }, { content: '也好' }],
    source: 'batch.json',
  });
  assert.equal(r.imported, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /第 2 条/, '要能定位到是哪一条');
  db.close();
});

test('不认识的 kind 归为 document，而不是中断整批', () => {
  const db = fresh();
  const r = importJson(db, {
    data: [{ content: 'a', kind: '莫名其妙的类型' }, { content: 'b' }],
    source: 's',
  });
  assert.equal(r.imported, 2);
  const kinds = db.prepare('SELECT DISTINCT kind FROM archive_entries').all();
  assert.deepEqual(
    kinds.map((k) => k.kind),
    ['document'],
  );
  db.close();
});

test('batch 里超量被拒绝', () => {
  const db = fresh();
  assert.throws(
    () =>
      importJson(db, { data: Array(5001).fill({ content: 'x' }), source: 's' }),
    /一次最多导入/,
  );
  db.close();
});

// ── 来源与时间 ──

test('每条档案都留下来源与时间', () => {
  const db = fresh();
  importMarkdown(db, { text: '内容', source: '某次对话导出' });
  const row = db.prepare('SELECT * FROM archive_entries').get();
  assert.equal(row.source, '某次对话导出');
  assert.ok(row.created_at, '时间是底档的一半价值');
  db.close();
});

test('JSON 的 source 缺省时从外层继承', () => {
  const db = fresh();
  importJson(db, { data: [{ content: 'a' }], source: '外层来源' });
  assert.equal(
    db.prepare('SELECT source FROM archive_entries').get().source,
    '外层来源',
  );
  db.close();
});

// ── 文件与目录 ──

test('按扩展名分派：JSON 走结构化，其余按 Markdown', () => {
  withDir((dir) => {
    const db = fresh();
    writeFileSync(join(dir, 'a.md'), '# 标题\n\n正文');
    writeFileSync(
      join(dir, 'b.json'),
      JSON.stringify([{ content: '一' }, { content: '二' }]),
    );
    writeFileSync(join(dir, 'c.txt'), '没有扩展名约定也要能进');

    assert.equal(importFile(db, { path: join(dir, 'a.md') }).imported, 1);
    assert.equal(importFile(db, { path: join(dir, 'b.json') }).imported, 2);
    assert.equal(
      importFile(db, { path: join(dir, 'c.txt') }).imported,
      1,
      '不认识的扩展名按 Markdown 处理，而不是拒绝 —— 「因为扩展名不认识所以没导入」很难被发现',
    );
    assert.equal(count(db), 4);
    db.close();
  });
});

test('坏 JSON 明确报错，而不是当成 Markdown 塞进去', () => {
  withDir((dir) => {
    const db = fresh();
    writeFileSync(join(dir, 'bad.json'), '{ 这不是 JSON');
    assert.throws(
      () => importFile(db, { path: join(dir, 'bad.json') }),
      /不是合法 JSON/,
    );
    assert.equal(count(db), 0);
    db.close();
  });
});

test('目录是增量导入的：第二次跑一条也不新增', () => {
  withDir((dir) => {
    const db = fresh();
    writeFileSync(join(dir, '一.md'), '内容一');
    mkdirSync(join(dir, '子目录'));
    writeFileSync(join(dir, '子目录', '二.md'), '内容二');

    const first = importDirectory(db, { dir });
    assert.equal(first.imported, 2);
    assert.equal(first.files, 2);

    const second = importDirectory(db, { dir });
    assert.equal(second.imported, 0, '第二次不该新增');
    assert.equal(second.deduped, 2, '两条都应报成「已有」');
    assert.equal(count(db), 2);
    db.close();
  });
});

test('新增一个文件后再跑，只导入新的那个', () => {
  withDir((dir) => {
    const db = fresh();
    writeFileSync(join(dir, '旧.md'), '旧内容');
    importDirectory(db, { dir });

    writeFileSync(join(dir, '新.md'), '新内容');
    const r = importDirectory(db, { dir });
    assert.equal(r.imported, 1);
    assert.equal(r.deduped, 1);
    assert.equal(count(db), 2);
    db.close();
  });
});

test('不跟随符号链接 —— 一个链接会把整个家目录卷进来', () => {
  withDir((dir) => {
    const db = fresh();
    mkdirSync(join(dir, 'real'));
    writeFileSync(join(dir, 'real', 'a.md'), '真实内容');
    try {
      symlinkSync('/etc', join(dir, '外链'));
      symlinkSync('/etc/hosts', join(dir, 'hosts.md'));
    } catch {
      db.close();
      return; // 某些环境不允许建链接，跳过
    }

    const r = importDirectory(db, { dir });
    assert.equal(r.files, 1, '只该看到 real/a.md');
    assert.equal(count(db), 1);
    db.close();
  });
});

test('单个文件出错不中断整批，但会被记下来', () => {
  withDir((dir) => {
    const db = fresh();
    writeFileSync(join(dir, '好.md'), '好的');
    writeFileSync(join(dir, '坏.json'), '{ 坏的');
    const r = importDirectory(db, { dir });
    assert.equal(r.imported, 1);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /坏\.json/);
    db.close();
  });
});

// ── 冲突 ──

test('同一来源的多个版本被指出来', () => {
  const db = fresh();
  importMarkdown(db, { text: '第一版', source: '导出.json' });
  importMarkdown(db, { text: '第二版', source: '导出.json' });
  importMarkdown(db, { text: '只有一版', source: '别的.json' });

  const conflicts = findConflicts(db);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].source, '导出.json');
  assert.equal(conflicts[0].versions, 2);
  db.close();
});

test('只有一个来源版本时报没有冲突', () => {
  const db = fresh();
  importMarkdown(db, { text: 'a', source: 'x' });
  importMarkdown(db, { text: 'b', source: 'y' });
  assert.deepEqual(findConflicts(db), []);
  db.close();
});

// ── 与记忆层的关系：档是档，摘要是摘要 ──

test('档案与记忆分开存放，删掉记忆不影响档案', () => {
  const db = fresh();
  importMarkdown(db, { text: '一段原始对话', source: 'convo' });
  const entry = db.prepare('SELECT * FROM archive_entries').get();

  const mem = proposeMemory(db, {
    content: '从那段对话里提取的结论',
    sourceEntryId: entry.id,
  });
  db.prepare('DELETE FROM memories WHERE id = ?').run(mem.id);

  assert.equal(
    count(db),
    1,
    '删摘要不该动到底档 —— 底档不可被摘要替代，也不该被它连累',
  );
  db.close();
});

test('记忆可以指向档案，但档案不因记忆而改变', () => {
  const db = fresh();
  importMarkdown(db, { text: '原始内容', source: 's' });
  const entry = db.prepare('SELECT * FROM archive_entries').get();
  const before = { ...entry };

  proposeMemory(db, { content: '结论', sourceEntryId: entry.id });
  const after = db.prepare('SELECT * FROM archive_entries').get();
  // 摊平成普通对象再比：node:sqlite 返回的是 null 原型对象，
  // 直接 deepEqual 会因为原型不同而失败，看起来像「内容变了」但实际没有
  assert.deepEqual({ ...after }, before);
  db.close();
});
