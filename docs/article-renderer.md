# 文章渲染器契约（RENDER-001）

日期：2026-09-17
状态：审计完成，契约确立

本文是文章正文渲染的**真相源**。改 `prose.css`、写文章组件、
或将来给 Studio 接生产预览之前先读它。

---

## 一、实际渲染出什么（基于产出 HTML 清点，不是基于源码猜测）

对 `dist/blog/*/index.html` 全量统计 17 篇：

| 项 | 实测 |
| --- | --- |
| 元素种类 | **61** |
| `transformer` 一篇 | **59 种** |
| 其余 16 篇 | 28–30 种 |

高频元素（全站合计）：`p` 2065、`a` 972、`td` 606、`hr` 546、`h2` 543、
`li` 466、`pre` 278、`tr` 227，以及 KaTeX 的 `mi` 647 / `mo` 627 / `mrow` 275 / `mn` 259 / `mtd` 225 / `mstyle` 225 / `mtext` 216。

**结论：`transformer` 是这套渲染器真正的验收对象。**
其余 16 篇只用到它的一个子集；只按普通文章调样式，等于没测过最难的输入。

### transformer 的规模

- `h2` **543** 个、`hr` **546** 个
- 正文约 148,691 字符（去代码块计）
- 独占全站所有 KaTeX 数学节点

这不是「一篇长文」，而是**结构上不同的文档**：543 个二级标题意味着
任何按标题数量线性的导航（目录、锚点索引）对它都会失效。
现有目录已在 WEB-006 做过阈值降级，但那是权宜之计。

---

## 二、样式责任划分

| 范围 | 责任方 | 说明 |
| --- | --- | --- |
| **正文区内所有元素** | `src/styles/prose.css` | 唯一责任方。标题、段落、引用、代码、表格、图片、`hr`、KaTeX |
| 正文之外（页头、目录、上下篇导航、许可徽章、参见） | `src/pages/blog/[...slug].astro` 的内联样式 | 不碰正文内部 |
| 颜色、字体、圆角、间距 | `src/styles/tokens.css` | 由 `check-tokens.mjs` 强制 |
| 数学公式排版 | `katex/dist/katex.min.css` | 第三方，**不覆盖**；只在 `prose.css` 里管外层的间距与溢出 |
| 代码高亮 | Shiki（构建期内联样式） | 生成的是行内 `style`，不参与 token 体系 |

**判断规则**：一个选择器如果作用于 `.prose` 内部 → 归 `prose.css`；
作用于 `.prose` 外部 → 归页面。不要两头都写。

---

## 三、本次审计发现并修复的缺陷

| # | 缺陷 | 影响 | 修复 |
| --- | --- | --- | --- |
| 1 | `.prose h1..h4 { scroll-margin-top: 100px }` | 页头已是 `--header-h: 60px`，**锚点跳转后标题被页头盖住约 40px** | 改为 `calc(var(--header-h) + 16px)`，跟随 token |
| 2 | `.prose img { border-radius: 16px }` | 硬编码，绕过 token 体系 | → `var(--radius-lg)` |
| 3 | `.prose pre { border-radius: 16px }` | 同上 | → `var(--radius)` |
| 4 | `.prose code:not(pre code) { border-radius: 5px }` | 同上 | → `var(--radius-sm)` |

第 1 条是**用户可见**的：任何从目录或外链跳到 `#anchor` 的访问都会中招。

---

## 四、Studio 复用边界

Studio 的生产预览必须渲染出与公开站**逐像素一致**的结果，因此：

- **必须复用**：`prose.css` + `tokens.css` + 同一套 Markdown 管线
  （remark/rehype 插件链、Shiki 配置、KaTeX 配置）
- **不得复用**：页面级样式与布局。Studio 有自己的外壳
- **不得分叉**：任何在 Studio 侧复制一份 `prose.css` 的做法都会导致预览漂移，
  而预览漂移是编辑器最昂贵的缺陷 —— 用户看到什么就该发布什么

当前的 Markdown 管线配置在 `astro.config.mjs`，尚无独立抽取。
接 Studio 前应把它抽成一个可被两边引用的模块（列入 EDITOR-001）。

---

## 五、兼容策略

- **不改文章正文事实**：本任务只碰样式与结构，不动任何 `.md` 内容
- **URL 与锚点稳定**：`scroll-margin-top` 的修复不改变 id，只改变跳转落点
- **旧锚点**：`transformer` 的 543 个 h2 目前由 Astro 自动生成 id。
  将来分章迁移（RENDER-002）必须保留旧 id 可达，否则外链全部失效
- **第三方样式不覆盖**：KaTeX 与 Shiki 的输出保持原样；
  需要调整时改外层容器，不改它们内部

---

## 六、fixture 集

验收渲染器时至少要覆盖下面五类，缺一不可：

| fixture | 覆盖点 |
| --- | --- |
| `transformer.md` | 大规模标题、KaTeX、`hr` 密集、超长文档 |
| `Yolo-shubiao.md` | 常见技术笔记：代码块、列表、表格 |
| `thinking.md` | 英文长文、无代码、无标签 |
| `meeting.md` 或 `LOVEv1.0.md` | 短记录（低于 `SUBSTANCE_MIN`） |
| `index.md` | 极端短文（26 字符） |

前 16 篇是「正常情况」，`transformer` 与 `index.md` 是两个极端 ——
只测中间那一档等于没测边界。

---

## 七、未决事项

- **transformer 的目录策略**：543 个 h2 下当前的阈值降级只是权宜。
  真正的解法是分章（RENDER-002），本文件不预设其形态。
- **Markdown 管线抽取**：接 Studio 前必须做，见第四节。
- **`hr` 的使用**：transformer 用了 546 个 `hr` 作分隔。
  这是内容侧的写法，渲染器不该替它做决定，但值得在分章时一并审视。
