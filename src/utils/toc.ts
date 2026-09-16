// 目录模型。
//
// 派生逻辑放在这里而不是组件 frontmatter 里，理由同 ADR-015：
// `.astro` 的 frontmatter 一复杂，Astro 对 `Props` 的类型解析就会静默失效，
// 那种错误不报错、只是类型检查悄悄不生效。

/** Astro `render()` 给出的标题。`depth` 是**归一化之后**的层级（正文最浅为 2）。 */
export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

export interface TocChapter {
  heading: Heading;
  children: Heading[];
}

export interface TocModel {
  /** true 时用「章节 + 可折叠子项」，false 时用平铺列表。 */
  grouped: boolean;
  flat: Heading[];
  chapters: TocChapter[];
}

/**
 * 超过这么多标题就改用分组折叠。
 *
 * 这不是拍脑袋的阈值，而是被实测的巨大落差支持的：
 * 17 篇里第二长的 `learn-for-github` 有 31 个标题，`transformer` 有 651 个 ——
 * 差 20 倍。中间没有样本，所以阈值取在 40 落在空档里，怎么调都不会误伤。
 *
 * 平铺模式下列到第 4 级，是为了**保持改动前的行为不变**：
 * 归一化之前正文标题是 h1/h2/h3，过滤 `depth <= 3`；
 * 现在整体下移一级成了 h2/h3/h4，同一条规则要写成 `depth <= 4` 才等价。
 */
export const TOC_GROUP_THRESHOLD = 40;
const FLAT_MAX_DEPTH = 4;

export function buildToc(headings: Heading[]): TocModel {
  const grouped = headings.length > TOC_GROUP_THRESHOLD;

  if (!grouped) {
    return {
      grouped: false,
      flat: headings.filter((h) => h.depth <= FLAT_MAX_DEPTH),
      chapters: [],
    };
  }

  // 最浅的一级即章节。归一化保证正文最浅为 2，但这里不写死 2 ——
  // 万一将来某篇只剩更深的标题，也不该凭空造出章节。
  const top = headings.reduce(
    (min, h) => (h.depth < min ? h.depth : min),
    Number.POSITIVE_INFINITY,
  );

  const chapters: TocChapter[] = [];
  for (const heading of headings) {
    if (heading.depth === top) {
      chapters.push({ heading, children: [] });
      continue;
    }
    // 只收**直接子级**：更深的层级留给正文自己，目录再往下展开就没人看得完了
    if (heading.depth === top + 1 && chapters.length > 0) {
      chapters[chapters.length - 1].children.push(heading);
    }
  }

  return { grouped: true, flat: [], chapters };
}
