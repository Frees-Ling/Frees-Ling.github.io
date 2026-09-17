// 稳定 block ID 测试（EDITOR-001）。
//
// 这一层是编辑器与 diff 协议的地基，所以用例集中在「可预测」上：
// 同一份文档任何时候算出同一组 ID、改写只影响被改写的那段、
// 三种文档类型共用同一套规则。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectBlocks, collectHeadings } from './blocks.mjs';
import { renderMarkdown } from './markdown-pipeline.mjs';

const DOC = `# 第一章

第一段。

\`\`\`js
const a = 1;
\`\`\`

- 甲
- 乙

## 第一章.一

最后一段。
`;

/** 只取 id 序列，便于比较。 */
const ids = (r) => r.map((b) => b.id);

test('同一份文档两次算出完全相同的 ID', async () => {
  const a = await collectBlocks(DOC);
  const b = await collectBlocks(DOC);
  assert.deepEqual(ids(a.blocks), ids(b.blocks));
  assert.ok(
    a.blocks.length >= 5,
    `块太少（${a.blocks.length}），用例没覆盖到什么`,
  );
});

test('内容相同的块按次序加后缀，不会撞成同一个 ID', async () => {
  const { blocks } = await collectBlocks('第一段。\n\n第一段。\n\n第一段。\n');
  const paragraphs = blocks.filter((b) => b.kind === 'paragraph');
  assert.equal(paragraphs.length, 3);
  assert.equal(
    new Set(ids(paragraphs)).size,
    3,
    '三个同内容的段落必须有三个不同 ID',
  );
  assert.ok(paragraphs[0].id.endsWith('-1') === false, '首个不加后缀');
  assert.match(paragraphs[1].id, /-2$/);
  assert.match(paragraphs[2].id, /-3$/);
});

test('改写一段只影响那一段，其余 ID 全部不变', async () => {
  // 这是选择「内容哈希」而不是「序号」的核心理由：
  // 用序号的话，在开头插一段会让后面所有块的 ID 平移，
  // 于是「这条批注属于第 5 段」会在无关的编辑后指向别的段落。
  const before = await collectBlocks(DOC);
  const edited = DOC.replace('第一段。', '改写过的第一段。');
  const after = await collectBlocks(edited);

  assert.equal(before.blocks.length, after.blocks.length);
  const changed = before.blocks.filter((b, i) => b.id !== after.blocks[i].id);
  assert.equal(
    changed.length,
    1,
    `只应有 1 个块变化，实际 ${changed.length} 个`,
  );
  assert.equal(changed[0].text, '第一段。');
});

test('在开头插入一段，其余块的 ID 不受影响', async () => {
  const before = await collectBlocks(DOC);
  const after = await collectBlocks(`新插入的开头。\n\n${DOC}`);

  assert.equal(after.blocks.length, before.blocks.length + 1);
  const beforeIds = new Set(ids(before.blocks));
  const survived = after.blocks.filter((b) => beforeIds.has(b.id));
  assert.equal(
    survived.length,
    before.blocks.length,
    '原有的块应当全部保持原 ID',
  );
});

test('标题带上与页面上一致的锚点', async () => {
  const { headings } = await collectBlocks(DOC);
  assert.equal(headings.length, 2);
  assert.equal(headings[0].slug, '第一章');
  assert.equal(headings[1].slug, '第一章一');
  // 层级是**渲染后**的：管线把正文标题整体下移一级（页面标题独占 h1），
  // 所以源文的 `#` 这里是 2。块来自渲染树，描述的应当是预览里看到的样子 ——
  // 否则编辑器的目录会和右边的预览对不上。
  assert.deepEqual(
    headings.map((h) => h.level),
    [2, 3],
    '源文是 # / ##，渲染后是 h2 / h3',
  );

  // 关键：锚点必须与渲染器给页面算出来的**同一个** ——
  // 两套 slug 规则迟早会不一致，而锚点是外部链接的一部分
  const { code } = await renderMarkdown(DOC);
  for (const h of headings) {
    assert.ok(
      code.includes(`id="${h.slug}"`),
      `渲染产物里没有 id="${h.slug}"，说明块模块自己算了一套锚点`,
    );
  }
});

test('块信息是算出来的，不改变渲染产物一个字节', async () => {
  // 若把 data-block-id 写进 HTML，公开站每页会多出几百个属性，
  // 而且预览与发布不再逐字相同、check:preview 那道闸门就得放宽。
  // 这条用例守着「产物零影响」这个决定。
  const { code } = await renderMarkdown(DOC);
  await collectBlocks(DOC);
  const { code: again } = await renderMarkdown(DOC);

  assert.equal(code, again);
  assert.ok(!code.includes('blk-'), '产物里不该出现块 ID');
  assert.ok(!code.includes('data-block-id'), '产物里不该出现块属性');
});

test('位置信息取得到就给，取不到就是 null，不编造', async () => {
  const { blocks } = await collectBlocks(DOC);
  const para = blocks.find((b) => b.kind === 'paragraph');
  assert.equal(typeof para.startLine, 'number');
  assert.equal(typeof para.endLine, 'number');

  // Shiki 会用一个新节点替换 <pre>，位置在那一步丢失。
  // 取不到时必须如实为 null —— 编一个假行号会让编辑器跳错地方。
  const code = blocks.find((b) => b.kind === 'code');
  assert.ok(code, '应当识别出代码块');
  assert.equal(
    code.startLine,
    null,
    '代码块的位置本轮取不到；将来若 Astro/Shiki 保留了位置，这条会红，届时改成断言数字',
  );
});

test('三种文档类型共用同一套 ID 规则', async () => {
  // ARTICLE / KNOWLEDGE / PROJECT 在这个项目里都是 Markdown。
  // 「共用稳定 block ID」的意思就是同一段文字在三种文档里得到同一个 ID。
  const shared = '这条结论在三种文档里都出现过。';
  const article = `# 文章\n\n${shared}\n`;
  const knowledge = `## 知识点\n\n${shared}\n`;
  const project = `### 项目记录\n\n${shared}\n`;

  const pick = async (md) =>
    (await collectBlocks(md)).blocks.find((b) => b.kind === 'paragraph').id;

  const [a, k, p] = await Promise.all([
    pick(article),
    pick(knowledge),
    pick(project),
  ]);
  assert.equal(a, k);
  assert.equal(k, p);
});

test('空文档与纯空白不炸', async () => {
  for (const md of ['', '\n\n', '   \n  \n']) {
    const { blocks, headings } = await collectBlocks(md);
    assert.deepEqual(blocks, []);
    assert.deepEqual(headings, []);
  }
});

test('collectHeadings 与 collectBlocks 的标题部分一致', async () => {
  const { headings } = await collectBlocks(DOC);
  assert.deepEqual(await collectHeadings(DOC), headings);
});

test('块摘要截断到 120 字，但 ID 仍按全文算', async () => {
  const long = '很长的一段。'.repeat(80);
  const { blocks } = await collectBlocks(`${long}\n`);
  const para = blocks.find((b) => b.kind === 'paragraph');
  assert.ok(para.text.length <= 120, '摘要要截断，否则编辑器列表会被撑爆');

  // 截断只影响展示：把同一段加长一点，ID 应当变化（说明算的是全文）
  const longer = `${long}再多一句。\n`;
  const other = (await collectBlocks(longer)).blocks.find(
    (b) => b.kind === 'paragraph',
  );
  assert.notEqual(other.id, para.id);
});
