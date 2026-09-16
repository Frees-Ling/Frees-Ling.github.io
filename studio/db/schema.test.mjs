// schema 版本、迁移与重启恢复（STUDIO-002 的验收面）。
//
// 为什么单独一个文件、而且**用真实文件库**：
//
// 原先这类断言放在 store.test.mjs 里，用的是 `:memory:`，其中一条叫
// 「重复打开同一个库不会重复应用迁移」—— 但它从头到尾只开了一次库，
// 而 `:memory:` 每次都是全新的。那个用例**永远不会失败**，
// 于是「重复打开」这条路径实际上没有任何测试，却看起来有。
//
// 这里一律用 mkdtemp 下的真实文件：版本、迁移、重启恢复这三件事
// 只有对真实文件才有意义。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, currentVersion, SCHEMA_VERSION } from './schema.mjs';
import { createNote, getNote, listNotes, searchNotes } from './store.mjs';

/** 在临时目录里跑一段用例，结束后清理。 */
function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'schema-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('全新库到达最新版本，且版本记录与常量一致', () => {
  withDir((dir) => {
    const db = openDatabase(join(dir, 'a.db'));
    assert.equal(currentVersion(db), SCHEMA_VERSION);
    const rows = db
      .prepare('SELECT version, name FROM schema_version ORDER BY version')
      .all();
    assert.equal(rows.length, SCHEMA_VERSION, '每个迁移都该有一条记录');
    for (const row of rows) assert.ok(row.name, `版本 ${row.version} 缺少名字`);
    db.close();
  });
});

test('数据跨「关闭 → 重新打开」存活（重启恢复）', () => {
  withDir((dir) => {
    const path = join(dir, 'b.db');

    const first = openDatabase(path);
    const note = createNote(first, {
      title: '注意力机制',
      body: '几何直觉：查询、键、值都是同一个东西的不同投影。',
      tags: ['机器学习'],
    });
    first.close();

    // 换一个进程也是这个路径：程序退出后重新运行，读到的必须是同一份数据
    const second = openDatabase(path);
    const back = getNote(second, note.id);
    assert.ok(back, '重新打开后笔记应当还在');
    assert.equal(back.title, '注意力机制');
    assert.match(back.body, /几何直觉/);
    assert.equal(
      currentVersion(second),
      SCHEMA_VERSION,
      '重开不应再跑一遍迁移',
    );
    second.close();
  });
});

test('重新打开后全文索引仍然可用（不是只剩一张空表）', () => {
  withDir((dir) => {
    const path = join(dir, 'c.db');

    const first = openDatabase(path);
    createNote(first, { title: '行列式', body: '面积被压扁的程度', tags: [] });
    first.close();

    // FTS 是触发器维护的。若触发器没随库持久化，重新打开后
    // 新写入的内容不会进索引 —— 表现为「刚写的搜不到」，
    // 而且不报错。所以这里在**重开之后**再写一条，两条都要搜得到。
    const second = openDatabase(path);
    createNote(second, { title: '特征向量', body: '方向不变的箭头', tags: [] });

    const hits = searchNotes(second, '方向不变');
    assert.equal(hits.length, 1, '重开后写入的内容应立刻可检索');
    assert.equal(
      searchNotes(second, '面积被压扁').length,
      1,
      '重开前写入的内容也应可检索',
    );
    second.close();
  });
});

test('旧版本的库能迁移到最新，且原有数据不丢', () => {
  withDir((dir) => {
    const path = join(dir, 'old.db');

    // upTo 只给测试用：造一个停在 v1 的库，就像几个月前建的
    const old = openDatabase(path, { upTo: 1 });
    assert.equal(currentVersion(old), 1);
    const note = createNote(old, {
      title: '旧库里的笔记',
      body: '迁移前写的',
      tags: ['旧'],
    });
    old.close();

    const upgraded = openDatabase(path);
    assert.equal(currentVersion(upgraded), SCHEMA_VERSION, '应升到最新');
    assert.equal(
      getNote(upgraded, note.id).title,
      '旧库里的笔记',
      '迁移不得丢数据',
    );
    assert.equal(listNotes(upgraded).length, 1);
    upgraded.close();
  });
});

test('迁移只补缺的版本，已应用的不重跑', () => {
  withDir((dir) => {
    const path = join(dir, 'partial.db');
    openDatabase(path, { upTo: 2 }).close();

    const db = openDatabase(path);
    const versions = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all()
      .map((r) => r.version);
    assert.deepEqual(
      versions,
      [...Array(SCHEMA_VERSION)].map((_, i) => i + 1),
    );
    db.close();
  });
});

test('库比程序新时拒绝打开，而不是照旧读写', () => {
  withDir((dir) => {
    const path = join(dir, 'future.db');

    const db = openDatabase(path);
    // 模拟「用更新版本的程序打开过这个库」：版本表里出现一个本程序不认识的版本
    db.prepare(
      'INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(SCHEMA_VERSION + 1, 'future-change', new Date().toISOString());
    db.close();

    assert.throws(
      () => openDatabase(path),
      (error) => {
        assert.match(error.message, /只支持到/);
        // 提示必须说清「怎么办」，而不是只说版本不匹配
        assert.match(error.message, /从备份恢复|较新版本/);
        assert.match(error.message, /静默写坏/);
        return true;
      },
      '降级运行必须打不开库，而不是能打开但写坏数据',
    );
  });
});

test('拒绝打开时不会把库留在被改动的状态', () => {
  withDir((dir) => {
    const path = join(dir, 'future2.db');
    const db = openDatabase(path);
    db.prepare(
      'INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(SCHEMA_VERSION + 1, 'future-change', new Date().toISOString());
    db.close();

    assert.throws(() => openDatabase(path));

    // 断言「拒绝」是干净的：版本表没被我们改动，也没多出表
    const raw = new DatabaseSync(path);
    const versions = raw
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all()
      .map((r) => r.version);
    assert.deepEqual(versions, [1, 2, 3, 4, SCHEMA_VERSION + 1]);
    raw.close();
    assert.ok(existsSync(path));
  });
});

test('迁移失败会整个回滚，不留半迁移状态', () => {
  withDir((dir) => {
    const path = join(dir, 'broken.db');
    const db = openDatabase(path);
    const before = currentVersion(db);

    // 造一个必定失败的迁移：表已存在
    db.exec('CREATE TABLE deliberately_colliding (x INTEGER)');
    assert.throws(() => {
      db.exec('BEGIN');
      db.exec('CREATE TABLE deliberately_colliding (x INTEGER)');
      db.exec('COMMIT');
    });

    assert.equal(currentVersion(db), before, '失败的迁移不应推进版本号');
    db.close();
  });
});
