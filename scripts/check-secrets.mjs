// 密钥闸门。
//
// 为什么需要它：密钥进入 Git 之后，删除文件是**没用的** —— 它会留在历史里，
// 而重写历史代价极高（ADR 禁止）。唯一的低成本时机是**提交之前**。
//
// 两层检查：
//   ① 路径黑名单 —— 这类文件根本不该进版本库，与内容无关
//   ② 内容特征   —— 密钥形态的字符串
//
// 输出刻意**只报位置与类型，绝不回显匹配内容** ——
// 一个用来防泄露的脚本，自己不能变成泄露渠道（终端、日志、截图都会被留存）。
//
// 用法：
//   node scripts/check-secrets.mjs            # 检查将要提交的内容（staged）
//   node scripts/check-secrets.mjs --all      # 检查全部已跟踪文件
//   node scripts/check-secrets.mjs --history  # 额外扫描全部历史（慢，按需）

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------- ① 路径黑名单 ----------
// 密钥、私钥、数据库、备份 —— 这些是「无论在不在版本库里都不该被提交」的类别
const FORBIDDEN_PATHS = [
  { re: /(^|\/)\.env($|\.)/, why: '环境变量文件' },
  { re: /\.(pem|key|p12|pfx|jks|keystore)$/i, why: '私钥 / 证书' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, why: 'SSH 密钥' },
  { re: /\.(sqlite3?|db|mdb)$/i, why: '数据库文件' },
  {
    re: /\.(dump|sql|bak|backup|tar|tar\.gz|tgz|zip|7z)$/i,
    why: '备份 / 归档文件',
  },
  { re: /(^|\/)_backups\//, why: '本地备份目录' },
  {
    re: /(^|\/)\.claude\/settings\.local\.json$/,
    why: '本地个人配置（可能含本机路径与凭据）',
  },
  { re: /(^|\/)(credentials|secrets?)\.(json|ya?ml|toml)$/i, why: '凭据文件' },
];

// 已知的合法例外：归档站是只读历史，其中不含密钥（已全量扫描确认）
const PATH_ALLOWLIST = [/^archives\//];

// ---------- ② 内容特征 ----------
// 只匹配「几乎不可能是误报」的形态。宁可少报，也不要让闸门因为误报被绕过。
const CONTENT_PATTERNS = [
  { re: /\bsk-[A-Za-z0-9]{20,}\b/, why: 'API key（sk- 前缀）' },
  { re: /\b(ghp|gho|ghs|ghr)_[A-Za-z0-9]{30,}\b/, why: 'GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, why: 'GitHub fine-grained PAT' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key id' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, why: 'Slack token' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'PEM 私钥' },
];

// 机器生成的哈希文件不参与内容扫描。
//
// 这里曾有一条「40 字符 base64 + 同行出现 key/secret/token」的启发式，
// 实测在 package-lock.json 上直接误报 —— 锁文件里全是完整性哈希，
// 而 JSON 行又长，很容易同时出现 integrity 与含 key 的包名。
// 一个会误报的闸门最终一定会被绕过，所以这条宁可不要。
const CONTENT_SKIP = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/,
];

// 占位符与文档示例不算泄露
const PLACEHOLDER =
  /(xxxx|your[_-]?|example|placeholder|redacted|\.\.\.|<[a-z-]+>|sk-a0840)/i;

const args = process.argv.slice(2);
const SCAN_ALL = args.includes('--all');
const SCAN_HISTORY = args.includes('--history');

function git(...cmdArgs) {
  return execFileSync('git', cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
}

function listFiles() {
  // --all 时扫描全部已跟踪文件；否则只扫描已暂存的（即将进入提交的）内容
  const out = SCAN_ALL
    ? git('ls-files')
    : git('diff', '--cached', '--name-only', '--diff-filter=ACMR');
  return out.split('\n').filter(Boolean);
}

const problems = [];

function checkPath(file) {
  if (PATH_ALLOWLIST.some((re) => re.test(file))) return;
  for (const { re, why } of FORBIDDEN_PATHS) {
    if (re.test(file))
      problems.push({ file, kind: why, detail: '路径命中黑名单' });
  }
}

function checkContent(file) {
  if (PATH_ALLOWLIST.some((re) => re.test(file))) return;
  if (CONTENT_SKIP.some((re) => re.test(file))) return;
  let source;
  try {
    source = readFileSync(`${ROOT}/${file}`, 'utf8');
  } catch {
    return; // 二进制或已删除
  }
  // 逐行定位行号，但不回显该行内容
  const lines = source.split('\n');
  for (const { re, why } of CONTENT_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 2000) continue; // 压缩产物，跳过
      const m = line.match(re);
      if (!m) continue;
      if (PLACEHOLDER.test(line)) continue;
      problems.push({
        file,
        line: i + 1,
        kind: why,
        detail: '内容命中密钥形态',
      });
    }
  }
}

// ---------- 主流程 ----------
const files = listFiles();
for (const file of files) {
  checkPath(file);
  checkContent(file);
}

if (SCAN_HISTORY) {
  // 历史扫描只报「有/无」与提交号，绝不回显内容：
  // 历史里的密钥无法通过删除文件修复，报告出来是为了让人知道需要轮换。
  const commits = git('rev-list', '--all').split('\n').filter(Boolean);
  let found = 0;
  for (const commit of commits) {
    for (const { re } of CONTENT_PATTERNS) {
      try {
        const out = git('grep', '-lE', re.source, commit);
        if (out.trim()) found += 1;
      } catch {
        // grep 无匹配时退出码为 1
      }
    }
  }
  if (found) {
    problems.push({
      file: '(git history)',
      kind: '历史中的密钥',
      detail: `${found} 处命中 —— 需在服务商侧轮换，而非改写历史`,
    });
  }
}

if (problems.length) {
  console.error(`\n✗ 密钥检查失败（${problems.length} 项）：\n`);
  for (const p of problems) {
    const at = p.line ? `${p.file}:${p.line}` : p.file;
    console.error(`  ${at}  ${p.kind} —— ${p.detail}`);
  }
  console.error(
    '\n  注意：本检查刻意不回显匹配内容，以免脚本自身成为泄露渠道。\n' +
      '  请自行打开对应位置确认。\n',
  );
  process.exit(1);
}

console.log(
  `\n✓ 密钥检查通过（扫描 ${files.length} 个文件${SCAN_HISTORY ? ' + 全部历史' : ''}）\n`,
);
