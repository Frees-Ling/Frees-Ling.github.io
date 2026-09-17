// 稳定 block ID（EDITOR-001）。
//
// ── 什么是「块」──
//
// 文档最外层的一个结构单元：标题、段落、代码块、列表、引用、表格、分隔线。
// 编辑器要用它来「指着某一段说话」—— 定位光标、标记选区、把 AI 的修改意见
// 落到具体位置（EDITOR-002 的 diff 协议建立在这上面）。
//
// ── ID 怎么算，以及「稳定」是什么意思 ──
//
// ID = 规范化后内容的 sha256 前 8 位，同文档内重复出现的按次序加后缀。
//
// **它稳定的是什么**：同一份 Markdown 任何时候算出来的 ID 完全相同。
// 因此重新渲染、换进程、预览与发布之间，同一个块永远是同一个 ID。
// 这是编辑器能工作的前提 —— ID 若随机，预览与源文就对不上。
//
// **它不稳定的是什么**：改写了某一段，那一段的 ID 就变了。
// 这是刻意的取舍，不是缺陷：
//   · 用序号当 ID 的话，在文档开头插一段会让**后面所有块的 ID 全部平移**，
//     于是「这条批注属于第 5 段」会在毫无关系的一次编辑后指向别的段落
//   · 用内容哈希的话，只有被改的那一段变化，其余不受影响
// 代价是「同一段落改了字就换了身份」。需要跨修订追踪某个块时，
// 应该显式保存修订历史（文档层的职责），而不是指望 ID 自己不变。
//
// ── 为什么不把 ID 写进产出的 HTML ──
//
// 写成 `data-block-id` 属性最省事，但代价是公开站的每一页都多出几百个属性
// （transformer 一篇约 1000 个块），而公开站根本不用它们。
// 而且那会让预览与发布的 HTML 不再逐字相同，`check:preview` 这道闸门
// 就得放宽 —— 为了一个编辑器才需要的功能去削弱一道防漂移的闸门，不划算。
//
// 所以块信息是**算出来的**，产物一个字节都不变。

import { createHash } from 'node:crypto';

import {
  createPreviewProcessor,
  MARKDOWN_PIPELINE,
} from './markdown-pipeline.mjs';

/** 参与「块」判定的元素。其余的元素（如 Shiki 内部的 span）不单独成块。 */
const BLOCK_KINDS = new Map([
  ['h1', 'heading'],
  ['h2', 'heading'],
  ['h3', 'heading'],
  ['h4', 'heading'],
  ['h5', 'heading'],
  ['h6', 'heading'],
  ['p', 'paragraph'],
  ['pre', 'code'],
  ['ul', 'list'],
  ['ol', 'list'],
  ['blockquote', 'quote'],
  ['table', 'table'],
  ['hr', 'divider'],
  ['div', 'block'], // KaTeX 的 display 公式
]);

/** 与去重键同样的规范化：NFKC 兼容分解 + 空白折叠。 */
function normalizeText(text) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function hashOf(text) {
  return createHash('sha256')
    .update(normalizeText(text), 'utf8')
    .digest('hex')
    .slice(0, 8);
}

/** 取出节点里的纯文本（用于算 ID 与给编辑器显示摘要）。 */
function textOf(node) {
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && node.tagName === 'annotation') return '';
  if (!Array.isArray(node.children)) return '';
  return node.children.map(textOf).join('');
}

/**
 * 渲染并取回最终的 hast 树。
 *
 * 没有用 `processor.render()` 的返回值，因为那个只给 HTML 字符串；
 * 块的划分需要在树上做。这里挂一个只负责「把树存下来」的插件 ——
 * 它不改动任何节点，因此不影响渲染结果。
 */
async function renderToTree(markdown, overrides) {
  let captured = null;
  const processor = await createPreviewProcessor({
    ...overrides,
    rehypePlugins: [
      ...MARKDOWN_PIPELINE.rehypePlugins,
      () => (tree) => {
        captured = tree;
      },
    ],
  });
  await processor.render(markdown);
  return captured;
}

/**
 * 把一份 Markdown 切成块。
 *
 * @returns {Promise<{blocks: Array, headings: Array}>}
 *
 * 每个块：
 *   id        稳定标识，见文件头
 *   kind      heading / paragraph / code / list / quote / table / divider / block
 *   text      纯文本摘要（编辑器列表用）
 *   slug      仅标题有：它的锚点（与页面上的 id 一致）
 *   level     仅标题有：**渲染后**的层级 1–6
 *
 * `level` 是渲染后的层级，不是源文里的井号个数：管线会把正文标题整体下移
 * 一级（页面标题独占 h1，见 rehype-normalize-headings.mjs），
 * 所以源文的 `#` 在这里是 2。这是刻意的 —— 块来自渲染树，
 * 它描述的应当是**预览里看到的样子**，否则编辑器的目录会和右边的预览对不上。
 *   startLine / endLine  在源文中的行号，**取不到时为 null**
 */
export async function collectBlocks(markdown, overrides = {}) {
  const tree = await renderToTree(markdown, overrides);
  if (!tree) return { blocks: [], headings: [] };

  const blocks = [];
  const headings = [];
  const seen = new Map(); // 同一份内容出现多次时用来加后缀

  for (const node of tree.children ?? []) {
    if (node.type !== 'element') continue;
    const kind = BLOCK_KINDS.get(node.tagName);
    if (!kind) continue;

    const text = textOf(node);
    const hash = hashOf(text);
    const nth = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, nth);
    // 第一次出现不加后缀，读起来干净；重复的才带 -2 / -3
    const id = nth === 1 ? `blk-${hash}` : `blk-${hash}-${nth}`;

    const block = {
      id,
      kind,
      text: normalizeText(text).slice(0, 120),
      // Shiki 会用一个新节点替换 <pre>，位置信息在那一步丢失。
      // 取不到就是取不到 —— 不编一个假的行号，那会让编辑器跳错位置。
      startLine: node.position?.start?.line ?? null,
      endLine: node.position?.end?.line ?? null,
    };

    if (kind === 'heading') {
      block.level = Number(node.tagName[1]);
      // 复用渲染器给出的锚点，而不是自己再算一遍 ——
      // 两套 slug 规则迟早会不一致，而锚点是外部链接的一部分
      block.slug = node.properties?.id ?? null;
      headings.push(block);
    }

    blocks.push(block);
  }

  return { blocks, headings };
}

/** 只取标题，比 collectBlocks 便宜一点（仍然要跑一遍管线）。 */
export async function collectHeadings(markdown, overrides = {}) {
  return (await collectBlocks(markdown, overrides)).headings;
}
