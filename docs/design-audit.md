# 设计审计 —— 现状盘点

审计对象：`https://frees-ling.dev`（Astro 7 定制站点，非 Fuwari —— Fuwari 版已归档至
`archives/sites/Frees-Blog/`）。

方法：源码通读 + 三路并行侦察 + 基线截图（64 路由 × 7 视口 × 2 主题）+ 构建产物实测。
数据采集于 2026-09-16，HEAD `3a5d633`。

---

## 摘要

这个站点**不是**一个糟糕的模板站。它的底子比典型 Astro 博客好得多：
零框架、零 hydration（`dist/_astro/` 里 **0 个 JS 文件**）、内容与表现分离干净、
`.prose` 长文排版完整、无障碍意识已经存在。

它的问题是**定位模糊**：视觉语言是"开发者深色主题 + 圆角卡片 + 荧光强调色"，
这套语言可以用来描述成千上万个站点。加上 29 项具体缺陷（其中 8 项是明确的 bug），
整体呈现出"精心制作的通用博客"而非"某个人的数字空间"。

**最严重的单一问题是 `transformer.md`**：单页 HTML 1.41 MB / gzip 251 KB，
是普通页面的 40 倍。这不是设计问题，但会淹没其他所有性能努力。

---

## 1. 视觉层级

### 做得对的

- **`/projects/` 与首页 project-section 的表格化发丝线布局**是全站最好的视觉母题：
  `border-top` + 逐行 `border-bottom`，编号 + 标题 + 描述 + 状态四栏对齐。
  这个母题在 8 个页面里一致使用，**应当保留并强化为全站基础语言**。
- 标题层级清晰：`.eyebrow`（mono 小字）→ `.section-title` → 正文，节奏合理。
- 首页有明确的区块划分，不是一坨。

### 问题

| 问题 | 证据 |
| --- | --- |
| **Hero 的 `.hero-orbit` 是纯粹的装饰噪音** | `src/pages/index.astro:21-25` —— 一个圆环 + 核心 + AI/CODE/MUSIC/LIFE 四卫星。这正是"发光球体/漂浮装饰"类元素，信息量为零，且占用 hero 的右侧一半 |
| **Hero 没有回答 Who/What/Why** | `index.astro:16-19` —— eyebrow 是 `PERSONAL DIGITAL GARDEN · SINCE 2025`，h1 是 `Frees Blog.`，intro 是"这里是凛风的个人空间，也是一个不会停止更新的实验场"。**读完不知道这个人做什么** |
| **`practice-section` 是整页最突兀的色块** | `index.astro:38-48` —— 深青底页面中间插了一整块米色 `--paper` 反色区。明度反差过大，视觉上像"另一个站点嵌进来了" |
| **卡片语言与目标相悖** | `.post-card` / `.project` / `.now-board article` / `.friend-rules` 全是 24px 圆角卡片。简报明确要求"不要每个内容都塞进圆角 card" |
| 首页区块顺序不合理 | 当前：hero → 写作 → 好奇心的四个方向 → 项目 → 此刻 → 引言。**项目（Selected Work）排在第四位**，而简报要求它是第 2 位 |
| 缺少 "Recent Notes" 独立区块 | 简报要求的 6 个首页区块里，笔记被混在 `practice-section` 的一个链接里 |

---

## 2. 模板感 / 通用元素

按简报的禁止清单逐条核对：

| 简报禁止 | 现状 | 位置 |
| --- | --- | --- |
| 发光球体 / floating blobs | ❌ **存在** | `.hero-orbit`（`index.astro:21-25`） |
| 每个内容塞进圆角 card | ❌ **存在** | `.post-card`、`.project`、`.now-board article`、`.friend-rules`、`.exhibit` |
| excessively rounded pills | ❌ **存在** | `border-radius:999px` 用于 `.button`、`.tag`、`.project-state`、`.satellite`、`.filter-bar button`（约 10 处） |
| 满屏技术 logo | ✅ 无 | — |
| Inter everywhere | ⚠️ **声明了但从不加载** | `global.css:17` —— 排在字体栈首位，但没有 `@font-face`。实际落到 `system-ui` |
| 每个 card hover translateY(-4px) | ❌ **存在** | `.post-card:hover{transform:translateY(-5px)}` 等 |
| 装饰性统计数字 | ⚠️ 轻微 | `history.astro` 的 `.history-stats` |
| 假数据 / 假项目 | ✅ 无 | 4 个项目均来自 `site.ts`，有真实文章支撑（Mahjong AI 除外，见 §10） |
| 紫蓝渐变 | ✅ 无 | 用的是 coral/cyan/lime/violet |
| glassmorphism | ✅ 无 | — |
| Bento Grid | ✅ 无 | — |
| gradient text | ✅ 无 | — |

**Fuwari 残留**：活跃站点里**没有任何 Fuwari 代码**（Tailwind、Svelte、`@swup/astro`、
`ConfigCarrier.astro` 全部随归档移走）。但**设计语言上有继承**：
圆角卡片 + 胶囊标签 + 荧光强调色的组合，与 Fuwari 这类 ACGN 博客模板的视觉习惯同源。

---

## 3. 排版

### 字体栈（`src/styles/global.css`）

| 用途 | 声明 | 问题 |
| --- | --- | --- |
| 正文 | `Inter, ui-sans-serif, system-ui, …, "PingFang SC", "Microsoft YaHei", sans-serif` | **`Inter` 从不加载**（0 个 `@font-face`），是无效声明；中文无专属栈，Linux/Android 落到默认 `sans-serif` |
| 标题 | `Georgia, "Times New Roman", "Songti SC", serif`（`global.css:29`）<br>`Georgia, "Songti SC", serif`（`global.css:46`）<br>…另有 3 种写法散落各处 | **同一个"标题字体"有 5 种不同写法**。中文在 Windows 落到 SimSun，Linux 未知 —— 标题视觉完全不可控 |
| mono | `ui-monospace, monospace` | 与 `global.css:27` 自己写的 `ui-monospace, SFMono-Regular, Menlo, monospace` 不一致 |

### 字号 / 节奏

- 字号用 `clamp()` 做流体缩放，方向是对的。
- `.prose` 的正文宽度 `--reading: 760px`，在 18px 字号下约 **76 字符** —— 略宽于
  简报要求的 65–75ch，尚可接受。
- **`.display-title` 与 `.page-title` 没有 `overflow-wrap`** —— 长英文单词/URL 在窄屏会直接溢出。
  全站**只有 `.prose` 做了 `overflow-wrap: anywhere`**。

### 标题层级异常

**`transformer.md` 没有 h1，却有 470 个 h2 和 71 个 h3。**
文章页的 `.article-header` 用的是页面标题（来自 frontmatter），所以视觉上没问题，
但文档大纲（outline）是坏的 —— 屏幕阅读器与 SEO 都会受影响。

---

## 4. 间距与形状

### 无 scale，全是魔数

| 类别 | 不同值的数量 | 说明 |
| --- | --- | --- |
| `gap` | **19 个** | 7/8/9/10/11/12/14/16/20/22/24/28/30/32/40/48/70/80/140px |
| `margin` | **22 个** | 4/5/6/8/10/12/14/16/18/20/24/28/30/34/36/38/42/48/50/64/80/110px |
| `border-radius` | **8 个** | 2/3/5/6/10/12/16/24/32/999px/50% |
| `box-shadow` | **2 个** | `--shadow` 一个值打天下，无 elevation 层级 |
| `transition` 时长 | **4 个** | 180/200/220/500ms，4 处未写 easing |

`--radius: 24px` 这个 token **只被用了 6 次**，其余全在写裸值 —— token 与实际用法脱节。

### 典型的魔数簇

- `PostCard.astro:15-19`：`margin-bottom:50px` + `margin-top:34px` + `min-height:330px`
- `now.astro:6`：`padding:30px` + `min-height:290px` + `margin:50px 0 6px`
- `projects.astro:6`：`padding:34px` + `min-height:390px`

---

## 5. 信息架构

### 最严重的结构问题：导航与页脚**零重叠**

| | 条目 |
| --- | --- |
| **导航（Header）** | 首页 · 文章 · 项目 · 研究 · 音乐 · 随笔 · 关于 |
| **页脚（Footer）** | 文章归档 · 历史个人博客 · 此刻 · 照片墙 · 朋友们 · 留言板 |

**7 个导航项没有一个出现在页脚，6 个页脚项没有一个出现在导航。**
全站 14 个页面被切成两个互不相通的簇，只有首页同时链接到两边。

后果：`/gallery/`、`/friends/`、`/guestbook/`、`/now/`、`/archive/`、`/history/`
**只能从页脚到达**，而移动端页脚在长页最底部。

### 其他

- **`/search/` 只以裸字符 `⌕` 出现在 header**，无文字、无 `title`，可发现性极低。
- 页面描述在导航与首页之间**措辞不一致**：首页 `practice-section` 写"智能/研究、代码/构建、
  声音/创作、生活/随笔"，导航写"研究、项目、音乐、随笔"。
- `notes.astro` 与 `research.astro` 靠**硬编码白名单**挑选文章 ——
  新增文章不会自动出现，且 `notes` 会把 25 字的空文章放进列表首位。

---

## 6. 响应式

### 7 个互不对齐的断点

| 断点 | 次数 | 位置 |
| --- | --- | --- |
| 760px | 9+1 | `global.css:53`、`PostCard`、`SoundLab`、`projects`、`notes`、`research`、`tags`、`music`、`blog/index`、`about` |
| 700px | 5 | `Footer`、`archive`、`friends`、`now`、`gallery` |
| **850px** | 1 | `Header.astro:61`（**导航折叠**） |
| 820px | 2 | `index.astro:87`、`history.astro:143` |
| 980px | 1 | `blog/[...slug].astro:45`（TOC 隐藏） |
| 640px | 1 | `history.astro:144` |
| 600px | 1 | `blog/[...slug].astro:45` |

**已确认的可见 bug**：Header 在 850px 折叠导航并收窄到 `calc(100% - 32px)`，
但 `global.css:53` 的容器在 760px 才收窄。**在 761–849px 区间，Header 内容与页面内容
左右边距错位 8px**，肉眼可见。

同类：Footer 在 700px 折叠但 Header 在 850px —— 701–849px 区间页脚三列而导航已是移动样式。

### 横向溢出风险

| 位置 | 风险 |
| --- | --- |
| `global.css:16` `html{min-width:320px}` | 视口窄于 320px 强制横向滚动 |
| `SoundLab.astro:12` `grid-template-columns:minmax(280px,.8fr) 1.2fr` + `gap:clamp(30px,7vw,90px)`，断点却在 760px | **761–860px 区间最可能溢出** |
| `history.astro:115` `white-space:nowrap` + 24px 字号 | 320–640px 有溢出隐患 |
| `.display-title` / `.page-title` 无 `overflow-wrap` | 长英文直接溢出 |
| `index.astro:68` `.hero{min-height:calc(100svh - 79px)}` 硬编码耦合 Header 的 78px，但 Header 在 ≤850px 变成 70px | 首屏高度短 9px |

---

## 7. 交互与动效

- 全部 transition 共 9 处声明，基准 180ms，但存在 180/200/220/500ms 四个值。
- 全站只有 2 组 `@keyframes`（都在 `SoundLab.astro`），都是 `infinite`。
- `scroll-behavior: smooth` 全局生效。

### `prefers-reduced-motion` 实现有明确缺陷

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *,*::before,*::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

覆盖范围是对的（通配选择器 + `!important` 能穿透 Astro 的 scoped 样式，
`animation-iteration-count:1` 正确终止了 `infinite` 动画）。

**但**：
1. **`transition-duration:.01ms` 把 transform 型 hover 从平滑变成瞬时跳变，比不做还糟**。
   `.post-card:hover{translateY(-5px)}`、`.gallery img{scale(1.025)}`、
   `.button:hover{translateY(-2px)}` 都会瞬间"啪"地跳过去。
2. **完全不覆盖 JS 驱动的动效**：阅读进度条的 `style.width` 写入、
   `SoundLab` 的 Web Audio gain ramp（`linearRampToValueAtTime`、`setTargetAtTime`）。
   对一个**声音组件**来说，后者可能比视觉动画更需要 reduced 处理。

---

## 8. 无障碍

### 做得对的

- 语义 HTML、`aria-current="page"`、`skip-link`、`alt` 文本质量好（中文描述性 alt）
- `SoundLab` 有 `aria-pressed`
- 全站有 reduced-motion 处理（虽实现有缺陷）

### 确定的问题

| 问题 | 位置 |
| --- | --- |
| **移动端导航收起时链接仍可聚焦** —— `.site-nav` 只有 `max-height:0;overflow:hidden;opacity:0`，**缺 `visibility:hidden`/`inert`/`aria-hidden`**。键盘用户 Tab 会聚焦到 7 个不可见链接 | `Header.astro:64` |
| `.theme-toggle` **缺 `aria-pressed`**，屏幕阅读器不知道当前主题 | `Header.astro:20` |
| `.search-link`（`⌕`）**无文字、无 `title`、无 `aria-label` 文本** | `Header.astro:19` |
| `.search-link` 与 `.theme-toggle` 被塞进 `<nav>` 内 —— 语义上不是导航项 | `Header.astro` |
| `.site-nav` 折叠时无 `aria-hidden` 切换 | `Header.astro:64` |
| `transformer.md` **无 h1 但有 470 个 h2** —— 文档大纲损坏 | 内容层 |

---

## 9. 性能

### 关键发现

**`/blog/transformer/` 单页 HTML = 1.41 MB 原始 / 251 KB gzip —— 普通页面的 40 倍。**
成因：232,264 字符正文 + 248 个 `$$` 公式块被 KaTeX 渲染成极冗长的 HTML。
加上 `blog/[...slug].astro` 的 TOC 渲染 `headings.filter(d => d.depth <= 3)`，
在该页产出 **541 条目录链接**（470 个 h2 + 71 个 h3）塞进一个 sticky 侧栏。

**这是全站最严重的性能问题，比任何 CSS 或字体问题都大一个数量级。**

### 其余

| 项 | 现状 |
| --- | --- |
| HTML gzip（普通页） | 3–6 KB ✅ 健康 |
| 站点自身 JS | **0 个文件** ✅ |
| `katex.min.css` | 无条件加载到所有页面。实测 **24 KB → gzip 3.6 KB**，且 KaTeX 字体自带 `unicode-range`（无公式则零字体请求）。**真实成本远小于预期，应降优先级** |
| `banner.jpg` | **1.2 MB 未优化**，且在 `gallery.astro` 被引用两次（同一张图两次请求） |
| `<img>` 尺寸 | 3 个里**只有 1 个**有 `width`/`height` → CLS 隐患 |
| `loading="lazy"` | **零** |
| 阅读进度条 | 每帧读 `scrollHeight` + `innerHeight` → **强制同步 reflow** |
| `blog/index.astro` 筛选 | 已渲染全部卡片再隐藏；`data-category` 选择器需二次 `.filter(tagName==='BUTTON')` 兜底 |
| 第三方脚本 | 不蒜子 CDN 统计（隐私 + 外部依赖）；giscus（评论，合理） |

### 图片资产真相

**全站只有 2 张真实图片**：`avatar.jpg`（82 KB）、`banner.jpg`（1.2 MB）。
`src/assets/` 不存在，未使用 `astro:assets`。文章里 40 张图**全是外链** 123 云盘。
`frees.ico`（126 KB）与 `frees.svg`（24 KB）在 `src/` 中**零引用**，是孤儿素材。

---

## 10. 内容现实（设计约束）

设计必须建立在真实内容上。以下是实际盘点：

### 17 篇文章，但体量极度不均

| 实质长度（剔代码块后字符数） | 文章 |
| --- | --- |
| **18** | `index.md`（"第一个正式博客"） |
| 191 | `YOLO-train-recommand.md` |
| 206 | `meeting.md` |
| 227 | `LOVEv1.0.md` |
| 405–496 | `new-way-to-ubuntu.md`、`code-for-py3.10.md` |
| 665–3,127 | 其余 11 篇 |
| **127,056** | **`transformer.md`** |

**4 篇实质是空壳**（< 600 字符），而 `transformer.md` 独占约 80% 的正文体量。

### 内容稀薄处（须诚实处理，不得虚构）

| 页面 | 现状 |
| --- | --- |
| `/music/` | **无任何真实音频** —— `public/audio/` 是空目录，只有 1 个浏览器实时合成的 `SoundLab` + 3 条硬编码"整理中"条目 |
| `/gallery/` | 3 个 figure 里 **2 张是同一张 banner 的不同裁切** |
| `/friends/` | 空态（"友链席位正在等待第一位朋友"） |
| `/now/` | 页头写死 `UPDATED 2026.09` |
| `/projects/` | 4 个项目来自 `site.ts`；**`Mahjong AI` 没有任何对应文章**，是全站唯一无文字支撑的项目 |
| `index.md` | 25 字，且被 `/notes/` 的硬编码白名单放进列表首位 |

**4 个真实项目**：Mahjong AI（研究工程）、Frees Blog（个人网站）、
Computer Vision Notes（知识档案）、Robotics Playground（机器人实验）。
**真实素材**：坐标 `31.23° N · 121.47° E`（上海）、`SoundLab` 的声音合成、
13 个月连续记录（2025-07 → 2026-07）。

---

## 11. 技术债清单

### 死代码 / 死字段

| 项 | 位置 |
| --- | --- |
| `content.config.ts` 的 `featured` / `updated` / `lang` **三个 schema 字段全项目零引用** | `src/content.config.ts` |
| `site.alias`（'凛风'）与 `site.repo` 零引用 | `src/data/site.ts` |
| `.post-card.featured{grid-column:span 2}` 在 `/blog/` **静默失效** —— 卡片被 `.post-wrap` 包裹，不是 grid item。同一组件在首页与列表页布局不同 | `PostCard.astro:14` vs `blog/index.astro:26` |
| `--lime` 仅用 1 次、`--violet` 仅 2 次 —— 基本是装饰性冗余 | `global.css:5` |
| `.empty-state` 全局定义但只被 `friends.astro` 用 1 次；`.display-title` 只被首页用 1 次 | `global.css` |

### 命名冲突

| 冲突 | 说明 |
| --- | --- |
| **`.timeline`** | `projects.astro` 与 `history.astro` 里是**两套完全不同的东西**，全局无命名空间 |
| **`.post-grid`** | `index.astro:79` 与 `blog/index.astro:26` 同名不同定义 |

### 重复样式

- `display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px` **出现 6 次**
  （`index`/`notes`/`now`/`projects`/`research`/`blog-index`/`tags`），
  且每处各自重写一遍 `@media(max-width:760px){grid-template-columns:1fr}`
- mono 小标签样式重复 **21 处**（`.eyebrow` 已有全局定义，各页又造了同款）
- `font-family:Georgia,"Songti SC",serif` 手写重复 **19 处**

### 无效 HTML

**`search.astro:5-6` 把 `<link rel="stylesheet">` 与 `<script>` 写在 `</Layout>` 之后**
→ Astro 将其渲染在 `</html>` 之外，属无效 HTML，会触发浏览器解析器重定位。
根因：`Layout.astro` 只有一个默认 slot，**没有 head 注入点**。

### 硬编码绕过 token

约 **25 处**颜色字面量绕过 token 体系，是 light 模式视觉崩坏的直接原因：

- `PostCard.astro` 反色卡片内 **6 处** `rgba(18,35,39,.xx)` 手写
- `Footer.astro:13` `rgba(2,12,16,.18)` —— light 模式下会发灰
- `SoundLab.astro:12` 一套**完全独立的第四套配色**（`#f8a789`/`#9c5c83`/`#123f4b`/`#07171d`）
- `global.css:36` `.button.primary` 的 `#1c1712`/`#ff927c`
- `index.astro:80,83` 的 `#227c74` / `#d95c47`
- `blog/index.astro:26` `#1d1713` 与 `SoundLab.astro:12` `#201713` —— **几乎相同但不同**

### light 主题的结构性缺陷

`:root[data-theme='light']` **只覆盖 13 个中性色变量**，
`--coral/--cyan/--lime/--violet` **完全未重定义** —— 两套主题共用为深底调的色值。
`--lime #c3e36a` 在浅底 `#ebe6d9` 上几乎不可见。

---

## 12. 审计结论

### 保留（现有资产里的优点）

1. **表格化发丝线母题** —— 8 个页面一致使用，是已有的视觉语言，强化它
2. **`.prose` 长文排版** —— 覆盖标题/引用/代码/表格/KaTeX/`scroll-margin-top`，质量好，基本可复用
3. **零框架零 hydration 架构** —— `dist/_astro/` 0 个 JS，是首屏优势，不能丢
4. **Astro scoped style 的 per-page CSS 分包** —— 每页只付自己的 CSS
5. **内容与表现分离** —— `site.ts` 结构化数据、`posts.ts` 工具函数、页面纯渲染
6. **无障碍基础意识** —— `aria-current`、`skip-link`、好的 alt 文本
7. **真实素材** —— 坐标、SoundLab、13 个月连续记录、4 个真实项目

### 重建

1. **色彩体系** —— 双主题成对定义，清掉 25 处硬编码
2. **字体系统** —— 修掉"Inter 声明但不加载"、5 种标题写法、中文栈缺失
3. **间距/圆角/断点 scale** —— 从 19/22/8/7 个魔数收敛
4. **卡片语言 → 发丝线列表语言** —— 移除圆角卡片与胶囊
5. **信息架构** —— 修掉导航/页脚零重叠，五区重组
6. **文章列表** —— 4 套实现收敛为 1 套编排器
7. **`.hero-orbit` 与装饰性元素** —— 移除

### 优先处理（按影响排序）

| 优先级 | 项 |
| --- | --- |
| 🔴 P0 | `transformer.md` 的 1.41 MB HTML |
| 🔴 P0 | `search.astro` 的无效 HTML |
| 🟠 P1 | light 主题强调色未定义 + 25 处硬编码 |
| 🟠 P1 | 移动端导航键盘可达性 |
| 🟠 P1 | 断点不统一导致的 8px 错位 |
| 🟡 P2 | 字体系统重建 |
| 🟡 P2 | 信息架构重组 |
| 🟢 P3 | 间距/圆角 scale、死代码清理 |
