// 内容覆盖率闸门。
//
// 用途：任何**会移动内容**的改动（分章、改 URL、换渲染器、升 Astro）之后，
// 证明没有丢内容、没有丢锚点。
//
//   node scripts/check-content-coverage.mjs --write    记下当前基线
//   node scripts/check-content-coverage.mjs            与基线比对
//
// ── 为什么需要它 ──
//
// 「我改完了，看着没问题」不是验收标准。分章这种改动会把正文从一个文件
// 搬到另一个文件，而**搬运是会丢东西的** —— 丢的往往不是整段，是某个
// 嵌在表格里的公式、某个只出现一次的锚点。人工核对 651 个标题不现实，
// 而 diff 两份 1.4MB 的 HTML 只会得到一片噪声。
//
// 所以这里比的是**三样可核验的东西**：
//   ① 正文纯文本的 sha256 —— 内容有没有变
//   ② 锚点 id 的集合 —— 外链还找不找得到
//   ③ 各级标题计数 —— 结构有没有塌
//
// ── 为什么正文比对前要做归一化 ──
//
// 直接哈希 HTML 会把「重排属性顺序」也当成内容变化，那种 diff 无法阅读。
// 这里去掉标签、把连续空白折叠成一个空格 —— 只保留人真正读到的字符。
// 代价是它**看不见纯样式改动**，但那本来就不该由这道闸门来管。

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const BLOG = join(DIST, 'blog');
const MANIFEST = join(ROOT, 'docs/execution/content-manifest.json');

/**
 * 抽出正文区，**精确到与之配对的 </div>**。
 *
 * 这里曾经写成「从 `.prose` 切到 `</article>`」，那个范围把
 * 上下篇导航、许可声明、评论也一并算了进去。后果不是"多算了一点"，
 * 而是**报错报到别的文章头上**：改 A 的标题会改变 B 的「上一篇/下一篇」
 * 链接，于是闸门说"B 的正文变了"。
 *
 * 这条实测踩过：只把 thinking.md 的 frontmatter title 改了一个字，
 * 闸门报的是 shadowrocket 正文变化 —— 而 shadowrocket 一个字都没动。
 * 一个会说谎的闸门比没有闸门更糟，因为它会让人去查错的地方。
 *
 * 取不到就返回 null —— 静默当成空正文会让闸门变成摆设。
 */
function proseOf(html) {
  const open = html.indexOf('<div class="prose"');
  if (open === -1) return null;

  // 从开标签之后开始数 <div / </div> 的配对深度
  let depth = 1;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = html.indexOf('>', open) + 1;

  // 刻意不用 `while ((m = re.exec(html)))` —— 本项目把
  // noAssignInExpressions 定为 error，而 `while ((m = …))` 正是那个写法
  let m = re.exec(html);
  while (m !== null) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length);
    m = re.exec(html);
  }
  return null;
}

/**
 * 正文归一化：标签去掉、实体还原常见的几个、空白折叠。
 *
 * 只还原 `&amp;` `&lt;` `&gt;` `&quot;` `&#39;` —— 这五个是 Markdown
 * 最常产生的。其余实体（比如 KaTeX 的 `&#x26;`）在两边由同一个渲染器
 * 产生，形态一致，不需要归一也能比对上；贸然做全量实体解码反而会
 * 把 `&lt;` 和字面 `<` 混为一谈，掩盖真实差异。
 */
function normalize(prose) {
  return prose
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function headingsOf(prose) {
  const out = { ids: [], levels: {} };
  for (const m of prose.matchAll(/<h([1-6])((?:\s+[^>]*)?)>/g)) {
    out.levels[m[1]] = (out.levels[m[1]] ?? 0) + 1;
    const id = /\bid="([^"]*)"/.exec(m[2]);
    if (id) out.ids.push(id[1]);
  }
  return out;
}

/**
 * 最新的源文件修改时间。
 *
 * 这道闸门读的是 `dist/`，于是有一个不显眼但会致命的坑：
 * **dist 可能比 src 旧**。若在陈旧产物上 `--write`，基线记录的就是
 * 一个从未存在过的状态，之后所有比对都建立在错误的地基上 ——
 * 而且它不会报错，只会一直给出看似正常的结论。
 *
 * 实测踩过：改完源文件、建过一次、再改回来，此时 dist 里还是改动后的产物，
 * `--write` 就把那个中间态记成了基线。
 */
function newestMtime(dir) {
  let newest = 0;
  let stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else {
        const t = statSync(full).mtimeMs;
        if (t > newest) newest = t;
      }
    }
  }
  return newest;
}

function collect() {
  if (!existsSync(BLOG)) {
    console.error('✗ 没有 dist/blog —— 先跑 npm run build');
    process.exit(1);
  }

  const srcNewest = newestMtime(join(ROOT, 'src'));
  const distNewest = newestMtime(DIST);
  if (srcNewest > distNewest) {
    console.error(
      '✗ dist 比 src 旧 —— 产物不是当前源码构建出来的，比对结论没有意义。\n' +
        '  先跑 npm run build。',
    );
    process.exit(1);
  }
  const result = {};
  for (const slug of readdirSync(BLOG).sort()) {
    let html;
    try {
      html = readFileSync(join(BLOG, slug, 'index.html'), 'utf8');
    } catch {
      continue;
    }
    const prose = proseOf(html);
    if (prose === null) {
      console.error(`✗ ${slug} 里找不到正文区（.prose）—— 渲染结构变了？`);
      process.exit(1);
    }
    // 断言取到的确实只是正文。这条比它看起来重要：
    // 范围一旦放大，闸门就会把页面级的改动（导航、评论）算成内容变化，
    // 而那种错误**表现为「另一篇文章变了」**，极难从输出反推
    for (const leak of [
      'post-nav',
      'see-also',
      'comments',
      'article-license',
    ]) {
      if (prose.includes(leak)) {
        console.error(
          `✗ ${slug} 的「正文」范围里混进了页面级区块（${leak}）—— ` +
            'proseOf 的配对逻辑坏了，闸门的结论不可信。',
        );
        process.exit(1);
      }
    }

    // 标题与摘要在页头，**不在 `.prose` 里** —— 但它们显然也是内容。
    // 只比正文会让「改标题」这种改动完全隐形，而标题是文章最要紧的一行字。
    const titleEl =
      /<h1[^>]*data-pagefind-meta="title"[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    const title = titleEl ? normalize(titleEl[1]) : null;
    if (title === null) {
      console.error(`✗ ${slug} 里找不到文章标题 —— 页头结构变了？`);
      process.exit(1);
    }

    const text = normalize(prose);
    const { ids, levels } = headingsOf(prose);
    result[slug] = {
      title,
      chars: text.length,
      sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      headings: levels,
      anchors: ids.length,
      anchorHash: createHash('sha256')
        .update([...ids].sort().join('\n'), 'utf8')
        .digest('hex'),
    };
  }
  return result;
}

const current = collect();

if (process.argv.includes('--write')) {
  writeFileSync(
    MANIFEST,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), articles: current }, null, 2)}\n`,
    'utf8',
  );
  const total = Object.values(current).reduce((n, a) => n + a.chars, 0);
  console.log(`✓ 基线已写入 ${MANIFEST}`);
  console.log(
    `  ${Object.keys(current).length} 篇，正文合计 ${total.toLocaleString()} 字符`,
  );
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.error(
    `✗ 没有基线：${MANIFEST}\n  先跑 node scripts/check-content-coverage.mjs --write`,
  );
  process.exit(1);
}
const base = JSON.parse(readFileSync(MANIFEST, 'utf8')).articles;

let failed = 0;
const gone = Object.keys(base).filter((s) => !(s in current));
const added = Object.keys(current).filter((s) => !(s in base));

for (const slug of gone) {
  // 文章消失是**内容丢失**，不是「重构」。分章不该删掉任何一篇。
  console.error(`✗ ${slug}：基线里有，现在没有了`);
  failed++;
}
for (const slug of added) {
  console.log(`  + ${slug}：新增（基线里没有，不计为失败）`);
}

for (const [slug, a] of Object.entries(current)) {
  const b = base[slug];
  if (!b) continue;
  const problems = [];
  if (a.title !== b.title) {
    problems.push(`标题变化（「${b.title}」→「${a.title}」）`);
  }
  if (a.sha256 !== b.sha256) {
    const delta = a.chars - b.chars;
    problems.push(
      `正文变化（${delta >= 0 ? '+' : ''}${delta} 字符：${b.chars} → ${a.chars}）`,
    );
  }
  if (a.anchorHash !== b.anchorHash) {
    problems.push(`锚点集合变化（${b.anchors} → ${a.anchors} 个）`);
  }
  if (JSON.stringify(a.headings) !== JSON.stringify(b.headings)) {
    problems.push(
      `标题层级变化（${JSON.stringify(b.headings)} → ${JSON.stringify(a.headings)}）`,
    );
  }
  if (problems.length) {
    console.error(`✗ ${slug}`);
    for (const p of problems) {
      console.error(`    ${p}`);
      failed++;
    }
  }
}

if (failed === 0) {
  console.log(
    `✓ 内容覆盖率：${Object.keys(current).length} 篇与基线一致（正文、锚点、标题层级）`,
  );
  process.exit(0);
}
console.error(
  `\n✗ ${failed} 项与基线不符。\n` +
    '  若这是**有意**的改动（例如分章），确认内容确实没有丢失后，\n' +
    '  用 --write 更新基线；基线更新本身应当出现在提交里，好让它可被复核。',
);
process.exit(1);
