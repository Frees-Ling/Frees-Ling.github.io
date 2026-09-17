// 正文图片的加载属性（PERF-001）。
//
// ── 它针对的是什么 ──
//
// 全站 17 篇文章里有 41 张图，全部托管在第三方（`vip.123pan.cn`），
// 写法是裸的 `![image](https://…)`。渲染出来就是 `<img src alt>` ——
// 没有 `loading`，没有 `decoding`。
//
// 没有 `loading="lazy"` 的后果不是「慢一点」：浏览器会**同时**向那台
// 服务器发起全部 41 个请求（长文单篇就有 9 张）。首屏渲染要跟这 41 个
// 请求抢连接，而其中绝大多数在几屏之外、用户根本还没看到。
//
// ── 为什么在这里做，而不是改 .md ──
//
// 「图片该怎么加载」是**渲染器的判断**，不是作者写下的内容 ——
// 与 rehype-normalize-headings 同一个道理。回写到 .md 意味着改动 7 篇
// 文章的原文、41 处 URL 所在的行，而那是明确不做的：
// **文章的原始内容与 URL 不动。** 放在渲染期则一处生效、随时可撤、
// `.md` 一个字节不改，而且公开站与 Studio 预览共用同一条管线，
// 两边一起变（预览漂移见 markdown-pipeline.mjs）。
//
// ── 它**不做**什么，以及为什么 ──
//
// 它不补 `width` / `height`。那才是 CLS 的正解，但这里补不了，两个原因
// 都不是「懒得做」：
//
//   ① 图片在第三方服务器上，要知道尺寸就得**去取**。构建期不许依赖网络
//      （本任务的验收之一），而一次失败的构建比一个 CLS 数字糟得多。
//   ② 猜一个宽高比更糟。`aspect-ratio` 猜错的箱子和不保留箱子一样会位移，
//      而且多出一个「按错的尺寸先排好、图到了再改」的跳动；
//      竖图猜成横图还会把下面整段推到更远。
//
// 所以这是一个**已知且已量化**的缺口，不是被忽略的缺口：
// `check-assets` 会统计它、并在数量增长时失败，见 scripts/check-assets.mjs。
// 真正的解法是把这些图收进本地媒体库（MEDIA-001 已备好那层），
// 但那要改写文章里的 URL，需要作者自己决定。

/**
 * 正文里 `<img>` 的加载属性。
 *
 * 不覆盖已有的值：作者或别的插件显式写过的属性，优先级更高。
 */
export function rehypeLazyImages() {
  return (tree) => {
    const walk = (node) => {
      if (node?.type === 'element' && node.tagName === 'img') {
        node.properties ??= {};
        // 已有 loading 就不动 —— 例如将来有人显式标了 eager
        if (node.properties.loading === undefined) {
          node.properties.loading = 'lazy';
        }
        // 解码放到别的线程上：图多的时候，同步解码会卡住主线程，
        // 表现是滚动一顿一顿的，而不是「图片加载慢」
        if (node.properties.decoding === undefined) {
          node.properties.decoding = 'async';
        }
      }
      const children = node?.children;
      if (Array.isArray(children)) for (const child of children) walk(child);
    };
    walk(tree);
  };
}
