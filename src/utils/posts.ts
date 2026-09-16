import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export function byNewest(a: Post, b: Post) {
  return b.data.published.getTime() - a.data.published.getTime();
}

/**
 * 分类归一化。
 *
 * `category` 为空串时返回「随笔」而不是「生活」——
 * 这里曾经把空串和 `daily` 一起映射为生活，于是 `thinking.md`
 * （frontmatter 写的是 `category: ''`）被归成生活，而它的标签与本意都是随笔，
 * 结果一篇 3800 字的文章从 /notes/ 和 /research/ 两个栏目页同时消失，
 * 且没有任何提示。空串应当与「没写」同义，而 schema 对没写的默认值就是随笔。
 *
 * `daily → 生活` 保持不变：那 2 篇（AI、Simple-AI）本来就属于生活。
 */
export function normalizeCategory(value = '') {
  const category = value.trim().toLowerCase();
  if (!category) return '随笔';
  if (category === 'daily') return '生活';
  if (category === 'note' || category === 'test') return '笔记';
  if (category === 'develop log') return '开发';
  return value.trim();
}

export function normalizeTags(tags: string[]) {
  return tags
    .flatMap((tag) => tag.split(/[，,]/))
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function postHref(post: Post) {
  return `/blog/${post.id.replace(/\.(md|mdx)$/i, '')}/`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** 年份已经在分组标题里出现时使用，避免「2026年」重复两遍。 */
export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function readingMinutes(post: Post) {
  const words = (post.body ?? '').replace(/```[\s\S]*?```/g, '').length;
  return Math.max(1, Math.ceil(words / 500));
}
