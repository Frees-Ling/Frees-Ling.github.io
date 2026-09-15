# FREES / FIELD LOG —— 设计系统

---

## 0. 概念

**野外记录簿（field notebook）× 技术文档 × 独立杂志。**

三者的取舍：从野外记录簿取**编号、坐标、观察记录、边注、图版**；
从技术文档取**编号体系、交叉引用、严谨层级**；
从独立杂志取**大胆的排版层级、非对称构图、大量留白**。

站点不"发布内容"，而是**编目观察**。这个区别决定了后面每一个设计决策。

---

## 1. 为什么这个设计只能属于 Frees Ling

这是本设计系统的验收标准。如果答案不够强，设计就是失败的。

### 反泛化测试

把用户名与站点名替换掉之后，以下元素**全部失效**：

| 元素 | 为什么换不掉 |
| --- | --- |
| **编号体系 `FL-YYMM-NNN`** | 编号锚定在**真实的发布日期序列**上（2025-07 → 2026-07，13 个月连续记录）。换个人就是另一套编号，不是同一份记录 |
| **坐标 `31.23° N · 121.47° E`** | 真实的记录地点。这不是装饰性数字，是"野外记录簿"隐喻的锚点 |
| **SoundLab 声音标本** | 浏览器实时合成的 4 振荡器氛围音，是**独一无二的可交互产物**，不是装饰动画 |
| **三条研究主线** | 麻将 AI / 决策、机器学习的几何直觉、机器人与视觉 —— 来自 `researchTracks` 的真实方向 |
| **内容本身** | 17 篇记录是 YOLO 训练、数据标注、Unitree Go2、Transformer 线性代数推导、Ubuntu 远程开发 —— **工程实验的原料，不是生活分享的原料** |

一个通用开发者博客**不会**有麻将决策研究、不会有机器人实验日志、
不会有"用线性代数重新发明 Transformer"的长文。这些是内容的独特性，
而设计系统的作用是**让这种独特性在视觉上可见**，而不是把它磨平成卡片。

### 如果这个设计放在别人站上会怎样

会显得**装腔作势** —— 因为编号体系需要真实的连续记录来支撑，
坐标需要真实的归属地，声音标本需要真的有人在里面做声音实验。
这正是设计是否属于本人的判据。

---

## 2. 四个结构母题

### 母题 1 —— 条目编号

**格式**：`FL-YYMM-NNN`

- `FL` = Frees Ling
- `YYMM` = 发布年月
- `NNN` = 该月内的序号（从 001 起）

**规则**：
- 由发布日期与同月内的排序**确定性推导**，一经生成**永不变更**
- 文章、项目、图版都可编号
- 一律用 mono 字体呈现，与正文形成"记录 vs 叙述"的语域分离

**示例**：`2026-07-23` 发布的 `thinking.md` → `FL-2607-001`

### 母题 2 —— 元数据栏（metadata rail）

编辑式排版的核心装置。

| 断点 | 布局 |
| --- | --- |
| ≥ 900px | 12 栏网格。**左 3 栏为元数据栏**（sticky），右 8–9 栏为正文。元数据栏承载：编号、日期、分类、阅读时长、标签 |
| < 900px | 折叠为正文上方的横向元信息条，编号与日期同排，标签另起一行 |

**这个装置同时解决文章页的 TOC 困境** —— 当前 `blog/[...slug].astro` 对
`transformer.md` 会渲染 541 条目录链接塞进一个 sticky 侧栏。改后 TOC 归入元数据栏，
并按数量阈值降级（见 §9）。

### 母题 3 —— 发丝线与表格化布局

**这是现有代码里最好的东西，保留并强化。**

当前 `/projects/` 与首页 project-section 已经使用
`border-top` + 逐行 `border-bottom` 的表格化布局，四栏对齐（编号 / 标题 / 描述 / 状态）。
这个母题在 8 个页面里一致使用，是已有的视觉语言。

**规则**：
- **列表用线分隔，不用卡片** —— 这是与"圆角卡片博客"最强的区隔
- 发丝线用 `1px solid var(--color-border)`
- 强调分隔用 `--color-border-strong`
- 卡片只在**真正需要独立边界的容器**上使用（如 SoundLab 标本、代码块）

### 母题 4 —— 图版（plates）

图片作为"编号图版"呈现：编号 + 说明文字 + 可选的技术元数据。

**全站只有 2 张真实图片**（`avatar.jpg` 512×512、`banner.jpg` 1200×750），
因此图版是**稀有元素** —— 出现时必须有分量，而不是像现在的 `/gallery/`
把同一张 banner 裁两次充数。

---

## 3. 色彩

### 基础值

```
Light   paper #F2F0E9   ink #111111   muted #72716C
Dark    paper #0B0C0D   ink #ECEAE4   muted #8A8985
Accent  signal blue #315CFF   signal red #FF4B3E
```

### 命名：三层，只暴露两层

```
① 原始层   --raw-*     只在 tokens.css 内被引用，组件永不使用
② 语义层   --color-*   组件只用这一层
③ 尺度层   --space-* / --text-* / --radius-* / --dur-* / --ease-*
```

### 关键规则：**每一个颜色 token 必须在两套主题里都定义**

当前代码最大的漏洞就是 `:root[data-theme='light']` 只覆盖了 13 个中性色变量，
`--coral/--cyan/--lime/--violet` **完全未重定义** —— 两套主题共用为深底调的色值，
`--lime #c3e36a` 在浅底 `#ebe6d9` 上几乎不可见。

**强调色必须成三件套出现**：

| token | 用途 |
| --- | --- |
| `--color-accent` | 强调色**作为背景**（按钮填充、当前项指示条） |
| `--color-on-accent` | 在 accent 背景上的文字色 |
| `--color-accent-soft` | 强调色**作为前景**（浅底上的链接文字 —— 需要更深的值才够对比度） |

现在 `--cyan` 同时被用作 `.prose a` 的文字色和 `.eyebrow` 的文字色 ——
这是两种不同的语义用途，必须分开。

### 使用纪律

- `signal blue` **只用于**：当前项指示、链接 hover、极少数强调
- `signal red` **只用于**："进行中 / 需注意"状态
- **克制是这套配色的全部价值所在** —— 一旦铺开使用就退化成又一套俗艳主题

### 消除硬编码

当前约 **25 处**颜色字面量绕过 token。反色容器（如卡片反转）改用
`--color-inverse-*` + `color-mix(in oklab, …)`：

```css
.featured {
  background: var(--color-inverse-bg);
  color: var(--color-inverse-text);
}
.featured .meta {
  color: color-mix(in oklab, var(--color-inverse-text) 58%, transparent);
}
```

`color-mix()` 在 Chrome 111+ / Safari 16.2+ / Firefox 113+ 全支持，
是消除 `rgba()` 硬编码的标准手段。

---

## 4. 排版

### 字体分工

| 用途 | 方案 | 首屏字节 |
| --- | --- | --- |
| 英文 Display | 衬线，有性格 | 30–45 KB（拉丁子集） |
| 中文标题 | Noto Serif SC **构建期精确子集** | ~250 KB |
| 中文正文 | **系统栈** | **0** |
| 元信息 / 编号 / 标签 | mono | ~30 KB（可选） |

### 中文标题子集：为什么必须这样做

实测数据：

| 做法 | 结果 |
| --- | --- |
| Astro Fonts API `subsets:['chinese-simplified']` | ❌ **静默灾难** —— Fontsource API 的 `unicodeRange` 无此键 → 生成的 `@font-face` **没有 `unicode-range`** → 每页无条件下载 **1.44 MB**。构建成功、不报错 |
| fontsource CJK 分片 + `unicode-range` | ❌ CJK 分片按**码点区间**切（每片约 138 个连续汉字）。首页触发 14 片 ~700 KB，transformer 页 34 片 ~1.7 MB |
| **构建期精确子集（本方案）** | ✅ 全站不重复汉字仅 **1,478**；UI 文案 546；95% 字频覆盖 625 字。取 **~550 字 variable 子集 ≈ 250 KB** |

`@font-face` 必须**显式限定 unicode-range**，把拉丁让给 display 字体：

```css
@font-face {
  font-family: 'Noto Serif SC Subset';
  src: url('/fonts/noto-serif-sc-subset.woff2?v=1') format('woff2-variations');
  font-weight: 400 700;
  font-display: swap;
  /* 显式排除 U+0000-2E7F：拉丁交给 display 字体，不浪费字节 */
  unicode-range: U+2E80-9FFF, U+3000-303F, U+FF00-FFEF, U+2018-201D, U+2026;
}
```

字体栈**拉丁在前、中文在后** —— 拉丁字体的 `unicode-range` 不含 CJK，
中文会自动落到第二个家族，浏览器只在真的渲染到 CJK 时去取那个 250 KB 文件：

```css
--font-display: 'Fraunces Variable', 'Noto Serif SC Subset', 'Songti SC', serif;
```

### 必须修掉的三个既有缺陷

1. 正文栈以 `Inter` 开头但**从不加载**（0 个 `@font-face`）—— 无效声明，实际落到 `system-ui`
2. 标题 `Georgia, "Songti SC", serif` **有 5 种不同写法**，中文在 Windows 落到 SimSun
3. 中文正文没有专属栈，Linux/Android 落到默认 `sans-serif`

### 字号 scale

```
--text-2xs  0.6875rem   (11px)  元信息 / 编号
--text-xs   0.75rem
--text-sm   0.875rem
--text-base 1rem
--text-md   clamp(1.0625rem, 1.6vw, 1.1875rem)   正文
--text-lg   clamp(1.125rem, 2vw, 1.375rem)
--text-xl   clamp(1.375rem, 2.4vw, 1.75rem)
--text-2xl  clamp(1.75rem, 3vw, 2.25rem)
--text-3xl  clamp(2.25rem, 4vw, 3rem)
--text-4xl  clamp(2.75rem, 5vw, 4rem)
--text-5xl  clamp(3rem, 7vw, 6rem)               page-title
--text-6xl  clamp(3.5rem, 11vw, 9rem)            display-title
```

行高：`tight 1.06` / `snug 1.3` / `body 1.9` / `flat 1`
字距：`display -0.045em` / `eyebrow 0.14em`

---

## 5. 间距

11 级，4px 基数，替换现有的 22 个 margin 值与 19 个 gap 值：

```
--space-3xs  4px     --space-xl    48px
--space-2xs  8px     --space-2xl   64px
--space-xs   12px    --space-3xl   96px
--space-sm   16px    --space-4xl   128px
--space-md   24px    --space-5xl   176px
--space-lg   32px
```

另有 4 个**语义化布局 token**，让页面不再散落 `clamp()`：

```
--section-y       clamp(72px, 10vw, 132px)
--gutter          48px
--gutter-mobile   32px
--header-h        78px
--header-h-mobile 70px
```

---

## 6. 网格与断点

### 断点：4 个

| token | 值 | 用途 |
| --- | --- | --- |
| `--bp-sm` | 640px | 手机横屏 / 小屏单列 |
| **`--bp-md`** | **900px** | **唯一切换点** —— 导航折叠、容器收窄、网格转单列、TOC 收起 |
| `--bp-lg` | 1200px | 桌面 |
| `--bp-xl` | 1440px | 宽屏 |

**900px 作为主断点能一次修掉现有的可见 bug**：
Header 在 850px 折叠导航并收窄到 `calc(100% - 32px)`，而容器在 760px 才收窄 ——
**761–849px 区间左右边距错位 8px**。统一到 900px 后消失。

> CSS 变量不能用在 `@media` 里，所以断点值必须在 `tokens.css` 顶部以注释形式
> 记录为「唯一真相」，并由 `scripts/check-tokens.mjs` 强制校验。

### 网格

- 12 栏，`--gutter` 为左右留白
- 内容最大宽 `--content: 1180px`，长文 `--reading`
- **长文正文宽度改为 65–75ch**（当前 760px ≈ 76 字符，略宽）

---

## 7. 形状

**默认直角。**

```
--radius:    0      默认
--radius-sm: 2px    代码 / 标签
```

这是与"圆角卡片博客"最强的区隔 —— 当前站点大量使用 `999px` 胶囊（约 10 处）
与 `24px` 圆角（6 处），正是要抛弃的语言。

阴影：只保留 1–2 个层级，且仅用于**真正浮起的元素**（当前 `--shadow` 被同时用于
hover 卡片和静态容器，无 elevation 层级）。

边框：`1px solid var(--color-border)` 为主力，`--color-border-strong` 用于强调。

---

## 8. 动效

### 允许的五类

1. 页面入场（一次性）
2. 排版 reveal（标题分批浮现，一次性）
3. 图版出现
4. 克制的 hover 反馈
5. 可选的页面过渡

**禁止把每个元素都动画。**

```
--dur-fast   120ms
--dur-base   200ms
--dur-slow   360ms
--dur-enter  520ms
--ease-out   cubic-bezier(0.22, 0.61, 0.36, 1)
--ease-in-out cubic-bezier(0.6, 0.05, 0.28, 0.95)
```

### `prefers-reduced-motion` 的正确实现

当前实现有明确缺陷，**必须重写**：

```css
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; --dur-enter: 0ms; }
  html { scroll-behavior: auto; }

  /* 关键：必须显式清零 transform 型 hover。
     位移是「状态变化」不是「动画」，token 归零管不到它。
     当前用 transition-duration:.01ms 会把平滑位移变成瞬时跳变，比不做还糟。 */
  .post-card:hover,
  .gallery figure:hover img,
  .button:hover { transform: none !important; }

  .playing .pulse,
  .playing .wave i { animation: none !important; }
}
```

**用 token 归零而非 `!important` 通配**：前者让
`transition: transform var(--dur-base)` 自动变成 0ms，是**平滑降级**；
后者是**瞬时跳变**。

另需覆盖 **JS 驱动的动效**：阅读进度条、以及 `SoundLab` 的 Web Audio gain ramp
（`linearRampToValueAtTime` / `setTargetAtTime` 不受 CSS 影响，
需读 `matchMedia('(prefers-reduced-motion: reduce)')` 后改用 `setValueAtTime`）。

---

## 9. 文章排版

### 长文（`.prose`）

现有 `.prose` 已覆盖标题、引用、代码、表格、KaTeX、`scroll-margin-top`，**质量良好，基本复用**。
需要调整：

- 正文宽度 → 65–75ch
- `scroll-margin-top` 改为 `calc(var(--header-h) + var(--space-md))`
  （当前硬编码 100px 而 header 是 78px → 锚点偏移 22px）
- 补 `overflow-wrap` —— 当前**只有 `.prose` 做了**，`.display-title` / `.page-title` /
  `.section-title` 都没有，长英文会溢出

### 元数据栏

见 §2 母题 2。承载编号、日期、分类、阅读时长、标签。

### 目录（TOC）—— 按数量阈值降级

**`transformer.md` 的实际情况比预想严重**：实测 **h2 = 470、h3 = 71**，
且**该文没有 h1**。所以"只展示 h2"仍是 470 条，侧栏不可用。

| 条件 | 模式 |
| --- | --- |
| h2 ≤ 20 | 完整展开 h2 + h3 |
| h2 ≤ 60 | 只列 h2，h3 收进每条 `<details>` |
| h2 > 60 | 整体 `<details>` 默认收起 + 显示当前章节摘录（`IntersectionObserver`） |

### 前置元信息

- 文章页应显示**修订日期**（`updated` 字段当前零引用，应启用）
- 阅读时长算法当前按字符数 ÷ 500，对中文/英文混算导致 `transformer.md` 显示 294 分钟。
  需重新评估口径

---

## 10. 图片

### 图版呈现

编号 + 说明 + 可选技术元数据。全站仅 2 张真实图，故为稀有元素。

### 管线

建立 `src/assets/` + `astro:assets`。**不需要新依赖** —— `sharp` 已随 `astro`
的 optionalDependencies 安装完毕。

- `image: { layout: 'constrained', responsiveStyles: true, breakpoints: [...] }`
  —— `responsiveStyles` 自动注入宽高/宽高比，是 **CLS 的直接解药**
  （当前 3 个 `<img>` 里 2 个无尺寸）
- `og:image` **必须与页面展示分开**：og 需要绝对 URL、稳定不带 hash，
  且 webp 在微信/Twitter 支持不可靠 → 单独生成 `public/og/banner.jpg`（1200×630）
- 原图 1.2 MB 留在 `src/assets/` 作 master，**永不进产物**

---

## 11. 组件分层

```
layouts/BaseLayout.astro        站点骨架 + head/scripts slot

components/chrome/              站点外壳（无 JS 优先）
  SiteHeader / SiteNav / MobileNavToggle / ThemeToggle / SearchLink / SiteFooter

components/ui/                  原子
  Button / Tag / TagList / Eyebrow / PageHero / SectionHeader / EmptyState / MetaLine

components/content/             内容展示
  PostList / PostCard / PostRow / TableOfContents / ReadingProgress / PostNav

components/islands/             仅有的三个带 JS 的组件
  SoundLab / Comments / CategoryFilter
```

### 判断规则：什么进全局 CSS，什么留组件内联

| 进全局 | 留组件内联 |
| --- | --- |
| 跨 ≥3 个页面出现**且**是结构而非外观 | 只服务单个组件的外观 |
| token 定义、reset、布局骨架、`.prose` | `.post-card` / `.sound-lab` 这类 |
| 被 ≥3 处重复的同一段声明 | 只出现 1–2 次的 |

**Astro 的 scoped `<style>` per-page 分包是首屏优势，必须保留。**
当前 29.5 KB 内联 CSS 分散在 22 个页面里，等于每页只付自己的那份。
不要为了"统一"把它们全搬进全局 —— 那会把 29.5 KB 变成每页都付。

### 一个编排器替代四套列表实现

当前全站有 **4 套不同的文章列表实现**（`blog/index` 客户端筛选、`archive` 年份分组、
`history` 编号时间线、`index` 最近 3 篇）。

改为 `PostList.astro` + 三个**正交** prop：

- `variant`: `card` | `row` | `list`
- `density`: `comfortable` | `compact`
- `lead`: 首篇是否放大

配合可选的 `filter` 挂载筛选岛，即可同时服务首页、`/blog/`、`/archive/`、
`/tags/[tag]/`、`/notes/`、`/research/`。

---

## 12. 验收：这个设计合格吗

每次视觉评审时问这 10 个问题：

1. 去掉站点名，还认得出这是 Frees Ling 吗？
2. 编号体系是否在真实地编目内容，而不是装饰？
3. 有没有为了"设计感"牺牲可读性？
4. 是不是又回到了卡片？
5. 强调色用了几处？超过 3 处就太多了。
6. 圆角是不是又出现了？
7. 动效是否只在五个允许类别里？
8. `prefers-reduced-motion` 下是否**真的**没有位移？
9. 中文标题在 Windows / Linux 上会渲染成什么？
10. 空白是这个设计的一部分，还是没排满？

**When in doubt, remove.**
