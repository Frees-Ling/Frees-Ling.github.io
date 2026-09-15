import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export function byNewest(a: Post, b: Post) {
  return b.data.published.getTime() - a.data.published.getTime();
}

export function normalizeCategory(value = '') {
  const category = value.trim().toLowerCase();
  if (!category || category === 'daily') return '生活';
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

export function readingMinutes(post: Post) {
  const words = (post.body ?? '').replace(/```[\s\S]*?```/g, '').length;
  return Math.max(1, Math.ceil(words / 500));
}
