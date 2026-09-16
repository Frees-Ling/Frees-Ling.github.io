/**
 * 文章查询层 —— 所有列表页共用的取数与筛选。
 *
 * 为什么要有这一层：此前 6 个页面各自 `getCollection` + 各自的排序/分组/筛选，
 * 结果是同一个「按时间倒序」写了 6 遍，而 `/notes/` 与 `/research/`
 * 各自藏了一份硬编码白名单。把取数收在一处之后，
 * 页面只负责「怎么呈现」，不再负责「取哪些」。
 */

import { getCollection } from 'astro:content';
import { sections, type Section } from '../data/sections';
import { byNewest, normalizeCategory, normalizeTags, type Post } from './posts';

/**
 * 正文实质长度阈值。
 *
 * 为什么是 600：17 篇去代码块后的真实分布有一个明显断层 ——
 *   26 / 220 / 234 / 248 / 447 / 555  ← 6 篇短记录
 *   751 / 1389 / 1734 / 2492 / 2577 / 2659 / 2715 / 2763 / 3509 / 3823 / 148691
 * 断层落在 555 与 751 之间，600 是这段空档里的整数。
 *
 * 阈值只用于**降权**（排到列表后面并标注），不用于隐藏 ——
 * 隐藏会丢掉 URL、SEO 与外链，而「这里是短记录」本身是诚实的信息。
 *
 * 注意这里排除代码块：一篇 200 行配置的文章不是「空内容」，
 * 但它的正文叙述可能只有两句话。
 */
export const SUBSTANCE_MIN = 600;

/** 全站非草稿文章，按时间倒序。列表页的唯一入口。 */
export async function getAllPosts(): Promise<Post[]> {
  return (await getCollection('posts', ({ data }) => !data.draft)).sort(
    byNewest,
  );
}

export function getLatest(posts: Post[], count: number): Post[] {
  return posts.slice(0, Math.max(0, count));
}

/** 按年份分组，年份从新到旧；组内保持传入的顺序（调用方已按时间排好）。 */
export function getByYear(
  posts: Post[],
): Array<{ year: string; posts: Post[] }> {
  const buckets = new Map<string, Post[]>();
  for (const post of posts) {
    const year = String(post.data.published.getFullYear());
    const bucket = buckets.get(year);
    if (bucket) bucket.push(post);
    else buckets.set(year, [post]);
  }
  return [...buckets]
    .map(([year, items]) => ({ year, posts: items }))
    .sort((a, b) => Number(b.year) - Number(a.year));
}

export function getByTag(posts: Post[], tag: string): Post[] {
  return posts.filter((post) => normalizeTags(post.data.tags).includes(tag));
}

/** 全站标签，按出现次数从多到少 —— 次数相同的按名称，保证构建可复现。 */
export function getAllTags(
  posts: Post[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of normalizeTags(post.data.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

/**
 * 文章是否属于某个栏目。
 *
 * `post.data.section` 是人工字段，一旦填写就对**所有**栏目生效 ——
 * 声明 `section: 'research'` 的文章不会同时出现在随笔里。
 * 这是「人工字段优先」的字面实现：作者说了算，推断只在作者没说时兜底。
 */
export function belongsToSection(post: Post, section: Section): boolean {
  if (post.data.section) return post.data.section === section.id;
  if (section.categories.includes(normalizeCategory(post.data.category))) {
    return true;
  }
  const tags = normalizeTags(post.data.tags);
  return section.tags.some((tag) => tags.includes(tag));
}

export function getBySection(posts: Post[], sectionId: string): Post[] {
  const section = sections.find((item) => item.id === sectionId);
  if (!section) return [];
  return posts.filter((post) => belongsToSection(post, section));
}

/** 正文去代码块后的长度，用于 substance 判定。 */
export function substanceLength(post: Post): number {
  return (post.body ?? '').replace(/```[\s\S]*?```/g, '').trim().length;
}

export function isThin(post: Post): boolean {
  return substanceLength(post) < SUBSTANCE_MIN;
}

/**
 * 拆成「有实质内容」与「短记录」两组，各自保持原有的时间倒序。
 * 调用方负责把 thin 放到后面并标注 —— 这里只做分类，不做呈现决定。
 */
export function splitBySubstance(posts: Post[]): {
  substantial: Post[];
  thin: Post[];
} {
  const substantial: Post[] = [];
  const thin: Post[] = [];
  for (const post of posts) {
    (isThin(post) ? thin : substantial).push(post);
  }
  return { substantial, thin };
}

export interface ListGroup {
  /** 分组标题（年份）。未分组时为空串。 */
  label: string;
  posts: Post[];
}

/**
 * 列表页的分组与降权模型。
 *
 * 这段逻辑原本写在 `PostList.astro` 的 frontmatter 里，但它既不是呈现，
 * 也不依赖任何组件 prop 的类型 —— 放在这里之后组件只负责渲染，
 * 而且可以被单独测试。
 */
export function buildListModel(
  posts: Post[],
  options: { groupBy?: 'none' | 'year'; splitSubstance?: boolean } = {},
): { groups: ListGroup[]; thin: Post[] } {
  const { groupBy = 'none', splitSubstance = false } = options;
  const { substantial, thin } = splitSubstance
    ? splitBySubstance(posts)
    : { substantial: posts, thin: [] as Post[] };

  // 降权只在真的存在短记录、且仍有实质内容时才发生：
  // 一个全是短记录的列表被拆成「空的正文 + 一段短记录」只会更难读。
  const demote = splitSubstance && thin.length > 0 && substantial.length > 0;
  const main = demote ? substantial : posts;

  return {
    groups:
      groupBy === 'year'
        ? getByYear(main).map(({ year, posts: items }) => ({
            label: year,
            posts: items,
          }))
        : [{ label: '', posts: main }],
    thin: demote ? thin : [],
  };
}
