// 来源分级（KNOW-002）。
//
// ── 为什么分级要按域名算，而不是由调用方写 ──
//
// 「这条依据的是官方文档」是一个**可核对的事实**，不是一句自述。
// 如果让调用方（包括 AI）自己填 tier，那么「官方」会退化成
// 「谁写谁说了算」—— 而分级存在的全部意义就是区分可信度，
// 一个由被评价者自己填的等级等于没有等级。
//
// 所以这里按 URL 的域名查一张**显式注册表**得出等级。
// 表外的域名一律是 `unverified`，**不会**默认成高等级 ——
// 未知来源的风险必须体现在等级里。
//
// ── 五个等级，从高到低 ──
//
//   official    项目/组织的官方文档、规范原文
//   primary     一手材料：论文、RFC、官方仓库代码
//   secondary   二手整理：教程、博客、百科
//   unverified  有地址，但不在已知表里 —— 需要人看一眼
//   unsourced   根本没有地址
//
// 「查不到」与「没有」是两件事，所以后两个等级分开。

/** 域名后缀 → 等级。用后缀匹配，因此子域自动覆盖。 */
const DOMAIN_TIERS = [
  // ── official：规范与官方文档 ──
  ['w3.org', 'official'],
  ['ietf.org', 'official'],
  ['rfc-editor.org', 'official'],
  ['docs.github.com', 'official'],
  ['developer.mozilla.org', 'official'],
  ['nodejs.org', 'official'],
  ['docs.astro.build', 'official'],
  ['astro.build', 'official'],
  ['sqlite.org', 'official'],
  ['python.org', 'official'],
  ['pytorch.org', 'official'],
  ['arxiv.org', 'primary'],
  ['doi.org', 'primary'],
  ['github.com', 'primary'],
  ['gitlab.com', 'primary'],
  ['npmjs.com', 'primary'],
  ['zhihu.com', 'secondary'],
  ['juejin.cn', 'secondary'],
  ['csdn.net', 'secondary'],
  ['wikipedia.org', 'secondary'],
  ['stackoverflow.com', 'secondary'],
];

/**
 * 判定一个来源的等级。
 *
 * @param {string} [url]
 * @returns {'official'|'primary'|'secondary'|'unverified'|'unsourced'}
 */
export function tierOf(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return 'unsourced';

  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // 地址不合法 —— 与「没有地址」同样无法核对。
    // **不报错**：一条写错格式的 URL 不该让整份草稿无法保存，
    // 它该被标成 unverified 然后等人修。
    return 'unverified';
  }

  // 逐条比对后缀，`host === domain` 或 `host.endsWith('.' + domain)`
  // 才算命中 —— 否则 `evilw3.org` 会被 `w3.org` 误判成官方
  for (const [domain, tier] of DOMAIN_TIERS) {
    if (host === domain || host.endsWith(`.${domain}`)) return tier;
  }
  return 'unverified';
}

/** 等级的可比较强弱。数字越大越可信。 */
const RANK = {
  unsourced: 0,
  unverified: 1,
  secondary: 2,
  primary: 3,
  official: 4,
};

export const TIERS = Object.keys(RANK);

/** 一组来源里最强的那一级。没有任何来源时是 `unsourced`。 */
export function strongestTier(sources = []) {
  if (sources.length === 0) return 'unsourced';
  return sources.reduce(
    (best, s) => (RANK[tierOf(s.url)] > RANK[best] ? tierOf(s.url) : best),
    'unsourced',
  );
}

/**
 * 这条来源够不够支撑一句主张？
 *
 * **门槛是 `secondary`**，理由：`unverified` 意味着我们连它是什么都不知道。
 * 而 `unsourced` 是根本没有出处。这两种都不该被当作「有依据」。
 */
export function isSupported(sources = []) {
  return RANK[strongestTier(sources)] >= RANK.secondary;
}

/** 给人看的等级说明。 */
export const TIER_LABEL = {
  official: '官方文档 / 规范',
  primary: '一手材料（论文、官方仓库）',
  secondary: '二手整理（教程、博客）',
  unverified: '未核实的来源',
  unsourced: '没有来源',
};
