// WebDAV 传输层跑传输契约（WEBDAV-001）。
//
// 与 `local-transport.test.mjs` 用**同一套用例**（`runConformance`）。
// 这正是这套用例存在的理由：两个实现的后端毫无共同点 ——
// 一个有 HTTP / XML / href / URL 编码，另一个只有文件系统 ——
// 而它们要满足的行为必须是同一份。
//
// 如果只测一个实现，「传输层可替换」就永远只是一句话：
// 代码路径全长在其一的形状上，而没有人会察觉。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWebdav } from './webdav.mjs';
import { createMockWebdav } from './mock-webdav.mjs';
import { runConformance } from './transport-conformance.mjs';
import { strictTransport } from './transport.mjs';
import { runBackup, runRetention } from './remote.mjs';
import { openDatabase } from '../db/schema.mjs';
import { createNote } from '../db/store.mjs';

const PASS = 'correct horse battery staple';

runConformance('WebDAV', async () => {
  const mock = createMockWebdav();

  // 根目录**之外**的哨兵。真实服务端会规范化 `..`，
  // 所以一个穿越成功的路径最终会落到 `/evil` —— 也就是它头上。
  mock.files.set('/evil', Buffer.from('must not be touched'));

  const baseUrl = await mock.start();
  return {
    transport: createWebdav({ baseUrl, username: 'u', password: 'p' }),
    outside: { exists: () => mock.files.has('/evil') },
    cleanup: () => mock.close(),
  };
});

// ── 下面两条是「可替换」这句话真正的验证 ──

test('编排在**只放行四个方法**的代理下照常工作', async () => {
  // strictTransport 会在编排调用第五个方法时抛错。
  // runBackup 与 runRetention 能跑完，就等于证明了
  // 「编排不认识具体传输协议」这件事 —— 而不是声称它。
  const mock = createMockWebdav();
  const baseUrl = await mock.start();
  const raw = createWebdav({ baseUrl, username: 'u', password: 'p' });
  const t = strictTransport(raw, '被监视的 WebDAV');

  const db = openDatabase(':memory:');
  createNote(db, { title: '标题', body: '正文', tags: [] });

  try {
    const res = await runBackup({
      db,
      webdav: t,
      dir: '/backups',
      passphrase: PASS,
    });
    assert.equal(res.verified, true);

    const plan = await runRetention({
      webdav: t,
      dir: '/backups',
      keep: 5,
      dryRun: false,
    });
    assert.equal(plan.total, 1);
  } finally {
    db.close();
    await mock.close();
  }
});

test('把本地目录当传输层，备份与保留策略**一行编排代码都不用改**', async () => {
  // 这是整个 WEBDAV-001 里最要紧的一条断言。
  //
  // 123 云盘的 WebDAV 是会员功能、没有官方协议文档、专用密码的权限边界
  // 未知（见 docs/research/webdav-provider.md）—— 也就是说
  // 「三个 endpoint 用独立凭据最小权限隔离」这个架构设想**可能不成立**。
  // 一旦不成立就得换传输协议，而那时唯一的问题是代价多大。
  //
  // 这条用例给出的答案是：`runBackup` / `runRetention` 的调用方
  // 只把 `webdav` 换成另一个对象，其余一字未动。
  const { createLocalTransport, ensureRoot } =
    await import('./local-transport.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const base = mkdtempSync(join(tmpdir(), 'frees-swap-'));
  const root = ensureRoot(join(base, 'root'));
  ensureRoot(join(root, 'backups'));
  const local = strictTransport(createLocalTransport({ root }), '本地传输层');

  const db = openDatabase(':memory:');
  createNote(db, { title: '标题', body: '正文', tags: [] });

  try {
    const res = await runBackup({
      db,
      webdav: local,
      dir: '/backups',
      passphrase: PASS,
    });
    assert.equal(res.verified, true, '回读校验必须通过');
    assert.equal(res.counts.notes, 1);

    const plan = await runRetention({
      webdav: local,
      dir: '/backups',
      keep: 5,
      dryRun: false,
    });
    assert.equal(plan.total, 1);
    assert.deepEqual(plan.delete, [], '只有一份时要保留它');
  } finally {
    db.close();
    rmSync(base, { recursive: true, force: true });
  }
});
