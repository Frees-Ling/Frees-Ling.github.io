// 渲染期把正文标题整体下移，使页面标题成为唯一的 h1。
//
// ── 为什么在渲染期做，而不是改 .md ──
//
// 「正文的 `#` 应该是页面的 h2」是**渲染器的判断**，不是作者写下的内容。
// 全站 17 篇里有 15 篇用 `#` 作正文的一级分隔，`transformer` 一篇就有 109 个 ——
// 它们与页头那个 `<h1>{title}</h1>` 现在是同级兄弟，而语义上正文各节是它的子节。
//
// 回写到 `.md` 意味着：改动作者的原文、17 个文件一起产生 diff、
// 而且再也分不清哪些 `##` 是作者写的、哪些是脚本改的。放在渲染期则：
// 只此一处、随时可撤、`.md` 一个字节不动。
//
// ── 为什么 id 不会变 ──
//
// id 由标题的**文本**生成（Astro 的 github-slugger），与层级无关。
// 因此整体下移不改变任何 id —— 651 个锚点原样保留。
// 这一点不是承诺，是由 `npm run check:coverage` 强制的。
//
// ── 归一化到「最浅的标题 = h2」而不是「一律 +1」 ──
//
// 一律 +1 会让本来就从 h2 起的文章（`meeting`、`LOVEv1.0`）变成从 h3 起，
// 于是页面标题 h1 下面直接跳到 h3，层级出现空洞。
// 按每篇自己的最浅层级来平移，两种情况都得到连续的 h1 → h2 → h3。

const TARGET_TOP_DEPTH = 2;
const MIN_DEPTH = 1;
const MAX_DEPTH = 6;

/** 不引入 unist-util-visit：它只是传递依赖，直接依赖它等于凭空多一个依赖面。 */
function walk(node, fn) {
  fn(node);
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (const child of children) walk(child, fn);
}

function depthOf(node) {
  if (node?.type !== 'element') return null;
  const m = /^h([1-6])$/.exec(node.tagName ?? '');
  return m ? Number(m[1]) : null;
}

export function rehypeNormalizeHeadings() {
  return (tree) => {
    let shallowest = Number.POSITIVE_INFINITY;
    walk(tree, (node) => {
      const depth = depthOf(node);
      if (depth !== null && depth < shallowest) shallowest = depth;
    });

    // 正文里一个标题都没有（`index.md` 那种极端短文）：什么也不做
    if (!Number.isFinite(shallowest)) return;

    const shift = TARGET_TOP_DEPTH - shallowest;
    if (shift === 0) return;

    walk(tree, (node) => {
      const depth = depthOf(node);
      if (depth === null) return;
      const next = Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, depth + shift));
      node.tagName = `h${next}`;
    });
  };
}
