// 项目页链接闸门。
//
// ── 它守的是什么 ──
//
// 项目页此前**链不到任何地方**：四张卡片只是名称与简介的陈列，
// 用户看完没有下一步可走。补链接容易，难的是那些链接一直是对的 ——
// 一篇文章改了 slug、一个仓库改了名，页面照常渲染，只是点进去 404。
// 那种失效没有任何一步会失败，所以必须有闸门。
//
// 三类断言：
//
//   ① 关联文章的 slug 在 `dist/blog/` 里真实存在 —— 不存在的直接失败
//   ② 仓库地址格式合法，且**不是占位符**（`#`、空串、首页地址都算冒充）
//   ③ `repoStatus` 与实际有没有 `repo` 一致 —— 声明「公开仓库」就必须给出地址
//
// ── 为什么不在这里做联网可达性检查 ──
//
// 构建必须能在断网时完成（见 `npm run check:offline`），
// 而把网络请求塞进构建闸门会让「能不能发版」取决于 GitHub 那一刻的可用性。
// 可达性检查是**单独的可选命令**：`npm run check:links`。
//
// 用法（需先 build）：node scripts/check-projects.mjs

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projects } from '../src/data/site.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BLOG = join(ROOT, 'dist/blog');

if (!existsSync(BLOG)) {
  console.error('✗ 没有 dist/blog —— 先跑 npm run build');
  process.exit(1);
}

const slugs = new Set(
  readdirSync(BLOG, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name),
);

/** 这些形态看起来像地址，其实什么都没链 —— 属于「冒充」。 */
const PLACEHOLDER = [/^#/, /^$/, /^https?:\/\/frees-ling\.dev\/?$/];

const REPO_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const problems = [];

for (const p of projects) {
  for (const slug of p.articles ?? []) {
    if (!slugs.has(slug)) {
      problems.push(
        `项目「${p.name}」关联的文章 slug「${slug}」在 dist/blog/ 里不存在 —— ` +
          '链接会 404。可用的 slug 见 dist/blog/ 下的目录名。',
      );
    }
  }

  const repo = p.repo;
  if (repo === null || repo === undefined) {
    // 没有仓库是允许的，但状态要如实
    if (p.repoStatus === '公开仓库') {
      problems.push(
        `项目「${p.name}」声明 status 为「公开仓库」却没有 repo 地址 —— ` +
          '两者必须一致',
      );
    }
    continue;
  }

  if (PLACEHOLDER.some((re) => re.test(repo))) {
    problems.push(
      `项目「${p.name}」的仓库地址是占位符「${repo}」—— ` +
        '不能拿 #、空串或首页地址冒充仓库链接',
    );
    continue;
  }
  if (!REPO_RE.test(repo)) {
    problems.push(
      `项目「${p.name}」的仓库地址格式不合法：${repo} —— ` +
        '期望 https://github.com/<owner>/<repo>',
    );
  }
  if (p.repoStatus !== '公开仓库') {
    problems.push(
      `项目「${p.name}」给了仓库地址，但 status 是「${p.repoStatus}」—— ` +
        '有地址就应当标明是公开仓库',
    );
  }
}

// 汇总：把「没有仓库」的项目列出来，这是给人看的，不是错误。
// 它们需要一个真实的说明，而不是一个假链接。
const awaiting = projects
  .filter((p) => !p.repo)
  .map((p) => `${p.name}（${p.repoStatus}）`);

if (problems.length > 0) {
  console.error(`\n✗ 项目页链接检查未通过（${problems.length} 项）：\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log(
  `✓ 项目 ${projects.length} 个：关联文章 slug 全部存在，仓库地址格式与状态一致`,
);
if (awaiting.length > 0) {
  console.log(`  · 待确认仓库：${awaiting.join('、')}`);
}
