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

  // ── 图片管线（PERF-001）──
  //
  // `layout: 'constrained'` 是这里的关键一档：它让图片按容器宽度出多档
  // （srcset + sizes），而不是把一张 1200px 的图丢给 390px 的手机。
  //
  // `responsiveStyles` 注入的是**宽高比与宽度约束**，不是装饰 ——
  // 没有它，图片在加载完成前高度为 0，加载完成的瞬间把下面的内容推下去，
  // 那就是 CLS。这是 CLS 最直接的一味药，比任何 JS 方案都便宜。
  //
  // 断点取 480 / 768 / 1024 / 1440 / 1920：与 CSS 里的断点**不是一回事**，
  // 不必对齐（CSS 断点决定布局怎么变，图片断点决定取哪一档像素）。
  image: {
    layout: 'constrained',
    responsiveStyles: true,
    breakpoints: [480, 768, 1024, 1440, 1920],
  },

  markdown: markdownConfig(),
});
