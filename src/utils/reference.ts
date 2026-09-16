import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * FIELD LOG 参考编号 —— `FL-YYMM-NNN`
 *
 *   FL      Frees Ling
 *   YYMM    发布年月
 *   NNN     该月内的序号，从 001 起
 *
 * 例：2026-07-23 发布的 thinking.md → `FL-2607-001`
 *
 * ## 稳定性
 *
 * 编号必须**确定性且稳定**，不能每次构建随机生成，也不能因为新增文章而
 * 让既有文章的编号漂移。
 *
 * 为此本模块采用两级策略：
 *
 * 1. **frontmatter 显式声明的 `reference` 优先** —— 一旦写入即永不改变。
 *    这是最终的稳定来源。
 * 2. **未声明时按 (发布日期, id) 排序推导** —— 给定同一批文章，结果完全确定。
 *    注意：在同一个月内插入排序靠前的新文章，会让该月靠后的编号后移。
 *
 * 因此本模块当前只提供**数据接口**，不批量改写文章 frontmatter。
 * 待编号在页面上正式启用时，可运行一次性脚本把推导结果固化进 frontmatter，
 * 之后便完全稳定（见 docs/redesign-progress.md 的 P7 计划）。
 */
export function buildReferenceIndex(posts: Post[]): Map<string, string> {
  const index = new Map<string, string>();

  // ① 显式声明的直接采用
  const derived: Post[] = [];
  for (const post of posts) {
    const explicit = (post.data as { reference?: string }).reference;
    if (explicit) index.set(post.id, explicit);
    else derived.push(post);
  }

  // ② 其余按月份分组，组内按 (发布日期, id) 排序后编号
  const byMonth = new Map<string, Post[]>();
  for (const post of derived) {
    const d = post.data.published;
    const key = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = byMonth.get(key) ?? [];
    list.push(post);
    byMonth.set(key, list);
  }

  for (const [key, list] of byMonth) {
    list.sort((a, b) => {
      const delta = a.data.published.getTime() - b.data.published.getTime();
      // 同日发布时用 id 兜底，保证排序确定
      return delta !== 0 ? delta : a.id.localeCompare(b.id);
    });
    list.forEach((post, i) => {
      index.set(post.id, `FL-${key}-${String(i + 1).padStart(3, '0')}`);
    });
  }

  return index;
}

/** 取单篇文章的编号；索引里没有时返回 undefined，调用方自行降级。 */
export function referenceOf(
  index: Map<string, string>,
  post: Post,
): string | undefined {
  return index.get(post.id);
}
