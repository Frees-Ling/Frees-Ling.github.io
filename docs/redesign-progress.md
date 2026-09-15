# FREES / FIELD LOG —— 重设计进度

> 每完成一个阶段更新本文件。完整方案见 `docs/redesign-plan.md`。

**当前阶段：P0 — 冻结基线（进行中）**

---

## 阶段状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P0** | 冻结基线：截图能力 + 基线测量 | 🔄 进行中 |
| P1 | HTML 正确性与 head 架构 | ⬜ 未开始 |
| P2 | 语义与无障碍 | ⬜ 未开始 |
| P3 | token 层落地 + 上闸门脚本 | ⬜ 未开始 |
| P4 | 组件抽取（视觉等价） | ⬜ 未开始 |
| P5 | 视觉重设计 | ⬜ 未开始 |
| P6 | 资产与图片管线 | ⬜ 未开始 |
| P7 | 五区导航与栏目落地 | ⬜ 未开始 |
| P8 | 放宽 `.prettierignore` + 重写 AGENTS.md | ⬜ 未开始 |

---

## P0 基线数据

采集于 `2026-09-16`，HEAD = `3a5d633`。

### 构建产物体积

| 项 | 值 |
| --- | --- |
| `dist/` 总大小 | 22 MB |
| 文件数 | 401 |
| HTML 数 | 91（含 history 归档） |
| **站点自身 JS（`_astro/`）** | **0 个文件** —— 零 hydration 名副其实 |
| `Layout.*.css` | 39.3 KB（含 katex.min.css 24 KB + global.css 7 KB） |

各目录：`history/ 15M` · `images/ 2.2M` · `blog/ 1.9M` · `_astro/ 1.2M` · `pagefind/ 1.1M`

### HTML 体积（排除 history 归档）

| 页面 | 原始 | gzip |
| --- | --- | --- |
| `/` | 17.9 KB | **5.0 KB** |
| `/blog/` | 29.8 KB | 5.9 KB |
| `/blog/thinking/` | 17.8 KB | 6.1 KB |
| **`/blog/transformer/`** | **1,410,693 B** | **251,563 B** |
| `/projects/` | 12.0 KB | 3.7 KB |
| `/about/` | 9.5 KB | 3.5 KB |
| `/archive/` | 10.9 KB | 3.3 KB |

> **结论修正**：原先担心「29.5 KB 内联 CSS 撑大 HTML 是被忽略的最大项」——**不成立**。
> gzip 后普通页面只有 3–6 KB，非常健康。
>
> **真正的性能灾难是 `transformer.md`：单页 1.41 MB HTML / 251 KB gzip，是普通页面的 40 倍。**
> 成因：232K 字符正文 + 248 个公式被 KaTeX 渲染成极冗长的 HTML。这比任何 CSS 问题都严重。

### 🔴 transformer.md 的严重程度超出预期（实测）

截图时该路由**全部失败**，错误为：

```
Protocol error (Page.captureScreenshot): Page is too large.
```

**页面大到 Chrome 无法截图。** 实测渲染尺寸：

| 页面 | 渲染高度 | DOM 元素数 |
| --- | --- | --- |
| `/` | 5,636 px | 242 |
| `/blog/qa/`（普通长文） | 24,246 px | 2,299 |
| **`/blog/transformer/`** | **468,732 px** | **30,813** |

是首页高度的 **83 倍**、普通长文的 **19 倍**，DOM 元素数是首页的 **127 倍**。

**这改变了 P4 的问题性质**：不只是"TOC 有 470 条链接"，
而是**这一页在物理上超出了一个网页的合理规模**。

原计划只做 TOC 阈值降级 —— 那只解决侧栏，**解决不了 468K px 的正文与 3 万 DOM 元素**。

**P4 需要重新评估，候选方案（待与用户确认）**：

| 方案 | URL 影响 | 说明 |
| --- | --- | --- |
| A. 仅 TOC 降级 | 无 | 原计划。解决侧栏，**不解决页面体量** |
| B. 保留 `/blog/transformer/` 作为枢纽页，正文拆为 `/blog/transformer/<章节>/` | **主 URL 存活** | 零 404，且真正解决体量 |
| C. 拆成独立的多篇系列 | 原 URL 需跳转 | 用户已明确排除（会改 URL） |

推荐 B —— 它满足"不破坏 URL"的硬约束，同时真正解决问题。

### 首页 Core Web Vitals（本地 preview，dark）

| 视口 | LCP | CLS | TBT |
| --- | --- | --- | --- |
| 1440×900 | 1092 ms † | 0.0000 | 36 ms |
| 1280×800 | 72 ms | 0.0000 | 0 ms |
| 1024×768 | 88 ms | 0.0000 | 0 ms |
| 768×1024 | 68 ms | 0.0000 | 0 ms |
| 430×932 | 60 ms | 0.0000 | 0 ms |
| 390×844 | 56 ms | 0.0000 | 0 ms |
| 360×800 | 68 ms | 0.0000 | 0 ms |

† 首次加载冷启动，非稳态值。

> CLS 0.0000 好于预期。注意这是 localhost 无网络延迟环境，不能等同于线上。
> 三个 `<img>` 里两个没有 `width`/`height` 是**已确认的 CLS 隐患**，只是当前页面上未显现。

---

## 已完成的工作

### 截图能力（P0 交付物 1）

新增：
- `scripts/visual/chrome-path.mjs` —— 用 `globSync` 解析浏览器路径，吃掉版本号目录，
  这样 Chrome 从 153 升到 154 后脚本不会失效
- `scripts/visual/screenshot.mjs` —— 多视口 + 双主题 + 整页截图 + CWV 采集
- `npm run shot -- --label <名> [--routes /,/about/] [--filter blog] [--port 4399]`

**实现中踩到并解决的两个坑**：

1. **不用 `astro preview`** —— 它在本机是**守护进程化**的（有 `stop`/`status`/`logs`），
   spawn 之后 kill 父进程杀不掉它，会留下残留服务占用端口。
   改为内建静态服务器（`node:http` + 解析 `dist/`），更可控也更快。
2. **不用 headless-shell 的 `--screenshot` CLI** ——
   「超高视口」截整页的做法（`--window-size=1440,20000`）会把 `100svh` 变成 20000px，
   而首页有 `.hero{min-height:calc(100svh - 79px)}` → hero 被撑成 20000px 高，截图不可用。
   且纯 CLI 无法切换主题（主题靠 `<html data-theme>` 属性，不是 `prefers-color-scheme`）。
   → 使用 `puppeteer-core`（5.97 MB，**不下载浏览器**）+ 本机已有的 `chrome-headless-shell`。

**依赖**：`puppeteer-core@^25.11.0`、`axe-core@^4.13.0`（均为 devDependencies，
`quality.yml` 不加截图步骤，CI 无稳定字体环境会导致 diff 全是噪声）。

> 注：端口 4322 被一个**无关进程**占用（`Blog-v2/node_modules/astro` 的 preview），
> 非本项目管理范围，未触碰。截图脚本默认改用 4399。

---

## 已知问题（待后续阶段处理）

| # | 问题 | 处理阶段 |
| --- | --- | --- |
| 1 | **`transformer.md` 单页 1.41 MB HTML / 251 KB gzip** —— 全站最严重的性能问题 | P4（TOC 降级）+ 需单独评估 KaTeX 输出 |
| 2 | `.hero-orbit` 是简报明令禁止的「发光球体/漂浮装饰」 | P5c |
| 3 | light 主题的 `--coral/--cyan/--lime/--violet` **完全未重定义**，浅底上几乎不可见 | P3 |
| 4 | 约 25 处硬编码颜色绕过 token | P3 / P5 |
| 5 | 卡片泛滥 + 24px 圆角 + 胶囊按钮，与目标视觉语言相悖 | P5d |
| 6 | `search.astro` 的 `<link>`/`<script>` 渲染在 `</html>` 之外（**无效 HTML**） | P1 |
| 7 | 移动端导航收起时链接仍可聚焦 | P2 |
| 8 | 7 个互不对齐的断点，761–849px 区间边距错位 8px | P2 |

---

## 决策记录

| 日期 | 决策 | 理由 |
| --- | --- | --- |
| 2026-09-16 | 截图用 `puppeteer-core` 而非纯 CLI | CLI 的整页方案会被 `100svh` 破坏 |
| 2026-09-16 | 不用 `astro preview` 作截图服务 | 守护进程化，kill 不干净 |
| 2026-09-16 | 不装 `prettier-plugin-astro` 之类的额外格式化依赖 | 新样式改用正常多行格式后，Prettier 原生即可覆盖 |
