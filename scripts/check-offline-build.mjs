#!/usr/bin/env node
// 断网构建验证（PERF-001）。
//
// ── 为什么值得单独验一次 ──
//
// 「构建不依赖不稳定网络」是一条**会悄悄失效**的性质。今天构建不联网，
// 不代表下个月还是：加一个字体 provider、引一个会去抓远端 schema 的集成、
// 换一个需要在安装期下载二进制的依赖，任何一样都能把构建变成
// 「网通才能发版」。而它在联网的机器上**永远不会报错** ——
// 只有当你在断网的飞机上、或者上游 CDN 挂了的时候才会发现。
//
// 所以这里不是「读一遍依赖清单确认没有网络调用」，是真的把网络关掉跑一遍。
//
// ── 怎么关 ──
//
//   macOS  ：sandbox-exec（已标记废弃，但目前仍可用）
//   Linux  ：unshare -rn（需要 CAP_SYS_ADMIN 或 user namespace）
//   都不可用：**明确报「跳过」并返回非零以外的码**，不假装通过。
//
// 用法：node scripts/check-offline-build.mjs

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 运行时目录。断网构建必须是**从零**的，不能拿上一轮的缓存糊过去。 */
const CLEAR = ['dist', 'node_modules/.astro'];

/**
 * 探测一个「能跑起来」的命令。
 *
 * ⚠️ 探针必须是**这个工具真正支持**的调用。这里踩过：最初统一用
 * `--version` 探测，而 `sandbox-exec` 不认这个选项、直接非零退出 ——
 * 于是检测判定「本平台没有断网机制」，脚本永远走「跳过」分支。
 * 一个永远不会真正验证的验证器，比没有验证器更糟：它给的是「已跳过」
 * 这个看起来没问题的结果。所以 `sandbox-exec` 用一次真实调用去探。
 */
function has(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'ignore' });
  return r.status === 0;
}

/** 只允许默认行为、禁止一切网络。构建不该需要监听端口，所以入站也禁。 */
const DENY_NETWORK = '(version 1)(allow default)(deny network*)';

/**
 * 组装「断网跑 npm run build」的命令。
 * 返回 null 表示这个平台没有可用的机制 —— 那要**说出来**，不是假装通过。
 */
function offlineCommand() {
  const build = ['run', 'build'];

  if (process.platform === 'darwin') {
    // 空跑一次带断网策略的 `true`，而不是 `--version`
    if (has('sandbox-exec', ['-p', DENY_NETWORK, 'true'])) {
      return {
        cmd: 'sandbox-exec',
        args: ['-p', DENY_NETWORK, 'npm', ...build],
        how: 'sandbox-exec',
      };
    }
  }

  if (process.platform === 'linux' && has('unshare', ['-rn', 'true'])) {
    return {
      cmd: 'unshare',
      args: ['-rn', 'npm', ...build],
      how: 'unshare -rn',
    };
  }

  return null;
}

const offline = offlineCommand();
if (!offline) {
  console.error(
    `⚠ 跳过：${process.platform} 上没有可用的断网机制（sandbox-exec / unshare）。\n` +
      '  这意味着**这一条本次没有被验证** —— 不要把它当成通过。',
  );
  process.exit(2);
}

// 先清掉产物与缓存：断网构建要是从零的，否则 ASTRO 会把上一轮
// 联网时渲染好的结果直接复用，验证就没有意义了
for (const p of CLEAR) rmSync(join(ROOT, p), { recursive: true, force: true });

console.log(`→ 断开网络并构建（${offline.how}）…`);
const started = Date.now();
const result = spawnSync(offline.cmd, offline.args, {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});

const secs = ((Date.now() - started) / 1000).toFixed(1);

if (result.status !== 0) {
  console.error(`✗ 断网构建失败（退出码 ${result.status}，${secs}s）`);
  console.error('  下面是被切断的那次请求留下的痕迹：');
  console.error(
    (result.stderr || result.stdout || '')
      .split('\n')
      .filter((l) => /error|ENOTFOUND|EAI_AGAIN|network|fetch|ECONN/i.test(l))
      .slice(0, 20)
      .join('\n') || '  （没有可辨认的网络错误 —— 看完整输出）',
  );
  console.error('\n  完整输出：');
  console.error((result.stderr || '').split('\n').slice(-30).join('\n'));
  process.exit(1);
}

console.log(`✓ 断网构建通过（${secs}s）—— 构建不依赖网络`);
