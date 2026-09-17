// 全站唯一的 Markdown 管线配置（EDITOR-001）。
//
// ── 为什么必须只有一份 ──
//
// 公开站与 Studio 预览必须渲染出**同一份 HTML**。
// 「预览漂移」是编辑器最昂贵的缺陷：用户看到什么就该发布什么，
// 而漂移的表现是「在编辑器里排版是对的，发布出去不一样」——
// 等到发现时稿子已经发出去了。
//
// 防漂移不能靠「两边都记得改」：那是约定，而约定会失效。
// 这里把它变成结构：**两边引用同一个对象**，改了这里两边一起变，
// 忘了改就两边一起错 —— 而一起错至少是可见的、能被对比测出来的。
//
// ── 为什么单独一个文件 ──
//
// `astro.config.mjs` 是构建期配置，Studio 是运行时程序，两者运行在不同的
// 上下文里。把配置放进任何一边，另一边引用它就会把整套依赖拖进来。

import { createMarkdownProcessor, unified } from '@astrojs/markdown-remark';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

import { rehypeLazyImages } from './rehype-lazy-images.mjs';
import { rehypeNormalizeHeadings } from './rehype-normalize-headings.mjs';

/**
 * 传给 `unified()` 的管线配置。**只放 processor 认识的东西。**
 *
 * ⚠️ `shikiConfig` **不在**这里。它是 `markdown` 配置的**兄弟**键，
 * 不是 `unified()` 的选项 —— 放进来的话不会报错，只会被静默忽略，
 * 于是代码块的主题掉回默认的 `github-dark`、`wrap` 失效。
 *
 * 实测踩过：抽取管线时把它挪进了 unified()，构建照样成功，
 * 只有 3 篇文章的产物字符数变了几个 —— 是覆盖率闸门（`check:coverage`）
 * 报出来的，不是构建报出来的。**这类错误构建永远不会告诉你。**
 */
export const MARKDOWN_PIPELINE = {
  remarkPlugins: [remarkMath],
  rehypePlugins: [
    // KaTeX 放前面：它把 `$…$` 变成一堆 span，
    // 后面的插件看到的是最终结构
    [rehypeKatex, { strict: false }],
    // 让页面标题成为唯一的 h1；不改 .md，也不改任何 id
    rehypeNormalizeHeadings,
    // 给正文图片补 loading="lazy" / decoding="async"；同样不改 .md，
    // 也不动图片 URL。**不补 width/height** —— 理由见该文件顶部
    rehypeLazyImages,
  ],
};

/** Shiki 配置。`markdown` 下的兄弟键，与 processor 平级。
 * @type {const} */
export const SHIKI_CONFIG = {
  theme: 'github-dark-default',
  wrap: true,
};

/**
 * 组装 Astro 的 `markdown` 配置。
 *
 * 公开站用它，Studio 预览必须用**同一份** ——
 * `processor` 与 `shikiConfig` 少任何一个，两边的代码块就会长得不一样。
 */
export function markdownConfig() {
  return { processor: unified(MARKDOWN_PIPELINE), shikiConfig: SHIKI_CONFIG };
}

/**
 * 建一个可复用的渲染器，供 Studio 预览使用。
 *
 * **不要缓存成模块级单例**：处理器持有 Shiki 的高亮器实例，
 * 而调用方可能在不同的生命周期里需要新建（例如换主题）。
 * 建一次的成本在毫秒级，而共享实例带来的隐性状态要难查得多。
 */
export async function createPreviewProcessor(overrides = {}) {
  return createMarkdownProcessor({
    ...MARKDOWN_PIPELINE,
    // 预览也必须用同一个 Shiki 配置，否则代码块颜色对不上 ——
    // 而代码块恰恰是最容易一眼看出「预览和发布不一样」的地方
    shikiConfig: SHIKI_CONFIG,
    ...overrides,
  });
}

/**
 * 渲染一段 Markdown，返回 `{ code, metadata }`。
 *
 * `metadata.headings` 与 Astro 的 `render()` 给出的是同一份东西 ——
 * 目录、锚点、分章都建立在它之上，因此预览与正式渲染必须一致。
 */
export async function renderMarkdown(markdown, overrides = {}) {
  const processor = await createPreviewProcessor(overrides);
  return processor.render(markdown);
}
