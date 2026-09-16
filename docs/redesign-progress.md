# FREES / FIELD LOG —— 重设计进度

> 每完成一个阶段更新本文件。完整方案见 `docs/redesign-plan.md`。

**当前阶段：P5c — Site Chrome（已实施，待最终验收）**
**P0–P3、P5a 已完成**

---

## 生产环境（本轮确认）

| 项 | 值 |
| --- | --- |
| 生产域名 | `https://frees-ling.dev` |
| `www` 子域 | `https://www.frees-ling.dev` → 301 → `https://frees-ling.dev/` ✅ |
| 托管 | **GitHub Pages**，`build_type: workflow` |
| 自定义域名 | `frees-ling.dev`（由仓库设置管理，**无 `public/CNAME`**） |
| 构建 | `.github/workflows/deploy.yml`：`withastro/action@v5` + `actions/deploy-pages@v4` |
| 质量门禁 | `.github/workflows/quality.yml` |
| **`frees-ling.github.io`** | 301 → **`http://frees-ling.dev/`**（明文 HTTP 中间跳）⚠️ |

⚠️ **待人工确认（未擅自修改）**：GitHub Pages 的 `https_enforced: false`，
导致 `http://frees-ling.dev/` 以明文返回 200 且不跳转 HTTPS，形成降级路径。
这属于 SSL/TLS 相关设置，且 Cloudflare 在前端可能存在重定向循环风险，
按指令列入需人工决策项。

---

## 阶段状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P0** | 冻结基线：截图能力 + 基线测量 | ✅ 完成（`ab4cb12`） |
| **P1** | HTML 正确性与 head 架构 | ✅ 完成（`02c0220`） |
| **P2** | 语义与无障碍 | ✅ 完成（`6bc15c7`） |
| **P3** | token 层落地 | ✅ 完成（`46826be`） |
| **P5a** | 新配色基座 | ✅ 完成（`279dd95`） |
| **P5c** | Site Chrome | 🔄 已实施，待验收 |
| 下一步 | Homepage 结构重做 | ⬜ |
| P2 | 语义与无障碍 | ⬜ 未开始 |
| P3 | token 层落地 + 上闸门脚本 | ⬜ 未开始 |
| P4 | 组件抽取（视觉等价） | ⬜ 未开始 |
| P5 | 视觉重设计 | ⬜ 未开始 |
| P6 | 资产与图片管线 | ⬜ 未开始 |
| P7 | 五区导航与栏目落地 | ⬜ 未开始 |
| P8 | 放宽 `.prettierignore` + 重写 AGENTS.md | ⬜ 未开始 |

---

## P5c — Site Chrome（已实施）

目标不是「美化导航栏」，而是第一次建立 **FREES / FIELD LOG 的全站框架语言** ——
后续 Homepage / Work / Notes / Article 都会继承这套语法。

### 移除的退班视觉语言

| 移除项 | 原因 |
| --- | --- |
| **圆形 F 徽章** | 模板式 logo 药丸；改为排版标记 `F/L` + 发丝竖线 |
| **`body` 的两层 radial-gradient 光晕**（旧青 `#64d8ca` / 旧珊瑚 `#ff8066`） | 简报明令禁止的「发光装饰」；且是纯装饰性绘制成本 |
| **圆形主题按钮** | 改为 mono 文字控件，显示当前主题 `DARK` / `LIGHT` |
| **导航当前项的药丸/背景块** | 改为发丝下划线 + `--signal` 1px 标记 |
| **页脚品牌大标题与 slogan 复述** | 改为 colophon 形态 |
| **页脚两列链接堆叠** | 收敛为单行全路由索引 |
| **不蒜子访客统计** | 第三方 CDN + 隐私问题 + 显示已损坏（渲染成「累计访问 一次」） |
| **`.hero-orbit` 圆环装饰** | 圆环 + 核心 + AI/CODE/MUSIC/LIFE 四卫星 —— 全页最刺眼的模板元素，信息量为零。**用真实数据表取代**：`RECORDING SINCE 2025` / `ENTRIES 17` / `LAST LOGGED`，取自 `site.ts` 与内容集合，可核对 |
| **全部 `999px` 胶囊** | 7 处（按钮、标签、项目状态）；`--radius-sm`（2px）取代。残留 0 处 |

### 三轮视觉迭代记录

**Round 1 — 结构与布局**
- 发现问题：移动端换行错误，`DARK MENU` 被挤到第二行（DOM 顺序 brand→nav→tools，nav 占满一行导致 tools 被换下）
- 修法：用 CSS `order` 让 brand 与 tools 同行、nav 落到下一行，不动 DOM 语义顺序

**Round 2 — 视觉层级与模板感**
- 做对的：masthead / colophon 已是 FIELD LOG 语言；项目列表的发丝线表格行
- 仍像模板的：`.hero-orbit` 圆环、7 处 `999px` 胶囊、`.future{opacity:.55}` 用透明度制造文字层级
- 全部清理

**Round 3 — 细节、responsive 与一致性**
- orbit 已被真实数据表取代；按钮直角化；masthead 在 1440/390 均成立
- 遗留（属 Homepage 范围，不在 P5c）：`Frees Blog.` 作为 hero 标题回答不了 Who/What/Why；卡片与区块仍是旧语言；全红 `Blog.` 的强调用量偏大

### 发现的部署架构（未改动）

| 服务 | 角色 |
| --- | --- |
| **GitHub Pages** | **生产权威** —— `server: GitHub.com` + Fastly CDN，无 `cf-ray` |
| **Cloudflare Pages** | 项目 `frees-ling-github-io`，在 PR 上跑检查（预览构建） |

两者均已配置，**未做任何改动**。

### 新的结构

**Masthead（编辑刊头）**
- 左：`F/L`（mono）+ `Frees Ling`（衬线）—— 排版标记，非徽章
- 中：`INDEX WORK NOTES ARCHIVE ABOUT`（mono 大写）+ `GITHUB ↗`
- 右：`DARK` / `LIGHT` 文字开关 + `MENU` 触发
- 底部一条发丝线；高度 64px（原 78px）
- 当前项用 `--signal` 1px 下划线标记

**Colophon（档案页尾）**
- `F/L | Frees Ling` 小标记
- 单行全路由索引：一级 5 项 + 低频 6 项 + `GITHUB↗` + `RSS↗`
  —— **导航与页脚合计覆盖全站所有路由**，修掉「14 个页面被切成两个互不相通的簇」
- 元信息行：`© 2026 · UTC+8 · BUILT WITH ASTRO · ↑ TOP`

**移动端（独立设计，非桌面压缩）**
- 单行：`F/L | Frees Ling` + `DARK MENU ≡`
- 用 CSS `order` 让 brand 与 tools 同行、nav 落到下一行（不动 DOM 语义顺序）
- 展开后全宽行 + 发丝线，触摸目标 ≥44px，无横向溢出
- `Escape` 关闭并把焦点交还触发按钮
- 收起时 `visibility: hidden` —— 移出 Tab 序列与无障碍树

### 全局框架 token

```
--gutter: 48px          --gutter-mobile: 20px
--header-h: 64px        --section-y: clamp(64px, 9vw, 120px)
--font-display / --font-sans / --font-mono
```

替换掉散落各页的 `calc(100% - 48px)` 等硬编码留白（残留 0 处）。

### STEP 7 — 编号体系的数据接口

新增 `src/utils/reference.ts`，实现 `FL-YYMM-NNN` 的**确定性推导**：

1. frontmatter 显式声明的 `reference` 优先（最终稳定来源）
2. 未声明时按 `(发布日期, id)` 排序推导 —— 给定同一批文章结果完全确定

**本阶段只建接口，不批量改文章 frontmatter**（按简报要求）。
待编号正式启用时，可跑一次性脚本把推导结果固化进 frontmatter。

### 过程中发现并修掉的问题

| 问题 | 处理 |
| --- | --- |
| `.future{opacity:.55}` 把文字压到 **2.46** 对比度 | 移除 opacity —— 用透明度制造文字层级是 P5a 规则明令禁止的做法；语义已由 `NEXT` 标签承载 |
| `/history/` 的 v1 iframe 用 `loading="eager"` | 改为 `lazy` —— 此前强制在页面加载时拉取整个归档旧站，是真实性能问题 |
| 归档 iframe 缺 `allow-modals`，旧站 `alert()` 被沙箱拦截产生控制台错误 | 补上（展览本就该可交互） |
| Dependabot 仍在为归档目录开 PR | 见下方「已知问题」 |
| `smol-toml` 1.7.0（**high**，TOML 解析 DoS） | `markdownlint-cli2` 精确锁死该版本；用 `overrides` 强制 `^1.7.1`，已解 |

### 新增工具

`scripts/visual/gate.mjs` —— 浏览器质量门禁：对比度 / 控制台错误 / 横向溢出 / 键盘可达性。
`npm run gate` 未接入（需手动调用）。这是后续每次提交前的硬性关卡。

---

## P3 — token 层落地（完成）

### 做了什么

- `global.css` 拆为 `tokens.css` / `base.css` / `primitives.css` / `prose.css`
  （仍是全局导入，Astro/Vite 会合并为同一 bundle，**运行时零成本**，拆文件只是作者侧模块化）
- **补全 light 主题的全部强调色** —— 这是本阶段唯一允许的视觉变化
- `biome.json` 的 CSS override 从 `src/styles/global.css` 改为 `src/styles/**/*.css`
  （不改的话 reduced-motion 的 `!important` 会触发 `noImportantStyles`，`lint` 直接红）
- **`check:tokens` 上线**并接入 CI 与 `stop-commit.sh`

### light 强调色：用数据选，不凭感觉

原值在浅底上的对比度：`--lime` 1.16（几乎不可见）、`--cyan` 1.38、
`--violet` 1.71、`--coral` 1.98 —— 全部远低于 AA 要求的 4.5。

新值经脚本计算，在 light 的**四个背景**（canvas / surface / surface-2 / paper）上均 ≥ 4.5：

| token | 新值 | 最差背景对比度 |
| --- | --- | --- |
| `--coral` | `#ad3f28` | 4.79 |
| `--cyan` | `#0f6f68` | 4.82 |
| `--lime` | `#4d6a0a` | 4.98 |
| `--violet` | `#5b45b8` | 5.64 |

### 过程中发现并修掉的一个自引入回归

把 coral 在 light 下加深后，压在其上的三处**硬编码深棕色文字**
（`#1c1712` / `#201713` / `#1d1713`）对比度掉到 **2.98**。

修法不是改回颜色，而是补一对 token：

```
--on-coral     dark #1c1712 (7.23)  /  light #fffaf0 (5.74)
--coral-hover  dark #ff927c         /  light #c04a30 (4.73)
```

同时把 3 处硬编码替换为 `var(--on-coral)`。

### 验收

- ✅ **P3 vs P2：28 处差异全部在 light 主题**，dark 主题 **100% 逐像素一致**
  （预期如此 —— dark 的强调色未改动）
- ✅ 对比度失败 **37 → 29**，自引入的 3 处回归已消除
- ✅ `check:tokens` 通过（断点违规从 20 降至 0）
- ✅ 五项校验 + `check:html` 全绿

### ⚠️ P5a 的关键决策点：简报指定的配色本身不过 AA

| 主题 | 色值 | 对比度 | 结论 |
| --- | --- | --- | --- |
| Light | `muted #72716C` | **4.29** | 低于 4.5，正文不达标 |
| Light | `signal blue #315CFF` | **4.49** | 差 0.01，正文不达标 |
| Light | `signal red #FF4B3E` | **2.91** | 不达标 |
| Dark | `signal blue #315CFF` | **3.83** | 正文不达标 |

**照搬会原样复制 P3 刚修掉的那个 bug。**
正确做法：保留指定的品牌色用于**填充 / 强调 / 大字**（这些只需 ≥3），
另配**文字安全变体**用于正文与链接（`--accent` vs `--accent-text` 两层）。
需与用户确认后实施。

---

## P2 — 语义与无障碍（完成）

新增 `npm run a11y`（`scripts/visual/a11y.mjs`）：axe-core 扫描 + 键盘可达性走查。

### 做了什么

| 修复 | 说明 |
| --- | --- |
| **移动端导航键盘可达性** | 收起时只有 `max-height:0 + opacity:0`，7 个不可见链接仍可获得焦点。加 `visibility: hidden` 修复 —— `visibility` 本身就会把元素移出 Tab 序列与无障碍树，**不需要 `inert`**（桌面端导航始终可见，误设 `inert` 会让链接不可聚焦） |
| **`.theme-toggle` 补 `aria-pressed`** | 在 Header 的脚本里同步初始值 —— Layout 的防闪烁脚本运行在 `<head>`，那时按钮还不存在 |
| **断点从 7 个收敛到 2 个** | 18 处 `900px` + 2 处 `640px`。这修掉了审计发现的可见 bug：Header 在 850px 折叠而容器在 760px 收窄，导致 **761–849px 区间左右边距错位 8px** |
| **`prefers-reduced-motion` 重写** | 补上 6 处 transform 型 hover 的显式清零。原先只做 `transition-duration:.01ms`，会把平滑位移变成**瞬时跳变，比不处理更刺眼** |
| `.search-link` 补 `title` | 提升可发现性 |

### 未做的两件事（及理由）

1. **SoundLab 的 Web Audio 未加 reduced-motion 分支** —— `prefers-reduced-motion`
   语义上针对**前庭性视觉运动**，套到音频增益渐变上不是标准做法；且此处播放由用户
   主动点击触发，不是意外声响。它的视觉部分（脉冲环、波形）是 CSS 驱动的，已停用。
2. **`<nav>` 里塞搜索/主题按钮的语义问题** —— 属于 header 的 DOM 重构，
   留给 P5c 与五区导航一起做，避免做两遍。

### 验收

- ✅ **截图：48/56 逐像素一致，8 处差异全部在 768×1024**（4 路由 × 2 主题）
  —— 正是断点统一应该影响的范围，其余视口无任何意外变化
- ✅ **键盘走查：已收起的导航内元素不再获得焦点**（导航修复生效）
- ✅ 五项校验全绿 + `check:html` 通过

### 审计发现的待办（P5a 处理）

axe-core 报 **37 处对比度失败**，全部在 light 主题 —— 这**实证确认了最重要的那个根因**：

| 前景 | 背景 | 次数 |
| --- | --- | --- |
| `#70827f`（light `--ink-faint`） | `#f6f1e6` | 19 |
| `#767d7b` / `#898f8c`（反色卡片弱化文字） | `#fffaf0` | 10 |
| **`#64d8ca`（`--cyan` 未为浅色重定义）** | `#f6f1e6` | 5 |
| `#ff8066`（`--coral`） | `#f6f1e6` | 1 |
| `#b8a5ff`（`--violet`） | `#f6f1e6` | 1 |
| **`#c3e36a`（`--lime`）** | `#f6f1e6` | 1 |

`--lime #c3e36a` 在浅底上几乎不可见 —— 与审计文档中的预判完全一致。
这些将在 **P5a** 换新配色时一并解决（新方案要求两套主题成对定义全部语义色）。

另有 2 项轻微问题：`/blog/` 的 `heading-order`（卡片用了 h3）、
`/search/` 的 Pagefind 第三方 UI。前者在 P4 统一列表组件时修。

---

## P1 — HTML 正确性与 head 架构（完成）

修改：`src/layouts/Layout.astro`、`src/pages/search.astro`、
`src/pages/blog/[...slug].astro`、`src/pages/blog/index.astro`

### 做了什么

1. **`Layout.astro` 新增 `<slot name="head" />` 与 `<slot name="scripts" />`**
   —— 根因修复。没有注入点时，页面只能把节点写在 `</Layout>` 之后，
   Astro 会把它们渲染到 `</html>` 之外。
2. **`theme-color` 改为 media 作用域成对声明** —— 原来是硬编码的单个
   `#071c24`，既不符合任何 token，也不随主题更新（浅色模式下移动端浏览器 UI 仍是深色）。
   新写法零 JS、自动跟随系统主题。
3. 三个页面改用 `<Fragment slot="scripts">` / `<Fragment slot="head">`。

### 实测发现：问题比预想的广

新增的 `scripts/check-html.mjs` 立刻发现**问题不止 `/search/`**：

| 文件 | `</html>` 之后的残留 |
| --- | --- |
| `/search/` | 858 字符 |
| 17 个文章页 | 各 259 字符（阅读进度条脚本） |
| `/blog/` | 447 字符（分类筛选脚本） |

**共 18 个页面存在无效 HTML。** 逐类修复后降至 0。

### 验收

- ✅ `npm run check:html` 通过（65 个文件）
- ✅ **截图逐像素一致：56/56**（结构性修复不应产生任何视觉变化）
- ✅ 五项校验全绿

`check:html` 已接入 CI（放在 `build` 之后，因为它检查的是构建产物）。

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
