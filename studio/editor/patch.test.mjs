// AI 选区 diff 协议测试（EDITOR-002）。
//
// 这一层的验收是一句否定句：「无越界静默修改」。所以用例几乎全是
// **试图越界**的各种方式，而不是「正常流程能不能走通」。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePatch,
  applyHunks,
  applyPatch,
  describePatch,
} from './patch.mjs';
import { collectBlocks } from '../../src/utils/blocks.mjs';

const DOC = ['第一段。', '', '第二段。', '', '第三段。'].join('\n');

/** 取到块与它们的 id，模拟编辑器里的选区。 */
async function setup(md = DOC) {
  const { blocks } = await collectBlocks(md);
  const paragraphs = blocks.filter((b) => b.kind === 'paragraph');
  return { blocks, paragraphs, ids: paragraphs.map((b) => b.id) };
}

/** 造一份「正常」的 patch。 */
const hunkFor = (block, after) => ({
  blockId: block.id,
  before: block.text,
  after,
});

// ── 正常路径（先确认协议本身能用）──

test('落在选区内的改动可以应用', async () => {
  const { paragraphs, ids } = await setup();
  const patch = {
    selection: [ids[1]],
    hunks: [hunkFor(paragraphs[1], '改过的第二段。')],
    explanation: '润色了措辞',
    sourceGaps: [],
  };
  const result = await applyPatch(null, { noteId: 'n', patch, body: DOC });
  assert.equal(
    result,
    ['第一段。', '', '改过的第二段。', '', '第三段。'].join('\n'),
  );
});

// ── 越界：这是这一层存在的理由 ──

test('改选区之外的块 → 整份作废', async () => {
  const { paragraphs, ids } = await setup();
  const patch = {
    selection: [ids[1]],
    hunks: [
      hunkFor(paragraphs[1], '第二段改了'),
      hunkFor(paragraphs[2], '第三段也顺手改了'), // ← 越界
    ],
  };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /选区之外/,
    '越界必须让**整份** patch 作废，而不是只丢掉那一处',
  );
});

test('一处越界就全不作废 —— 不允许部分应用', async () => {
  const { paragraphs, ids } = await setup();
  const patch = {
    selection: ids,
    hunks: [
      hunkFor(paragraphs[0], 'ok'),
      { blockId: 'blk-不存在的', before: 'x', after: 'y' },
    ],
  };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /不存在/,
  );
});

test('空选区一律拒绝 —— 没有选区就没有可改的范围', async () => {
  const { paragraphs } = await setup();
  const patch = { selection: [], hunks: [hunkFor(paragraphs[0], 'x')] };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /选区为空/,
  );
});

test('同一个块改两次被拒绝（哪一次生效取决于顺序）', async () => {
  const { paragraphs, ids } = await setup();
  const patch = {
    selection: [ids[0]],
    hunks: [hunkFor(paragraphs[0], 'A'), hunkFor(paragraphs[0], 'B')],
  };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /重复修改/,
  );
});

// ── 陈旧检测 ──

test('before 与当前内容不符 → 拒绝（这份 patch 是对旧版本生成的）', async () => {
  const { paragraphs, ids } = await setup();
  const patch = {
    selection: [ids[0]],
    hunks: [{ blockId: ids[0], before: '这是旧的第一段。', after: '新的' }],
  };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /旧版本/,
    '放它过去就会覆盖掉期间的新改动',
  );
});

test('缺少 before 也拒绝 —— 无法确认它改的是哪一版', async () => {
  const { ids } = await setup();
  const patch = {
    selection: [ids[0]],
    hunks: [{ blockId: ids[0], after: 'x' }],
  };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /before/,
  );
});

test('陈旧检测在**整份**层面生效：一处陈旧则全不作废', async () => {
  const { paragraphs, ids } = await setup();
  const patch = {
    selection: ids,
    hunks: [
      hunkFor(paragraphs[0], '正常改动'),
      { blockId: ids[2], before: '这段已经变了', after: 'x' },
    ],
  };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /旧版本/,
  );
});

// ── 结构性拒绝 ──

test('没有改动的 patch 被拒绝', async () => {
  await assert.rejects(
    () =>
      applyPatch(null, {
        noteId: 'n',
        patch: { selection: ['x'], hunks: [] },
        body: DOC,
      }),
    /没有任何改动/,
  );
});

test('改动条数超量被拒绝', async () => {
  const { ids } = await setup();
  const hunks = Array.from({ length: 201 }, (_, i) => ({
    blockId: `${ids[0]}-${i}`,
    before: 'x',
    after: 'y',
  }));
  await assert.rejects(
    () =>
      applyPatch(null, {
        noteId: 'n',
        patch: { selection: ids, hunks },
        body: DOC,
      }),
    /改动过多/,
  );
});

test('新内容为空被拒绝（空改动不是改动，是删除，需要另一条路径）', async () => {
  const { paragraphs, ids } = await setup();
  const patch = { selection: [ids[0]], hunks: [hunkFor(paragraphs[0], '   ')] };
  await assert.rejects(
    () => applyPatch(null, { noteId: 'n', patch, body: DOC }),
    /不能为空/,
  );
});

// ── 行号替换的方向 ──

test('多处改动时不会因为行号偏移而改错段落', async () => {
  const md = ['一。', '', '二。', '', '三。', '', '四。'].join('\n');
  const { blocks } = await collectBlocks(md);
  const ps = blocks.filter((b) => b.kind === 'paragraph');

  // 全部改成长度差异很大的内容 —— 从前往后替换的话，第二处之后必然错位
  const after = applyHunks(md, [
    {
      blockId: ps[0].id,
      before: ps[0].text,
      after: '一。'.repeat(20),
      startLine: ps[0].startLine,
      endLine: ps[0].endLine,
    },
    {
      blockId: ps[2].id,
      before: ps[2].text,
      after: '三。',
      startLine: ps[2].startLine,
      endLine: ps[2].endLine,
    },
  ]);
  assert.ok(after.includes('三。'), '第三段应当被正确替换');
  assert.ok(after.endsWith('四。'), '最后一段不该被动到');
});

test('拿不到行号的块（代码块）明确报错，而不是静默跳过', async () => {
  const md = ['正文。', '', '```js', 'const a = 1;', '```'].join('\n');
  const { blocks } = await collectBlocks(md);
  const code = blocks.find((b) => b.kind === 'code');
  assert.equal(code.startLine, null, '前置条件：代码块没有行号');

  assert.throws(
    () =>
      applyHunks(md, [
        {
          blockId: code.id,
          before: code.text,
          after: 'x',
          startLine: null,
          endLine: null,
        },
      ]),
    /拿不到行号/,
    '静默跳过会让改动看起来"应用成功"了，而实际没改',
  );
});

// ── 结构化输出 ──

test('describePatch 给出 from/to、解释与 source gap', () => {
  const d = describePatch({
    hunks: [{ blockId: 'b1', before: '旧', after: '新' }],
    explanation: '改了措辞',
    sourceGaps: ['关于作者的真实意图我没有依据'],
  });
  assert.deepEqual(d.hunks, [{ blockId: 'b1', from: '旧', to: '新' }]);
  assert.equal(d.explanation, '改了措辞');
  assert.deepEqual(d.sourceGaps, ['关于作者的真实意图我没有依据']);
});

test('sourceGaps 缺省时是空数组而不是 undefined', () => {
  // 界面上要显示「它在哪里没有依据」。若字段可能不存在，
  // 显示逻辑就会写成「有才显示」—— 于是「没有依据」和「字段忘了填」
  // 长得一模一样
  const d = describePatch({ hunks: [] });
  assert.deepEqual(d.sourceGaps, []);
  assert.equal(d.explanation, '');
});

// ── 边界与「块」定义一致 ──

test('选区用的是编辑器同一套 block id', async () => {
  const { ids } = await setup();
  // patch 模块内部也用 collectBlocks —— 若两处用了不同规则，
  // 「选中的块」与「校验时的块」会对不上，而那种错位是静默的
  assert.ok(ids.every((id) => id.startsWith('blk-')));
  const { blocks } = await collectBlocks(DOC);
  assert.deepEqual(
    blocks.filter((b) => b.kind === 'paragraph').map((b) => b.id),
    ids,
  );
});
