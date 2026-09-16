// @ts-check
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { rehypeNormalizeHeadings } from './src/utils/rehype-normalize-headings.mjs';

export default defineConfig({
  site: 'https://frees-ling.dev',
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [rehypeKatex, { strict: false }],
        // 让页面标题成为唯一的 h1；不改 .md，也不改任何 id。
        // 必须跑在 rehypeKatex 之后：KaTeX 会往公式里塞 <span>，
        // 先跑也不会错，但放在后面读起来更清楚 —— 它只该看见最终的结构
        rehypeNormalizeHeadings,
      ],
    }),
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
