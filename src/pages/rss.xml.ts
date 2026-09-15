import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { byNewest, postHref } from '../utils/posts';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(byNewest);
  return rss({
    title: 'Frees Blog',
    description: '在代码、智能与生活之间，记录仍在生长的想法。',
    site: context.site ?? 'https://frees-ling.github.io',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.published,
      link: postHref(post),
    })),
    customData: '<language>zh-CN</language>',
  });
}
