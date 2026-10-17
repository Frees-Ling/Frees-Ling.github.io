// 本地传输层测试（WEBDAV-001）。
//
// 除了跑传输契约的一致性用例，这里还要证明一件契约本身证明不了的事：
// **它确实是一个「和 WebDAV 毫无共同点」的后端** ——
// 没有 HTTP、没有 XML、没有 href、没有 URL 编码。
// 「可替换」如果只在两个长得像的实现之间成立，那不算数。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalTransport, ensureRoot } from './local-transport.mjs';
import {
  assertTransport,
  strictTransport,
  TRANSPORT_METHODS,
} from './transport.mjs';
import { runConformance } from './transport-conformance.mjs';

function freshRoot() {
  return mkdtempSync(join(tmpdir(), 'frees-transport-'));
}

// ── 一致性用例（与 WebDAV 实现共用同一套） ──

runConformance('本地目录', async () => {
  const base = freshRoot();
  const root = join(base, 'root');
  ensureRoot(join(root, 'backups'));

  // 根目录**之外**的哨兵。越界用例靠它判断 ——
  // 一个躺在根旁边、任何穿越路径都不该够得到的文件
  const sentinel = join(base, 'outside-sentinel.txt');
  writeFileSync(sentinel, 'must not be touched');

  return {
    transport: createLocalTransport({ root }),
    outside: { exists: () => existsSync(sentinel) },
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
});

// ── 下面是这个实现特有的性质 ──

test('路径越界在**文件系统层**被二次拦住', async () => {
  const root = freshRoot();
  ensureRoot(join(root, 'backups'));
  const t = createLocalTransport({ root });

  // 一个真实存在的文件，位于根目录之外
  const outside = join(root, '..', 'outside-secret.txt');
  writeFileSync(outside, 'secret');

  // `..` 字面量在逐段检查时就被拒了；这条用例确认它**没有**走到
  // 文件系统调用那一步（否则就真的动了那个文件）
  await assert.rejects(() => t.del('/backups/../outside-secret.txt'), /点号段/);
  assert.ok(existsSync(outside), '根目录外的文件必须原封不动');

  rmSync(outside, { force: true });
  rmSync(root, { recursive: true, force: true });
});

test('list 只返回文件，不返回子目录', async () => {
  const root = freshRoot();
  ensureRoot(join(root, 'backups'));
  const t = createLocalTransport({ root });

  await t.put('/backups/a.bin', Buffer.from('1'));
  mkdirSync(join(root, 'backups', 'subdir'));

  const names = await t.list('/backups');
  assert.deepEqual(names, ['a.bin'], '子目录不该出现在备份列举结果里');
  rmSync(root, { recursive: true, force: true });
});

// ── 契约本身 ──

test('assertTransport 列出缺哪个方法，而不是只说「不合法」', () => {
  assert.throws(
    () => assertTransport({ put() {}, get() {} }, '半成品'),
    (err) => err.message.includes('list') && err.message.includes('del'),
  );
});

test('strictTransport 放行四个方法，拦住第五个', async () => {
  const root = freshRoot();
  ensureRoot(join(root, 'backups'));
  const t = strictTransport(createLocalTransport({ root }), '被监视的传输层');

  // 四个方法都能用
  await t.put('/backups/x.bin', Buffer.from('x'));
  assert.ok((await t.get('/backups/x.bin')).equals(Buffer.from('x')));
  assert.deepEqual(await t.list('/backups'), ['x.bin']);
  assert.equal(await t.del('/backups/x.bin'), true);

  // 第五个立刻抛错 —— 这就是「编排不认识具体传输协议」的可执行版本
  assert.throws(() => t.mkcol, /契约之外的方法/);
  assert.throws(() => t.stat, /契约之外的方法/);

  rmSync(root, { recursive: true, force: true });
});

test('契约的方法清单是冻结的，改不动', () => {
  assert.ok(Object.isFrozen(TRANSPORT_METHODS));
  assert.deepEqual([...TRANSPORT_METHODS], ['put', 'get', 'list', 'del']);
});
