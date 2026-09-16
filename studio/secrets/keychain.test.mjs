// 钥匙串读取的状态机（SEC-001）。
//
// 用**假的 security 可执行文件**跑真实脚本：锁定、被拒、不存在这三种
// 状态在真机上要么很难造、要么要动用户真实的钥匙串。而它们恰恰是
// 最需要区分的 —— 全报成「取不到」等于让人对着提示猜下一步做什么。
//
// 假 security 通过 PATH 注入，被测的是 scripts/automation/read-credential.sh
// 本身（连同它的看门狗与退出码），不是替身逻辑。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  describeKeychainRef,
  readKeychainRef,
  reasonFor,
} from './keychain.mjs';

/**
 * 造一个假的 security，行为由 mode 决定。
 *
 * **必须是 async 并在 try 里 await**：这个回调是异步的，
 * 若写成 `try { return fn() } finally { 还原环境 }`，finally 会在
 * Promise 结算**之前**就跑掉，于是 PATH 被还原、被测代码用回真的
 * `security`。实测踩过：三个用例全都静默走成了「真钥匙串里没这个条目」，
 * 其中一个还因此「通过」了 —— 通过的原因和它想验的事情毫无关系。
 *
 * 假 security 每次被调用都往 FAKE_MARK 追加一行，用来证明它**真的跑过**。
 */
async function withFakeSecurity(mode, fn, { timeout = 3 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-sec-'));
  const mark = join(dir, 'calls.log');
  writeFileSync(mark, '');
  writeFileSync(
    join(dir, 'security'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_MARK"
case "$FAKE_MODE" in
  ok)      printf '%s' "\${FAKE_VALUE:-secret}"; exit 0 ;;
  missing) exit 44 ;;
  denied)  case " $* " in *" -w "*) exit 1 ;; *) exit 0 ;; esac ;;
  locked)  sleep 30; exit 0 ;;
esac
exit 1
`,
  );
  chmodSync(join(dir, 'security'), 0o755);

  const saved = {
    PATH: process.env.PATH,
    FAKE_MODE: process.env.FAKE_MODE,
    FAKE_MARK: process.env.FAKE_MARK,
    FAKE_VALUE: process.env.FAKE_VALUE,
    CREDENTIAL_READ_TIMEOUT: process.env.CREDENTIAL_READ_TIMEOUT,
  };
  process.env.PATH = `${dir}:${saved.PATH}`;
  process.env.FAKE_MODE = mode;
  process.env.FAKE_MARK = mark;
  // 3 秒：够短（不让测试变慢），又留出余量 —— 机器忙时假 security
  // 的启动可能接近 1 秒，卡在 1 秒上会让「可读」偶发地变成「锁定」，
  // 变成一条时好时坏的用例。锁定那条自己用 lockedTimeout 覆盖成更短的值。
  process.env.CREDENTIAL_READ_TIMEOUT = String(timeout);

  let calls = '';
  const readCalls = () => {
    try {
      calls = readFileSync(mark, 'utf8');
    } catch {
      calls = '';
    }
    return calls;
  };

  try {
    return await fn(readCalls);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 断言假 security 确实被调用过 —— 否则用例可能在验别的路径。 */
function assertFakeRan(readCalls, mode) {
  const calls = readCalls();
  assert.ok(
    calls.includes('find-generic-password'),
    `假 security 没被调用（mode=${mode}）—— 这个用例没有在验它想验的东西`,
  );
}

const REF = { kind: 'keychain', service: 'svc', account: 'acct' };

test('条目可读时状态为 ok，并取到值', async () => {
  await withFakeSecurity('ok', async (readCalls) => {
    process.env.FAKE_VALUE = 'the-value';
    const described = await describeKeychainRef(REF);
    assertFakeRan(readCalls, 'ok');
    assert.equal(described.status, 'ok');

    const read = await readKeychainRef(REF);
    assert.equal(read.status, 'ok');
    assert.equal(read.value, 'the-value');
  });
});

test('条目不存在时报 missing，而不是笼统的「取不到」', async () => {
  await withFakeSecurity('missing', async (readCalls) => {
    const described = await describeKeychainRef(REF);
    assertFakeRan(readCalls, 'missing');
    assert.equal(described.status, 'missing');
    assert.match(described.reason, /没有这个条目/);
    assert.match(described.reason, /存入/, '提示要说清下一步做什么');
  });
});

test('访问被拒只在读取时才发现，描述阶段报的是「条目在」', async () => {
  // 这是**刻意的取舍**，不是遗漏：describe 只做存在性与锁定检查，
  // 不读值，而「被访问控制拒绝」只有在真去读的时候才会暴露。
  // 想要 description 也能报 denied，就必须先把值读出来 ——
  // 那正好毁掉「描述不需要读值」这条性质。
  // 所以：describe 说「条目在、没锁」，read 说「被拒」。两句话都对。
  await withFakeSecurity('denied', async (readCalls) => {
    const described = await describeKeychainRef(REF);
    assertFakeRan(readCalls, 'denied');
    assert.equal(described.status, 'ok', 'describe 不读值，因此看不到拒绝');

    const read = await readKeychainRef(REF);
    assert.equal(read.status, 'denied', '真正去读时才报 denied');
    assert.match(read.reason, /拒绝/);
    assert.equal(Object.hasOwn(read, 'value'), false);
  });
});

test('钥匙串锁定（读取挂起）时由看门狗兜住，报 locked', async () => {
  await withFakeSecurity(
    'locked',
    async (readCalls) => {
      const started = Date.now();
      const described = await describeKeychainRef(REF);
      const elapsed = Date.now() - started;
      assertFakeRan(readCalls, 'locked');
      assert.equal(described.status, 'locked');
      assert.match(described.reason, /锁定/);
      assert.match(described.reason, /解锁/, '提示要给出解锁的办法');
      // 看门狗设的是 1 秒；没有它这里会挂 30 秒
      assert.ok(
        elapsed < 20_000,
        `不该等到子进程自己结束（用了 ${elapsed}ms）`,
      );
    },
    { timeout: 1 },
  );
});

test('describeKeychainRef 的返回里没有 value 字段', async () => {
  await withFakeSecurity('ok', async (readCalls) => {
    process.env.FAKE_VALUE = 'SENTINEL-VALUE';
    const described = await describeKeychainRef(REF);
    assertFakeRan(readCalls, 'ok');
    assert.equal(Object.hasOwn(described, 'value'), false);
    assert.ok(!JSON.stringify(described).includes('SENTINEL-VALUE'));
  });
});

test('读取失败时也不把值或 stderr 带出来', async () => {
  await withFakeSecurity('missing', async (readCalls) => {
    const read = await readKeychainRef(REF);
    assertFakeRan(readCalls, 'missing');
    assert.equal(read.status, 'missing');
    assert.equal(Object.hasOwn(read, 'value'), false);
  });
});

test('每个状态都有给人看的说明', () => {
  for (const status of [
    'ok',
    'missing',
    'locked',
    'denied',
    'empty',
    'unavailable',
  ]) {
    const reason = reasonFor(status);
    assert.ok(reason && reason !== '未知状态', `${status} 缺少说明`);
  }
  assert.equal(reasonFor('nonsense'), '未知状态');
});

test('describe 全程不读取值：一次都没用 -w 问过 security', async () => {
  await withFakeSecurity('ok', async (readCalls) => {
    process.env.FAKE_VALUE = 'SENTINEL-VALUE';
    const described = await describeKeychainRef(REF);

    assert.equal(described.status, 'ok');
    assertFakeRan(readCalls, 'ok');
    // `security ... -w` 是「把密码打出来」的形式。describe 若走到那一步，
    // 值就已经进了这个进程 —— 而显示一个状态本不需要它。
    assert.ok(
      !readCalls().includes('-w'),
      '例程内部使用了 -w 形式提问 —— 那意味着「描述状态」这条路上读了值',
    );
  });
});

test('read 才是唯一会读取值的路径', async () => {
  await withFakeSecurity('ok', async (readCalls) => {
    process.env.FAKE_VALUE = 'SENTINEL-VALUE';
    await readKeychainRef(REF);
    assert.ok(readCalls().includes('-w'), 'read 应当去取值');
  });
});

test('日志与错误里都不出现明文', async () => {
  // 把整段流程的 stdout/stderr 收起来，断言哨兵一次都没出现。
  // 「最小泄露日志」不是靠review每一行代码，是靠这条断言兜住。
  const { spawnSync } = await import('node:child_process');
  const script = `
    import { describeKeychainRef, readKeychainRef } from './keychain.mjs';
    const ref = { kind: 'keychain', service: 'svc', account: 'acct' };
    console.log('describe:', JSON.stringify(await describeKeychainRef(ref)));
    const r = await readKeychainRef(ref);
    console.log('read status:', r.status);
    console.log('长度:', r.value?.length ?? 0);
  `;
  const dir = mkdtempSync(join(tmpdir(), 'log-leak-'));
  const bin = join(dir, 'security');
  writeFileSync(bin, '#!/bin/sh\nprintf \'%s\' "$FAKE_VALUE"; exit 0\n');
  chmodSync(bin, 0o755);

  const SENTINEL = 'SENTINEL-LOG-LEAK-CHECK';
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FAKE_VALUE: SENTINEL,
        CREDENTIAL_SERVICE: 'svc',
        CREDENTIAL_ACCOUNT: 'acct',
      },
    },
  );
  rmSync(dir, { recursive: true, force: true });

  const output = `${result.stdout}${result.stderr}`;
  assert.ok(
    result.stdout.includes('describe:'),
    `子进程没跑起来：${result.stderr}`,
  );
  assert.ok(
    !output.includes(SENTINEL),
    'stdout/stderr 里出现了明文 —— 日志是最容易扩散的一处',
  );
});
