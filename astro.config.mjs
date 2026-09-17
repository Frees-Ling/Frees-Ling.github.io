// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// Markdown 管线**不在这里定义** —— 它是公开站与 Studio 预览的共用真相源。
// 在这里复制一份就等于允许两边漂移，而预览漂移是编辑器最昂贵的缺陷
// （见 EDITOR-001 / docs/article-renderer.md）。
import { markdownConfig } from './src/utils/markdown-pipeline.mjs';

export default defineConfig({
  site: 'https://frees-ling.dev',
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: markdownConfig(),
});
