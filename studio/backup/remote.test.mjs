// 备份编排与保留策略测试（KB-011）。
//
// 用内存版模拟 WebDAV —— 它验证不了「真实服务会不会接受我们的请求」，
// 但能验证「我们发出去的东西对不对、回读校验有没有用、保留策略会不会删过头」。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../db/schema.mjs';
import { createNote, proposeMemory, reviewMemory } from '../db/store.mjs';
import { createWebdav, webdavConfigFromEnv } from './webdav.mjs';
import { createMockWebdav } from './mock-webdav.mjs';
import {
  runBackup,
  runRetention,
  applyRetention,
  backupName,
} from './remote.mjs';
import { decrypt } from './crypto.mjs';

const PASS = 'correct horse battery staple';

function seedDb() {
  const db = openDatabase(':memory:');
  createNote(db, {
    title: '注意力机制笔记',
    body: '几何直觉',
    tags: ['机器学习'],
  });
  const m = proposeMemory(db, { content: '先看几何直觉' });
  reviewMemory(db, m.id, 'approved');
  return db;
}

async function withMock(fn) {
  const mock = createMockWebdav();
  const baseUrl = await mock.start();
  const webdav = createWebdav({ baseUrl, username: 'u', password: 'p' });
  try {
    await fn({ mock, webdav });
  } finally {
    await mock.close();
  }
}

// ─────────────────────── 配置 ───────────────────────

test('缺少 WebDAV 配置时明确列出缺哪些，并说明不要写进文件', () => {
  assert.throws(
    () => webdavConfigFromEnv({}),
    (e) => {
      assert.match(e.message, /FREES_WEBDAV_URL/);
      assert.match(e.message, /不要写进文件/);
      return true;
    },
  );
});

test('配置从环境变量读取并去掉尾部斜杠', () => {
  const cfg = webdavConfigFromEnv({
    FREES_WEBDAV_URL: 'https://dav.example.com/',
    FREES_WEBDAV_USER: 'u',
    FREES_WEBDAV_PASSWORD: 'p',
  });
  assert.equal(cfg.baseUrl, 'https://dav.example.com');
  assert.equal(cfg.dir, '/backups');
});

// ─────────────────────── 客户端 ───────────────────────

test('凭证错误时服务端拒绝', async () => {
  await withMock(async ({ mock, webdav }) => {
    const wrong = createWebdav({
      baseUrl: `http://127.0.0.1:${mock.server.address().port}`,
      username: 'u',
      password: 'wrong',
    });
    await assert.rejects(() => wrong.get('/backups/x'), /下载失败（HTTP 401）/);
  });
});

test('上传到不存在的目录时给出可操作提示，而不是静默建目录', async () => {
  await withMock(async ({ mock, webdav }) => {
    const base = `http://127.0.0.1:${mock.server.address().port}`;
    const w = createWebdav({ baseUrl: base, username: 'u', password: 'p' });
    await assert.rejects(
      () => w.put('/nope/x.bin', Buffer.from('x')),
      /远端目录不存在/,
    );
  });
});

test('下载不存在的文件返回 null 而不是抛错', async () => {
  await withMock(async ({ webdav }) => {
    assert.equal(await webdav.get('/backups/none.bin'), null);
  });
});

test('列举返回文件名', async () => {
  await withMock(async ({ webdav }) => {
    await webdav.put('/backups/a.freesbk', Buffer.from('1'));
    await webdav.put('/backups/b.freesbk', Buffer.from('2'));
    const names = await webdav.list('/backups');
    assert.deepEqual(names.sort(), ['a.freesbk', 'b.freesbk']);
  });
});

// ─────────────────────── 备份与回读校验 ───────────────────────

test('备份上传后回读校验通过，且远端内容可解密还原', async () => {
  await withMock(async ({ mock, webdav }) => {
    const db = seedDb();
    const result = await runBackup({
      db,
      webdav,
      dir: '/backups',
      passphrase: PASS,
    });

    assert.equal(result.verified, true);
    assert.equal(result.counts.notes, 1);

    const stored = mock.files.get(`/backups/${result.name}`);
    assert.ok(stored, '远端应有该文件');
    const restored = JSON.parse(decrypt(stored, PASS).toString('utf8'));
    assert.equal(restored.notes.length, 1);
    assert.equal(restored.memories.length, 1);
    db.close();
  });
});

test('远端的备份是加密的：不含明文标题', async () => {
  await withMock(async ({ mock, webdav }) => {
    const db = seedDb();
    const { name } = await runBackup({
      db,
      webdav,
      dir: '/backups',
      passphrase: PASS,
    });
    const stored = mock.files.get(`/backups/${name}`).toString('latin1');
    assert.ok(!stored.includes('注意力机制'), '密文里不应出现明文');
    db.close();
  });
});

test('上传内容被服务端截断时，回读校验必须失败', async () => {
  await withMock(async ({ mock, webdav }) => {
    const db = seedDb();
    // 模拟服务端悄悄截断：PUT 之后把文件改小
    const originalPut = webdav.put.bind(webdav);
    webdav.put = async (path, buf) => {
      const r = await originalPut(
        path,
        buf.subarray(0, Math.floor(buf.length / 2)),
      );
      return r;
    };
    await assert.rejects(
      () => runBackup({ db, webdav, dir: '/backups', passphrase: PASS }),
      /回读的字节与本地不一致/,
    );
    db.close();
  });
});

test('上传后远端文件消失时，回读校验必须失败', async () => {
  await withMock(async ({ mock, webdav }) => {
    const db = seedDb();
    const originalPut = webdav.put.bind(webdav);
    webdav.put = async (path, buf) => {
      const r = await originalPut(path, buf);
      mock.files.delete(path); // 服务端上传成功但没落盘
      return r;
    };
    await assert.rejects(
      () => runBackup({ db, webdav, dir: '/backups', passphrase: PASS }),
      /回读失败/,
    );
    db.close();
  });
});

test('弱口令在上传之前就被拒绝，不产生半份备份', async () => {
  await withMock(async ({ mock, webdav }) => {
    const db = seedDb();
    await assert.rejects(
      () => runBackup({ db, webdav, dir: '/backups', passphrase: 'short' }),
      /至少 12 个字符/,
    );
    assert.equal(mock.files.size, 0, '不应留下任何文件');
    db.close();
  });
});

test('备份名按时间可排序', () => {
  const a = backupName(new Date('2026-09-17T10:00:00Z'));
  const b = backupName(new Date('2026-09-17T11:00:00Z'));
  assert.ok(a < b, '文件名排序应与时间一致，保留策略依赖这一点');
  assert.match(a, /^frees-studio-.*\.freesbk$/);
});

// ─────────────────────── 保留策略 ───────────────────────

test('保留策略默认 dry-run，不删任何东西', async () => {
  await withMock(async ({ mock, webdav }) => {
    for (const n of ['a', 'b', 'c', 'd']) {
      await webdav.put(`/backups/frees-studio-${n}.freesbk`, Buffer.from(n));
    }
    const plan = await runRetention({ webdav, dir: '/backups', keep: 2 });
    assert.equal(plan.dryRun, true);
    assert.deepEqual(plan.delete, [
      'frees-studio-a.freesbk',
      'frees-studio-b.freesbk',
    ]);
    assert.equal(mock.files.size, 4, 'dry-run 不得删除任何文件');
  });
});

test('显式执行时才真的删除', async () => {
  await withMock(async ({ mock, webdav }) => {
    for (const n of ['a', 'b', 'c']) {
      await webdav.put(`/backups/frees-studio-${n}.freesbk`, Buffer.from(n));
    }
    await runRetention({ webdav, dir: '/backups', keep: 1, dryRun: false });
    assert.deepEqual(
      [...mock.files.keys()],
      ['/backups/frees-studio-c.freesbk'],
    );
  });
});

test('永不删除最后一份备份', () => {
  // keep=0 是明显的误配，但即使如此也不能把备份删空 ——
  // 一个没有备份的系统比一个备份太多的系统危险得多
  const plan = applyRetention({ names: ['frees-studio-a.freesbk'], keep: 0 });
  assert.deepEqual(plan.delete, []);
  assert.equal(plan.kept.length, 1);
});

test('保留策略只处理本程序的备份文件', () => {
  const plan = applyRetention({
    names: [
      'frees-studio-a.freesbk',
      'frees-studio-b.freesbk',
      '别人的文件.txt',
      'photo.jpg',
    ],
    keep: 1,
  });
  assert.deepEqual(plan.delete, ['frees-studio-a.freesbk']);
  assert.equal(plan.total, 2, '只统计自己的备份');
});

test('备份数量不超过保留数时不删任何东西', () => {
  const plan = applyRetention({ names: ['frees-studio-a.freesbk'], keep: 5 });
  assert.deepEqual(plan.delete, []);
});
