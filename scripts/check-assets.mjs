// 资产预算闸门（PERF-001）。
//
// ── 为什么要有闸门，而不是「注意一下」──
//
// 图片与字体是**唯一会随着内容增加而无声变胖**的两类资产：加一张照片、
// 换一个字体，页面照常渲染、构建照常成功，只是每个人的手机多下几 MB。
// 没有任何一步会失败，所以没有闸门就一定会漂。
//
// 四件事：
//
//   ① 每张 `<img>` 必须有 width 与 height —— 缺了就是 CLS
//   ② 交付出去的图片不得超过预算（OG 图单列，它有自己的尺寸规矩）
//   ③ 字体不许外链，且只许出现 KaTeX 那一族（正文用系统栈）
//   ④ OG 图存在、尺寸合规、且与母版哈希一致（母版换过却没重新生成）
//
// 用法（需先 build）：node scripts/check-assets.mjs

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ogIsStale, OG_WIDTH, OG_HEIGHT } from './build-og.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

// history/ 是只读旧站快照，pagefind 是搜索索引（不是图片）。
//
// ⚠️ **不能跳过 `_astro`。** 这里最初把它跳过了，理由是「那是构建产物」——
// 于是闸门只统计到 favicon 与 OG 图（104 KB），而用户真正会下载的
// 响应式派生物（`_astro/*.webp`，432 KB）一个都没算。
// 一个漏掉主要项的预算表比没有更糟：它给出「合计 104 KB」这种让人放心的数字。
const SKIP_DIRS = new Set(['history', 'pagefind']);

/** 单张交付图片的上限。超过这个数的图基本都不是「网页用图」。 */
const MAX_IMAGE_BYTES = 300 * 1024;
/** OG 图上限，与 build-og.mjs 保持一致。 */
const MAX_OG_BYTES = 200 * 1024;
/** 全站图片总量上限。单张合规不等于整体可控 —— 照片墙加到 200 张时， */
/** 每一张都「没超限」，而 dist 已经胖了几十 MB。 */
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(DIST);
const problems = [];
const notes = [];

if (files.length === 0) {
  console.error('✗ dist/ 是空的 —— 先跑 npm run build');
  process.exit(1);
}

// ── 先确认产物是当前的源码构建出来的 ──
//
// 这条不是洁癖。本轮实测：改掉一个 rehype 插件之后 `npm run build` 的输出
// **没有任何变化** —— 因为 Astro 把渲染好的 markdown 按内容缓存了，
// 换插件不会让它失效（清掉 `node_modules/.astro` 才会重建）。
// 于是在陈旧的产物上做断言，会得到「一切正常」的假结论。
//
// 与 check-content-coverage.mjs 用同一个办法：比 src 与 dist 的最新 mtime。
function newestMtime(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        const t = statSync(full).mtimeMs;
        if (t > newest) newest = t;
      }
    }
  }
  return newest;
}

const srcNewest = newestMtime(join(ROOT, 'src'));
const distNewest = newestMtime(DIST);
if (srcNewest > distNewest) {
  console.error(
    '✗ dist 比 src 旧 —— 产物不是当前源码构建出来的，资产结论没有意义。\n' +
      '  先 `npm run build`；如果刚改过 markdown 管线，还要先清掉\n' +
      '  `node_modules/.astro`（Astro 会缓存渲染结果，换插件不会自动失效）。',
  );
  process.exit(1);
}

// ── ① 图片必须带尺寸 ──
//
// width/height 是 CLS 的**直接**来源：没有它们，浏览器在图片下载完成前
// 只能按 0 高排版，图一到就把下面所有内容推下去。这不是「要不要优化」，
// 是有没有把版面撑住。
//
// 但这条**分两类**，因为能做的事不一样：
//
//   · 本地图（本站托管的）—— 尺寸是已知的，缺了就是我们的错，硬失败
//   · 远程图（正文里的第三方图床）—— 尺寸只能去取，而构建期不许依赖
//     网络；猜一个宽高比又比不猜更糟。这类**统计并封顶**，不硬失败：
//     数量一旦增长就失败，防止有人继续加没量的图。
const htmlFiles = files.filter((f) => f.endsWith('.html'));
let imgTotal = 0;
let localNoSize = 0;
let remoteNoSize = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = relative(DIST, file);
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    imgTotal++;
    const src = /\bsrc\s*=\s*["']([^"']*)/.exec(tag)?.[1] ?? '';
    const isRemote = /^https?:\/\//i.test(src);
    const hasW = /\bwidth\s*=\s*["']?\d/.test(tag);
    const hasH = /\bheight\s*=\s*["']?\d/.test(tag);

    if (!hasW || !hasH) {
      if (isRemote) {
        remoteNoSize++;
        // 远程图**可以**做到的那部分：不要一上来就并发拉全部
        if (!/\bloading\s*=/.test(tag)) {
          problems.push(
            `${rel}: 远程图没有 loading 属性（${src.slice(0, 60)}…）—— ` +
              '长文里的图会与首屏抢连接',
          );
        }
      } else {
        localNoSize++;
        problems.push(
          `${rel}: <img> 缺少 ${[!hasW && 'width', !hasH && 'height'].filter(Boolean).join(' 与 ')}` +
            `（${src || '(无 src)'}）—— 这会在图片到达时把版面推下去`,
        );
      }
    }

    // 同时给出 srcset 与 sizes 才算响应式；只给 srcset 而不给 sizes，
    // 浏览器会按 100vw 算，等于每档都可能被选中，反而更慢
    const hasSrcset = /\bsrcset\s*=/.test(tag);
    const hasSizes = /\bsizes\s*=/.test(tag);
    if (hasSrcset && !hasSizes) {
      problems.push(
        `${rel}: <img> 有 srcset 却没有 sizes —— 浏览器会按 100vw 估算`,
      );
    }
  }
}

// 远程图缺尺寸的**已知数量**。这是一个封顶值，不是目标值：
// 有新的远程图进来（带着未知尺寸）就会失败，逼着人要么把图收进本地
// 媒体库、要么显式更新这个数字并说明理由。
const KNOWN_REMOTE_NO_SIZE = 40;
if (remoteNoSize > KNOWN_REMOTE_NO_SIZE) {
  problems.push(
    `远程图缺尺寸的数量从 ${KNOWN_REMOTE_NO_SIZE} 涨到 ${remoteNoSize} —— ` +
      '新加的远程图必须先量出尺寸（收进本地媒体库，或写明宽高）',
  );
}
notes.push(
  `检查了 ${imgTotal} 个 <img>：本地缺尺寸 ${localNoSize}，` +
    `远程缺尺寸 ${remoteNoSize}（已知 ${KNOWN_REMOTE_NO_SIZE}）`,
);

// ── ② 图片字节预算 ──
const images = files.filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
let imageBytes = 0;
for (const file of images) {
  const size = statSync(file).size;
  imageBytes += size;
  const rel = relative(DIST, file);
  const isOg = rel.startsWith('og/') || rel.startsWith('og\\');
  const limit = isOg ? MAX_OG_BYTES : MAX_IMAGE_BYTES;
  if (size > limit) {
    problems.push(
      `${rel} 有 ${(size / 1024).toFixed(0)} KB，超过 ${(limit / 1024).toFixed(0)} KB 上限`,
    );
  }
}
if (imageBytes > MAX_TOTAL_IMAGE_BYTES) {
  problems.push(
    `图片总量 ${(imageBytes / 1024 / 1024).toFixed(1)} MB 超过 ` +
      `${(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB 预算`,
  );
}
notes.push(
  `${images.length} 张图片，合计 ${(imageBytes / 1024).toFixed(0)} KB` +
    `（预算 ${(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB）`,
);

// ── ③ 字体：不许外链，且只许出现已知的那一族 ──
//
// 全站的**正文与标题**用系统字体栈，一个字节都不下载。
//
// 但产物里有 59 个字体文件（约 1 MB）—— 那是 KaTeX 的数学字体，
// 由 rehype-katex 带进来。这条断言最初写的是「字体文件数必须为 0」，
// 一上来就红。红是对的，但**道理得说准**，否则守的是一个假机制：
//
//   · 「产物里有字体文件」≠「用户会下载字体」。实测（无头浏览器数
//     response）：首页 / about / blog/ai 三个不含公式的页面，
//     **字体请求都是 0 个**；含 499 个公式的 transformer 请求了 8 个。
//   · 让 0 成立的原因**不是** unicode-range。查过了：KaTeX 自己的
//     `katex.min.css` 里 20 处 @font-face **一个 unicode-range 都没有**
//     （它们带的是 `font-display: block`）。
//   · 真正的原因是：**没有元素引用这些字体族**。@font-face 只是声明，
//     要等某个元素的 `font-family` 命中它、且真的需要渲染字形时才去取。
//     没有公式的页面上没有 `KaTeX_*` 的标记，也就没有请求。
//
// 所以这里守两条**会真正被违反**的事：
//   ① 不许外链 —— 外链字体是第三方可用性依赖
//   ② 字体族只许是 KaTeX_* —— 加一个网页正文字体，那个是**每页都下**的。
//      这才是「无 unicode-range 的中文字体每页下 1.44 MB」那类事故会
//      撞进来的地方（见 docs/research 的字体实测记录）。
const ALLOWED_FONT_FAMILIES = [/^KaTeX_/];

const fontFiles = files.filter((f) =>
  ['.woff', '.woff2', '.ttf', '.otf'].includes(extname(f).toLowerCase()),
);
const fontBytes = fontFiles.reduce((n, f) => n + statSync(f).size, 0);

const unexpected = fontFiles.filter((f) => {
  const base = f.split('/').pop();
  return !ALLOWED_FONT_FAMILIES.some((re) => re.test(base));
});
if (unexpected.length > 0) {
  problems.push(
    `产物里出现非预期字体家族（${unexpected.length} 个）：` +
      `${unexpected
        .map((f) => relative(DIST, f))
        .slice(0, 5)
        .join('、')} —— ` +
      '只有 KaTeX 的数学字体是已知允许的；新增网页字体通常每页都会下载',
  );
}

// CSS 在所有 HTML 的内联 <style> 或 _astro/*.css 里；两处都扫
const cssSources = [
  ...htmlFiles.map((f) => ({
    rel: relative(DIST, f),
    text: readFileSync(f, 'utf8'),
  })),
  ...files
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ rel: relative(DIST, f), text: readFileSync(f, 'utf8') })),
];
// 声明的字体族也扫一遍：文件名可以改，`font-family` 里写什么才是浏览器
// 认的那个。两边都对得上才算数。
const declaredFamilies = new Set();
for (const { text } of cssSources) {
  for (const [block] of text.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const family =
      /font-family\s*:\s*["']?([^;"'}]+)/i.exec(block)?.[1]?.trim() ?? '(未知)';
    declaredFamilies.add(family);
  }
}
const strayFamilies = [...declaredFamilies].filter(
  (f) => !ALLOWED_FONT_FAMILIES.some((re) => re.test(f)),
);
if (strayFamilies.length > 0) {
  problems.push(
    `@font-face 声明了非预期字体族：${strayFamilies.join('、')} —— ` +
      '正文字体从系统栈换成网页字体会让每一页都多下载一个文件',
  );
}
notes.push(
  `字体 ${fontFiles.length} 个 / ${(fontBytes / 1024).toFixed(0)} KB，` +
    `全部是 KaTeX 数学字体（${[...declaredFamilies].join('、')}）；` +
    '无公式的页面实测 0 个字体请求',
);

// 外链字体：@font-face 的 src 指向 http(s)，或 head 里预连到字体 CDN
const FONT_HOSTS =
  /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|cdn\.jsdelivr\.net.*font|api\.fontsource\.org/i;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = relative(DIST, file);
  if (FONT_HOSTS.test(html)) {
    problems.push(
      `${rel}: 引用了外部字体主机 —— 构建与访问都会依赖第三方可用性`,
    );
  }
  for (const [block] of html.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    if (/src\s*:[^;]*url\(\s*["']?https?:/i.test(block)) {
      problems.push(`${rel}: @font-face 的 src 指向远程地址`);
    }
  }
}
// ── ④ OG 图 ──

const ogPath = join(DIST, 'og/banner.jpg');
if (!existsSync(ogPath)) {
  problems.push('dist/og/banner.jpg 不存在 —— 社交分享会没有图');
} else {
  const size = statSync(ogPath).size;
  if (size > MAX_OG_BYTES) {
    problems.push(
      `OG 图 ${(size / 1024).toFixed(0)} KB 超过 ${MAX_OG_BYTES / 1024} KB 上限`,
    );
  }
  notes.push(
    `OG 图 ${(size / 1024).toFixed(0)} KB（${OG_WIDTH}×${OG_HEIGHT}）`,
  );
}
if (ogIsStale()) {
  problems.push(
    'OG 图与当前母版不一致 —— 跑 node scripts/build-og.mjs 重新生成',
  );
}

// ── 结果 ──
for (const note of notes) console.log(`  · ${note}`);

if (problems.length > 0) {
  console.error(`\n✗ 资产闸门未通过（${problems.length} 项）：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('✓ 资产预算：图片尺寸与体积、字体零网络依赖、OG 图均已确认');
