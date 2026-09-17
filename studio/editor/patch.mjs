// AI 选区 diff 协议（EDITOR-002）。
//
// ── 它要挡住的是什么 ──
//
// 让 AI 改一段文字，风险不在「改得不好」—— 那看得见。风险在
// **它改了别处而没人发现**：一次「帮我润色这句」顺手动了三段之外的内容，
// diff 里混在一堆改动中间，而人只会看自己圈出来的那块。
//
// 所以这一层的核心不是「生成 patch」，是**边界权威**：
//
//   · 选区由**编辑器**给出，不是由 AI 声称
//   · 每一个 hunk 都必须落在选区内，否则**整份 patch 作废**
//   · 每个 hunk 声称的原文必须与当前内容**逐字相符**，否则说明它是对着
//     旧版本生成的，整份作废
//   · **不做部分应用**：要么全成，要么全不成
//
// 最后一条是关键：部分应用会产生一个「一半是 AI 改的、一半是原来的」
// 文档，而没有任何东西标记出分界在哪。那比完全失败难收拾得多。
//
// ── 为什么边界不在提示词里 ──
//
// 「请只修改选区内的内容」是一句请求，而请求会被违反 —— 也可能被
// 提示词注入绕开（检索出来的文档内容同样是不可信输入）。
// 所以边界在这里是**校验**，不是嘱咐。

import { collectBlocks } from '../../src/utils/blocks.mjs';

const MAX_HUNKS = 200;
const MAX_TEXT = 200_000;

/**
 * 一份 patch 的结构。
 *
 * @typedef {object} Patch
 * @property {string} noteId
 * @property {string[]} selection   编辑器给的选区：一组 block id
 * @property {Hunk[]} hunks
 * @property {string} [explanation] AI 对这次改动的说明
 * @property {string[]} [sourceGaps] 它**没有依据**的地方 —— 见下
 */

/**
 * 「source gap」是这份协议里最容易被省略、也最该保留的一项：
 * AI 被要求改进一段它其实没有依据的文字时，正确的输出不是编一个更好的版本，
 * 而是**说出自己在哪一处没有依据**。把它做成结构里的一个字段，
 * 而不是让模型自由发挥写在解释里，是为了让它必须被显示出来。
 */

function requireString(value, what) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${what}不能为空`);
  }
  if (value.length > MAX_TEXT) {
    throw new Error(`${what}过长（上限 ${MAX_TEXT} 字符）`);
  }
  return value;
}

/**
 * 校验一份 patch。**不通过就抛错，绝不返回「部分可用」的结果。**
 *
 * @returns {{ok: true, hunks: object[]} | never}
 */
export function validatePatch(patch, { selection, blocks }) {
  if (!patch || typeof patch !== 'object') {
    throw new Error('patch 必须是一个对象');
  }

  const allowed = new Set(selection ?? []);
  if (allowed.size === 0) {
    throw new Error('选区为空 —— 没有选区就没有可改的范围，拒绝执行');
  }

  if (!Array.isArray(patch.hunks) || patch.hunks.length === 0) {
    throw new Error('patch 里没有任何改动');
  }
  if (patch.hunks.length > MAX_HUNKS) {
    throw new Error(`改动过多（上限 ${MAX_HUNKS} 处）`);
  }

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const seen = new Set();
  const checked = [];

  for (const [index, hunk] of patch.hunks.entries()) {
    const where = `第 ${index + 1} 处改动`;

    if (!hunk || typeof hunk !== 'object') {
      throw new Error(`${where}不是对象`);
    }

    // ── 边界权威：越界即整份作废 ──
    if (!allowed.has(hunk.blockId)) {
      throw new Error(
        `${where}试图修改选区之外的块（${hunk.blockId}）—— 整份 patch 作废。` +
          '选区是编辑器给的，不由 AI 声称。',
      );
    }

    // 同一个块改两次：后一次会覆盖前一次，而「哪一次生效」取决于顺序，
    // 那是一种没人能一眼看出的不确定性
    if (seen.has(hunk.blockId)) {
      throw new Error(`${where}重复修改同一个块（${hunk.blockId}）`);
    }
    seen.add(hunk.blockId);

    const block = byId.get(hunk.blockId);
    if (!block) {
      throw new Error(`${where}指向的块在当前文档里不存在（${hunk.blockId}）`);
    }

    requireString(hunk.after, `${where}的新内容`);

    // ── 陈旧检测：声称的原文必须与现状逐字相符 ──
    //
    // 不符说明这份 patch 是对着**旧版本**生成的。放它过去的话，
    // 结果是「AI 按它记忆里的内容改，而那段已经变了」——
    // 覆盖掉的正是用户刚写的东西。
    if (typeof hunk.before !== 'string') {
      throw new Error(`${where}缺少 before（无法确认它改的是哪一版）`);
    }
    if (hunk.before.trim() !== block.text.trim()) {
      throw new Error(
        `${where}的原文与当前内容不符 —— 这份 patch 是对旧版本生成的，` +
          '拒绝应用（否则会覆盖掉期间的新改动）',
      );
    }

    checked.push({
      blockId: hunk.blockId,
      before: hunk.before,
      after: hunk.after,
      startLine: block.startLine,
      endLine: block.endLine,
    });
  }

  return { ok: true, hunks: checked };
}

/**
 * 把校验过的改动套到正文上。
 *
 * 按**行号从后往前**替换：从前往后改会让后面所有块的行号偏移，
 * 于是第二处之后就全错位了 —— 而错位的结果是改到了别的段落上，
 * 恰好是这一层要防的事。从后往前则前面的行号始终有效。
 */
export function applyHunks(body, hunks) {
  const lines = body.split('\n');

  // 行号缺失的块（例如代码块，Shiki 重排后位置丢失）不能按行替换
  const positioned = hunks.filter((h) => h.startLine !== null);
  const unpositioned = hunks.filter((h) => h.startLine === null);
  if (unpositioned.length > 0) {
    throw new Error(
      `有 ${unpositioned.length} 处改动所在的块拿不到行号，无法安全替换。` +
        '这类块（例如代码块）目前不支持自动应用 —— 静默跳过会让改动看起来"应用成功"了，' +
        '而实际没改。',
    );
  }

  const ordered = [...positioned].sort((a, b) => b.startLine - a.startLine);
  for (const hunk of ordered) {
    // 行号是 1-based，数组是 0-based
    lines.splice(
      hunk.startLine - 1,
      hunk.endLine - hunk.startLine + 1,
      ...hunk.after.split('\n'),
    );
  }
  return lines.join('\n');
}

/**
 * 完整的「生成 → 校验 → 应用」。
 *
 * @returns 应用后的正文
 * @throws 任何一处不合法都抛错，**不做部分应用**
 */
export async function applyPatch(db, { noteId, patch, body, scope }) {
  if (typeof body !== 'string') throw new Error('需要正文才能校验 patch');
  if (!noteId) throw new Error('需要 noteId');

  // 用与本层同一个管线切块 —— 块 id 必须与编辑器看到的是同一套，
  // 否则「选中的块」与「校验时的块」会对不上，而那种错位是静默的
  const { blocks } = await collectBlocks(body);
  const selection = patch?.selection ?? scope?.blockIds ?? [];

  const { hunks } = validatePatch(patch, { selection, blocks });
  return applyHunks(body, hunks);
}

/** 供界面展示：这份 patch 会改哪些块、改成什么。 */
export function describePatch(patch) {
  return {
    hunks: (patch.hunks ?? []).map((h) => ({
      blockId: h.blockId,
      from: h.before,
      to: h.after,
    })),
    explanation: patch.explanation ?? '',
    // 没有依据的地方必须**默认出现在列表里**，哪怕是空的 ——
    // 让调用方必须显式处理它，而不是因为它不存在就忘了显示
    sourceGaps: patch.sourceGaps ?? [],
  };
}
