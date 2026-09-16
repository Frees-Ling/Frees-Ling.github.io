# 重设计执行计划

> 本文是公共站 FIELD LOG 视觉重设计的专项子计划。平台级阶段、Studio、Knowledge、存储与恢复计划见
> `docs/execution/MASTER_PLAN.md`；当前真实状态见 `docs/execution/STATE.md`。

概念见 `design-system.md`，结构见 `information-architecture.md`，
现状见 `design-audit.md`，进度见 `redesign-progress.md`。

**核心约束**：始终保持构建绿色；不破坏现有 URL；不 deploy；
`archives/` 与 `public/history/` 只读。

---

## 阶段总览

| 阶段 | 内容 | 截图验收 |
| --- | --- | --- |
| P0 | 冻结基线：截图能力 + 基线测量 | 建立基线 |
| P1 | HTML 正确性与 head 架构 | **逐像素一致** |
| P2 | 语义与无障碍 | 仅 768/820px 允许变化 |
| P3 | token 层落地 + 上闸门脚本 | 仅 light 主题色相变化 |
| P4 | 组件抽取（视觉等价） | **diff 应为零** |
| P5 | 视觉重设计 | 人工审阅（diff 必然大） |
| P6 | 资产与图片管线 | 图片相关变化 |
| P7 | 五区导航与栏目落地 | 导航/页脚变化 |
| P8 | 放宽 `.prettierignore` + 更新 AGENTS.md | 无视觉变化 |

---

## 每阶段的统一验收

```bash
npm run format:check && npm run lint && npm run lint:md && npm run check && npm run build
npm run check:tokens          # P3 起
npm run shot -- --label <阶段>
```

> ⚠️ **必须手动跑完，不能依赖 hook 反馈。**
> `.claude/hooks/stop-commit.sh` 是 `npm run $s || exit 0` ——
> **校验失败会静默跳过提交，不报任何错**，改动会长时间滞留而无提示。

---

## P0 — 冻结基线

**已完成。**

- `scripts/visual/chrome-path.mjs` + `scripts/visual/screenshot.mjs`
- `npm run shot`（多视口 + 双主题 + 整页 + CWV 采集）
- 基线测量记入 `redesign-progress.md`

**踩过的坑（不要再犯）**：
1. **不用 `astro preview` 作截图服务** —— 它在本机是守护进程化的，
   spawn 后 kill 父进程杀不掉，会留下残留服务占端口
2. **不用 headless-shell 的 `--screenshot` CLI** ——
   `--window-size=1440,20000` 会把 `100svh` 变成 20000px，
   首页 `.hero{min-height:calc(100svh - 79px)}` 会被撑成 20000px 高，截图不可用；
   且 CLI 无法切主题（主题靠 `<html data-theme>` 属性）

---

## P1 — HTML 正确性与 head 架构

**不动视觉。**

- `Layout.astro` 加 `<slot name="head" />` 与 `<slot name="scripts" />`
- `search.astro` 把 `<link rel="stylesheet">` 与 `<script>` 移进 slot
  （当前它们渲染在 `</html>` 之外，是无效 HTML）
- `theme-color` 换成 media-scoped 双 meta（零 JS、随主题自动切换）
- 新增 `scripts/check-html.mjs`：断言每个 `dist/**/index.html` 里
  `</html>` 是最后一个非空白内容

**验收**：五项 + `check-html` + 截图**逐像素一致**。

---

## P2 — 语义与无障碍

**不动视觉（除断点统一处）。**

- 导航收起：加 `visibility:hidden` + `inert`（JS 里 toggle `navElement.inert = !open`）
- `.theme-toggle` 加 `aria-pressed`（JS 同步）
- `.search-link` 移出 `<nav>`，加可见文字与 `aria-label`
- **断点统一到 900px** —— 修掉 761–849px 区间 8px 边距错位
- **reduced-motion 重写**：token 归零 + 显式清零 transform 型 hover（见 design-system §8）
- `SoundLab` 加 `matchMedia('(prefers-reduced-motion: reduce)')` 分支，
  Web Audio 改用 `setValueAtTime`

**验收**：五项 + 截图（仅 768/820px 允许变化）+ 键盘走查脚本。

---

## P3 — token 层落地

- 新建 `src/styles/tokens.css`，现有变量**原样迁入**
- **补全 light 主题的全部强调色**（这是本阶段唯一允许的视觉变化）
- `global.css` 拆为 `base` / `primitives` / `prose` / `utilities`
- ⚠️ **同步改 `biome.json`**：`"includes": ["src/styles/global.css"]`
  → `["src/styles/**/*.css"]`。不改的话 reduced-motion 的 `!important`
  会触发 `noImportantStyles`，`npm run lint` 直接红
- **上线 `scripts/check-tokens.mjs` + `npm run check:tokens`**

### `check-tokens.mjs` 的四项检查

| # | 检查 | 级别 |
| --- | --- | --- |
| ① | 颜色字面量只允许出现在 `tokens.css` | error |
| ② | **`var()` 引用完整性** —— 引用了未定义的 token | error |
| ③ | 断点白名单 `N ∈ {640,900,1200,1440}` | error |
| ④ | 间距裸 px 值 | warning |

> **②价值最高**：token 改名后未同步的地方**完全不报错**，属性静默变成无效值。
> 全站 22 个文件、约 72 处颜色字面量，靠人工同步不可能不出错。
>
> 注：`var(--x, fallback)` 的合法用法要按"有默认值 → 不算未定义"处理。

接入 `quality.yml` 与 `stop-commit.sh` 的 `CHECKS`。

**验收**：五项 + `check:tokens`；截图仅 light 主题色相变化。

---

## P4 — 组件抽取（视觉等价）

**每步单独提交，截图 diff 应始终为零。**

1. 抽 `utilities.css` 的 `.grid-2` → 替换 6 处重复 + 删除各自的 760px 媒体查询
2. `PostList` / `PostCard` / `PostRow` / `posts-query.ts` → 逐页替换
   （`tags/[tag]` → `notes` → `research` → `archive` → `blog/index` → `index`）
3. `SiteHeader` 拆为 5 个组件
4. `ui/` 原子（`Button` / `Tag` / `Eyebrow` / `PageHero` / `SectionHeader` / `EmptyState`）
5. **`TableOfContents` 阈值降级** —— 见下

### TOC 降级（transformer.md 专项）

实测该文 **h2 = 470、h3 = 71**，且**没有 h1**。
"只展示 h2"仍是 470 条，侧栏不可用。

| 条件 | 模式 |
| --- | --- |
| h2 ≤ 20 | 完整展开 h2 + h3 |
| h2 ≤ 60 | 只列 h2，h3 收进每条 `<details>` |
| **h2 > 60** | 整体 `<details>` 默认收起 + 当前章节摘录 |

**单独验收**：实测 `dist/blog/transformer/index.html` 的大小与首屏渲染时间。

---

## P5 — 视觉重设计

按 `tokens → fonts → chrome → 列表 → prose → 页面区块` 顺序，每次提交一层。

| 步骤 | 内容 |
| --- | --- |
| 5a | tokens 换值（色彩 / 间距 / 字号 / 圆角 / 动效） |
| 5b | 字体接入（拉丁走 Astro Fonts API，中文标题走子集）— **单独量一次 CLS** |
| 5c | chrome（header / footer / 五区导航） |
| 5d | 列表与卡片 → 发丝线语言 |
| 5e | `.prose` 精修 |
| 5f | 页面专属区块（含移除 `.hero-orbit`） |

**验收**：每步五项 + 截图人工审阅 + LCP/CLS 不退化超过 10%。

---

## P6 — 资产与图片管线

- 建 `src/assets/`，`banner.jpg` / `avatar.jpg` 迁入
- `astro.config.mjs` 加 `image: { layout:'constrained', responsiveStyles:true, breakpoints:[…] }`
- 生成 `public/og/banner.jpg`（1200×630）—— **og 必须与页面展示分开**：
  需要绝对 URL、稳定不带 hash，且 webp 在微信/Twitter 支持不可靠
- 3 个 `<img>` 换成 `<Image>` / `<Picture>`
- `scripts/build-fonts.mjs` + `scripts/check-fonts.mjs`（中文子集）

**验收**：五项 + `dist/` 里不再有 1.2 MB 原图 + `og:image` 绝对 URL 可达。

---

## P7 — 五区导航与栏目落地

- 导航改 INDEX / WORK / NOTES / ARCHIVE / ABOUT + GITHUB
- **URL 全部保留**（见 `information-architecture.md` §2）
- `notes.astro` / `research.astro` 改为数据驱动
- 启用 `featured` / `updated` / `lang`，新增可选 `section` / `summary`
- 新增 `scripts/check-links.mjs`：对旧 URL 清单断言 `dist/<path>/index.html` 存在

**验收**：五项 + `check-links`。

---

## P8 — 放宽 `.prettierignore`（必须最后）

前置条件：**所有 `.astro` 与 CSS 文件都已是正常多行格式。**

```bash
npx prettier --check .        # 先看会改多少，不要直接 --write
git rev-parse HEAD            # 记下回退点
# 移除 .prettierignore 里的 **/*.astro 与 src/styles/global.css
npm run format
git diff --stat               # 检查是否改动了不想改的地方
```

**必须同步修改 `AGENTS.md`** —— 现在写着「不要移除这些排除项」
并附「627 行 → 3300 行（+425%）」的实测记录。放宽后这段与事实矛盾。

**验收**：五项全绿。

> P8 之前先跑 `npx biome lint src --diagnostic-level=info` 看全量诊断 ——
> 多行格式会暴露原被单行掩盖的问题（`noImportantStyles` 等）。
> **绝对保留** `biome.json` 里 `.astro` 的 `noUnusedImports` / `noUnusedVariables` 覆盖
> （62 条诊断全是误报，且是 unsafe autofix，照做会删掉真实 import 导致构建失败）。

---

## 风险清单

| # | 风险 | 规避 |
| --- | --- | --- |
| 1 | **token 改名后静默失效** | `check-tokens.mjs` 的 var 完整性检查，**P3 就上线** |
| 2 | **校验失败静默阻塞提交** | 每阶段**手动**跑五项 |
| 3 | 中文子集过时 → 混排系统字体 | `fonts:check` 零网络校验 + 字符集清单入库 |
| 4 | 构建期网络依赖（fontsource provider 抓 CDN） | 写进 AGENTS.md；不可接受则退回手工 `@font-face` |
| 5 | **中文字体引入 CLS** | 度量对齐 fallback（`size-adjust`）+ **P5b 单独量** |
| 6 | **transformer.md 的 470 条 h2** | 阈值降级；单独实测页面大小 |
| 7 | GitHub Pages 不支持服务端重定向 | **不新增 URL** |
| 8 | P8 后 Biome 对 `.astro` 报新诊断 | P8 前先看全量；保留误报规则的 override |
| 9 | `biome.json` 的 CSS override 失配 | P3 拆文件时同步改 |
| 10 | reduced-motion 不覆盖 Web Audio | SoundLab 加 `matchMedia` 分支 |
| 11 | `quality.yml` 在 PR 上执行 npm 脚本（安全审查提示） | `npm ci --ignore-scripts` **会破坏构建**（esbuild 需要 install script）；可行加固是网关 fork PR，列为可选 |

---

## 两条最关键的判断

1. **绝不要用 `subsets: ['chinese-simplified']`** ——
   实测会静默产出 1.44 MB 且**没有 `unicode-range`** 的字体，
   构建成功、不报错、页面变慢。
2. **`check-tokens.mjs` 的 var 引用完整性检查要在 P3 上线** ——
   CSS 变量失效**完全静默**，这个规模靠人工同步不可能不出错。
