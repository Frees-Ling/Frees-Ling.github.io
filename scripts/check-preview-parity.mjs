// 预览与发布的一致性闸门（EDITOR-001）。
//
//   node scripts/check-preview-parity.mjs
//
// ── 它保证什么 ──
//
// 把每篇文章的 Markdown 用**预览管线**渲染一遍，与公开站产物里的正文
// 逐字比对。两者必须完全相同。
//
// 「预览漂移」是编辑器最昂贵的缺陷：用户看到什么就该发布什么，
// 而漂移的表现是「编辑器里排版是对的，发出去不一样」——
// 等到发现时稿子已经发出去了。所以它必须在发布**之前**被机器挡住，
// 而不是靠人打开两个窗口比对。
//
// ── 为什么比「两份集合」而不是「按 slug 配对」──
//
// 源文件名到 URL slug 的转换不是简单的小写：`LOVEv1.0.md` → `lovev10`、
// `code-for-py3.10.md` → `code-for-py310`（点被去掉）。
// 在本脚本里重新实现一遍这条规则，就等于又造了一个会漂移的实现 ——
// 而本任务存在的理由正是反对这种事。
//
// 所以两边各自排序后整体比对：既证明了逐字一致，
// 也顺带证明了「每篇源文件都产出了一个页面、没有多余也没有缺失」。
//
// ── 失败即安全 ──
//
// 它读 `dist/`。若 dist 是旧的，预览侧是新的，两边会对不上而**报错**——
// 这是安全的失败方向：不会出现「产物陈旧却显示一致」的假通过。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderMarkdown } from '../src/utils/markdown-pipeline.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const POSTS = `${ROOT}src/content/posts`;
const BLOG = `${ROOT}dist/blog`;

if (!existsSync(BLOG)) {
  console.error('✗ 没有 dist/blog —— 先跑 npm run build');
  process.exit(1);
}

/** 取出 `dist` 页面里 `.prose` 的**内部** HTML —— 即 `<Content />` 的渲染结果。 */
function publishedProse(html) {
  const open = html.indexOf('<div class="prose"');
  if (open === -1) return null;
  const inner = html.indexOf('>', open) + 1;

  // 按 <div> 配对找闭合位置，不能用 `</article>` 之类的近似 ——
  // 那会把正文之外的区块也算进来，而这个脚本的全部价值就在于逐字比对
  let depth = 1;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = inner;
  let m = re.exec(html);
  while (m !== null) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(inner, m.index);
    m = re.exec(html);
  }
  return null;
}

/** 去掉 frontmatter，只留正文 —— 与内容集合交给渲染器的是同一段。 */
function bodyOf(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

const published = [];
for (const entry of readdirSync(BLOG)) {
  let html;
  try {
    html = readFileSync(`${BLOG}/${entry}/index.html`, 'utf8');
  } catch {
    continue; // 不是目录，或没有 index.html
  }
  const prose = publishedProse(html);
  if (prose === null) {
    console.error(`✗ ${entry} 里找不到 .prose —— 页面结构变了？`);
    process.exit(1);
  }
  published.push({ slug: entry, html: prose });
}

const previewed = [];
for (const file of readdirSync(POSTS)) {
  if (!/\.mdx?$/.test(file)) continue;
  const body = bodyOf(readFileSync(`${POSTS}/${file}`, 'utf8'));
  const { code, metadata } = await renderMarkdown(body);
  previewed.push({
    file,
    html: code,
    headings: metadata.headings?.length ?? 0,
  });
}

if (published.length !== previewed.length) {
  console.error(
    `✗ 数量不符：源文件 ${previewed.length} 篇，产物页面 ${published.length} 个。\n` +
      '  多一个或少一个都说明有内容没有正确发布。',
  );
  process.exit(1);
}

// 按内容排序后整体比对：既比逐字一致，也比「集合相同」
published.sort((a, b) => a.html.localeCompare(b.html));
previewed.sort((a, b) => a.html.localeCompare(b.html));

let mismatches = 0;
for (let i = 0; i < published.length; i++) {
  if (published[i].html === previewed[i].html) continue;
  mismatches++;
  const pub = published[i].html;
  const pre = previewed[i].html;
  let at = 0;
  while (at < Math.min(pub.length, pre.length) && pub[at] === pre[at]) at++;
  console.error(
    `\n✗ 第 ${i + 1} 组不一致（${previewed[i].file} vs ${published[i].slug}）`,
  );
  console.error(`   位置 ${at}，长度 ${pre.length} vs ${pub.length}`);
  console.error(`   预览: ${JSON.stringify(pre.slice(at, at + 90))}`);
  console.error(`   发布: ${JSON.stringify(pub.slice(at, at + 90))}`);
}

if (mismatches > 0) {
  console.error(
    `\n✗ ${mismatches} 组不一致。预览与发布必须逐字相同 ——
  若差异来自 shikiConfig 之类的配置，注意它可能是 markdown 的**兄弟键**
  而不是 processor 的选项：放错位置不会报错，只会被静默忽略。`,
  );
  process.exit(1);
}

console.log(
  `✓ 预览与发布逐字一致：${previewed.length} 篇` +
    `（含标题 ${previewed.reduce((n, p) => n + p.headings, 0)} 个）`,
);
