// 钥匙串 secret reference 的解析（SEC-001）。
//
// ── 两条路径，刻意分开 ──
//
//   describeKeychainRef()  —— 只回答「能不能取到」，**不读值**
//   readKeychainRef()      —— 真的去读，返回值
//
// 界面要显示「已锁定 / 没配过 / 可读取」，而这三件事只需要知道条目在不在、
// 锁没锁，完全不需要把密钥取出来。分成两条路之后，「描述」这条路上
// 值根本不会进入调用方进程 —— 不是靠纪律，是没有那个可能。
//
// ── 为什么把状态和值分开返回 ──
//
// readKeychainRef 返回的是 { status, value }，而不是「失败返回 null」。
// 因为「取不到」不是一件事：钥匙串锁定要人去解锁，条目不存在要人去配，
// 访问被拒是另一个问题。三者的处理方式完全不同，而全都报成 null
// 会让人对着「读取失败」猜是哪一种。
//
// ── 为什么状态来自退出码而不是解析消息 ──
//
// 脚本的 stderr 是写给人看的，改一句措辞就会让基于文本的解析静默失效。
// 退出码是稳定的契约，见 read-credential.sh 顶部的 EX_* 定义。

import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../scripts/automation/read-credential.sh', import.meta.url),
);

/** 脚本自带的看门狗是 5 秒；这里留一点余量，只兜住脚本本身卡死的情况。 */
const SCRIPT_TIMEOUT_MS = 8000;

/** 退出码 → 状态。契约见 read-credential.sh 的 EX_* 常量。 */
const STATUS_BY_CODE = {
  0: 'ok',
  2: 'missing',
  3: 'locked',
  4: 'denied',
  5: 'empty',
};

/** 状态 → 给人看的说明，并且**说清怎么办**。 */
const REASON = {
  ok: '可读取',
  missing: '钥匙串里没有这个条目 —— 需要先存入',
  locked: '钥匙串已锁定 —— 需要先解锁才能读取',
  denied: '访问被拒绝 —— 该条目不允许本程序读取',
  empty: '条目存在但内容为空',
  unavailable: '无法执行钥匙串读取脚本',
};

export function reasonFor(status) {
  return REASON[status] ?? '未知状态';
}

/**
 * 跑一次读取脚本。
 *
 * 一律用 execFile（不经 shell）：service/account 会进 argv，走 shell 就等于
 * 把它们交给一次字符串拼接。密钥本身从不进 argv —— 脚本用 `-w` 让
 * `security` 打到 stdout。
 */
function run(args, { service, account }) {
  return new Promise((resolve) => {
    execFile(
      'sh',
      [SCRIPT, ...args],
      {
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 1024 * 64,
        env: {
          ...process.env,
          CREDENTIAL_SERVICE: service,
          CREDENTIAL_ACCOUNT: account,
        },
      },
      (error, stdout) => {
        if (error && error.killed) {
          // 脚本自己都超时了 —— 当作锁定处理，因为那是最可能的原因
          resolve({ status: 'locked', stdout: '' });
          return;
        }
        const code = error ? (error.code ?? 1) : 0;
        const status = STATUS_BY_CODE[code] ?? 'unavailable';
        // **不回传 stderr**：它的消息里带着 service / account，
        // 而这两样会随着错误对象流进日志。调用方需要的是状态码。
        resolve({ status, stdout });
      },
    );
  });
}

/**
 * 只描述状态，不读值。
 *
 * @returns {Promise<{status: string, reason: string}>} —— **没有 value 字段**
 */
export async function describeKeychainRef(ref) {
  const { status } = await run(['--state'], ref);
  return { status, reason: reasonFor(status) };
}

/**
 * 读取值。
 *
 * 返回值里的 `value` 是明文。调用点的纪律：**取到就用，不存、不打日志、
 * 不放返回值**。所以它和 describe 是两个函数 —— 需要值的代码必须显式
 * 调用这个，而不是「顺手拿一下」。
 */
export async function readKeychainRef(ref) {
  const { status, stdout } = await run(['read'], ref);
  if (status !== 'ok') return { status, reason: reasonFor(status) };
  return { status: 'ok', value: stdout };
}

/**
 * 供 resolveSecret 同步使用的读取器（那个接口是同步的）。
 *
 * 与异步版共用同一份脚本与同一套退出码契约，因此看门狗行为一致 ——
 * 钥匙串锁定时会由脚本在 5 秒内杀掉子进程并返回，不会真的挂住。
 * 取不到时抛错，交由 resolveSecret 转成 null。
 */
export function keychainReaderSync(ref) {
  return execFileSync('sh', [SCRIPT, 'read'], {
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    env: {
      ...process.env,
      CREDENTIAL_SERVICE: ref.service,
      CREDENTIAL_ACCOUNT: ref.account,
    },
  });
}
