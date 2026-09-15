# 信息架构

---

## 1. 现状问题

### 最严重的：导航与页脚**零重叠**

| | 条目 |
| --- | --- |
| **导航（Header）** | 首页 · 文章 · 项目 · 研究 · 音乐 · 随笔 · 关于 |
| **页脚（Footer）** | 文章归档 · 历史个人博客 · 此刻 · 照片墙 · 朋友们 · 留言板 |

**7 个导航项没有一个出现在页脚，6 个页脚项没有一个出现在导航。**
全站 14 个页面被切成两个互不相通的簇，只有首页同时链接到两边。

后果：`/gallery/`、`/friends/`、`/guestbook/`、`/now/`、`/archive/`、`/history/`
**只能从页脚到达**，而移动端页脚在长页最底部 —— 实际上等于没有入口。

### 其他

- **`/search/` 只以裸字符 `⌕` 出现在 header**，无文字、无 `title`，可发现性极低
- 导航 7 项平铺，无层级，`音乐` / `随笔` 与 `文章` / `项目` 并列但体量悬殊
- 首页 `practice-section` 与导航**措辞不一致**：
  首页写"智能/研究、代码/构建、声音/创作、生活/随笔"，导航写"研究、项目、音乐、随笔"
- `notes.astro` 用**硬编码 id 白名单** `['lovev10','meeting','thinking','index']` 挑文章，
  `research.astro` 用**硬编码标签白名单** —— 新增文章不会自动出现，
  且 `notes` 会把 25 字的空文章放进列表首位

---

## 2. 目标结构：五区 + 一个外链

```
INDEX      /                首页
WORK       /projects/       项目（含研究）    ← 标签显示为 WORK
NOTES      /blog/           记录（含随笔）    ← 标签显示为 NOTES
ARCHIVE    /archive/        归档
ABOUT      /about/          关于
GITHUB ↗   github.com/…     外部链接
```

### 关键决策：**导航标签改变，URL 不变**

| 导航标签 | 实际 URL | 理由 |
| --- | --- | --- |
| INDEX | `/` | — |
| WORK | `/projects/` | **不改 URL** |
| NOTES | `/blog/` | **不改 URL** |
| ARCHIVE | `/archive/` | — |
| ABOUT | `/about/` | — |

简报的唯一硬性 URL 约束是"不要破坏文章 URL"。`postHref` 用 `post.id`
（glob loader 已小写化去标点），如 `code-for-py3.10.md` → `/blog/code-for-py310/`。

**不新增 `/work/` 或 `/notes/` 路由**，理由：
- GitHub Pages **不支持服务端重定向**，`_redirects` 无效
- `Astro.redirect()` 生成的是 meta-refresh 页面，会被 `@astrojs/sitemap` 收录进 sitemap，
  需要额外加 `noindex` 与 `filter` 排除
- 标签与路径不完全对应在编辑类站点非常常见，零破坏优于语义洁癖

---

## 3. 页脚

承载**低频页面**与**元信息**，与导航形成互补而非重复：

| 分组 | 条目 |
| --- | --- |
| **记录** | 此刻 `/now/` · 随笔 `/notes/` · 归档 `/archive/` |
| **其他** | 声音 `/music/` · 相册 `/gallery/` · 朋友 `/friends/` · 留言板 `/guestbook/` · 历史 `/history/` |
| **连接** | GitHub · X / Twitter · Telegram · Bilibili · RSS |

底部：版权 + 坐标（不再使用不蒜子统计 —— 第三方 CDN + 隐私问题，
且 3.6 KB 只为一个 PV 数字不值得）。

**导航与页脚合计覆盖全站所有页面**，修掉当前的"两个互不相通的簇"问题。

---

## 4. 栏目语义：由标签解析，不再是硬编码

### 问题

`notes.astro` 与 `research.astro` 现在靠硬编码白名单挑文章。
**新增文章不会自动出现**，需要手工维护两个数组。

### 方案：新增 `section` 字段 + 标签回退

`src/content.config.ts` **只加可选字段，不碰任何 `.md` 文件** ——
现有 17 篇全部合法，`build` 不受影响：

```ts
section: z.enum(['work', 'notes', 'research', 'life']).optional(),
summary: z.string().optional(),
// 同时启用三个已存在但零引用的字段：
featured: z.boolean().default(false),
updated: z.coerce.date().optional(),
lang: z.enum(['zh', 'en']).default('zh'),
```

`src/data/sections.ts` 定义**由真实标签推导**的映射（不是虚构内容）：

```ts
export const sectionByTag: Record<string, SectionId> = {
  AI: 'research', Transformer: 'research', 机器学习: 'research',
  YOLO: 'research', 计算机视觉: 'research', 机器人: 'research',
  'Unitree Go2': 'research',
  Astro: 'work', Python: 'work', Linux: 'work', GitHub: 'work',
  生活: 'notes', 随笔: 'notes', 思考: 'notes',
};

export function resolveSection(post: Post): SectionId {
  return post.data.section                          // 一等字段优先
    ?? normalizeTags(post.data.tags).map((t) => sectionByTag[t]).find(Boolean)
    ?? 'notes';                                     // 兜底
}
```

### 空壳文章：降权，不隐藏

实测正文实质长度（剔代码块后非空白字符）：

| 长度 | 文章 |
| --- | --- |
| **18** | `index.md` |
| 191 | `YOLO-train-recommand.md` |
| 206 | `meeting.md` |
| 227 | `LOVEv1.0.md` |
| ≥ 405 | 其余 13 篇 |

**阈值 600 干净分离。** 短的排到列表后面，**但仍可访问** ——
隐藏会丢 URL / SEO / 外链，且违背"诚实"原则。

```ts
const SUBSTANCE_THRESHOLD = 600;
export function splitBySubstance(posts: Post[]) { /* … */ }
```

---

## 5. 首页结构

简报要求的 6 个区块，对照当前实现：

| # | 简报要求 | 当前 | 处理 |
| --- | --- | --- | --- |
| 1 | Identity Hero | ✅ 但**未回答 Who/What/Why** | 重写 |
| 2 | Selected Work | ⚠️ 排在**第 4 位** | 前移到第 2 位 |
| 3 | Featured Writing | ✅ 第 2 位 | 与 Work 换位 |
| 4 | Recent Notes | ❌ 混在 `practice-section` 的一个链接里 | **独立成区块** |
| 5 | Current interests / signal | ⚠️ 部分（`now-section`） | 保留并强化 |
| 6 | Minimal footer | ✅ | 精简 |

**移除**：`.hero-orbit`（简报禁止的发光球体类装饰）、
`practice-section` 的米色反色色块（与深青底硬拼接，是整页最突兀的元素）。

### Hero 内容

核心主张：**「工程实验的记录者」**

必须在 5 秒内回答：

- **Who** —— Frees Ling / 凛风
- **What** —— 记录 AI 决策、计算机视觉与机器人实验
- **Why 继续看** —— 13 个月连续记录，17 篇有技术密度的笔记

保留：
- 真实坐标 `31.23° N · 121.47° E`（提升为"记录地点"）
- 亲和语气（简报允许保留，但必须让位于信息层级）

### 底部引言

**「保持敏感，保持具体。］** —— 用户确认为真实的话，保留署名。

---

## 6. 页面清单与去向

| 当前 URL | 新位置 | 处理 |
| --- | --- | --- |
| `/` | INDEX | 重写 |
| `/blog/` | NOTES | 重写（列表编排器 + 筛选） |
| `/blog/<slug>/` | 不变 | **URL 绝对不动**，重写排版 |
| `/projects/` | WORK | 重写（标签改 WORK） |
| `/research/` | WORK 子栏 | 保留路径，改为数据驱动 |
| `/notes/` | NOTES 子栏 | 保留路径，改为按 category 自动筛选 |
| `/archive/` | ARCHIVE | 重写 |
| `/about/` | ABOUT | 重写 |
| `/tags/<tag>/` | 不变 | 复用列表编排器 |
| `/music/` | 页脚 | 保留页面，重设计为**诚实的空状态** |
| `/gallery/` | 页脚 | 同上（当前 3 个 figure 里 2 张是同一张图） |
| `/friends/` | 页脚 | 同上（当前已是空态） |
| `/guestbook/` | 页脚 | 保留，重设计 |
| `/now/` | 页脚 | 保留，去掉写死的 `UPDATED 2026.09` |
| `/history/` | 页脚 | **保留，必须继续指向 `/history/v1/` 与 `/history/v2/`** |
| `/search/` | Header（可见文字 + 图标） | 修无效 HTML，提升可发现性 |
| `/404`, `/rss.xml`, `/robots.txt` | 不变 | — |

### 空内容的诚实处理

简报明确"不虚构内容"。以下页面内容稀薄，设计成**诚实的"尚未收录"状态**
（像一本真实野外笔记里的空白页），而不是假装有内容、也不是删掉：

| 页面 | 真实情况 |
| --- | --- |
| `/music/` | `public/audio/` 是**空目录**，只有 1 个浏览器实时合成的 SoundLab |
| `/gallery/` | 全站**只有 2 张真实图片** |
| `/friends/` | 空态 |

---

## 7. 必须修掉的结构缺陷

| 缺陷 | 位置 |
| --- | --- |
| `search.astro` 的 `<link>`/`<script>` 渲染在 `</html>` **之外**（无效 HTML） | 根因：Layout 无 head 注入点 → 加 `<slot name="head" />` + `<slot name="scripts" />` |
| 移动端导航收起时链接**仍可聚焦** | `Header.astro:64` 缺 `visibility:hidden` + `inert` |
| `.search-link` 只有 `⌕` 字符，无文字无 `title` | `Header.astro:19` |
| `.theme-toggle` 缺 `aria-pressed` | `Header.astro:20` |
| **4 套文章列表实现** | `blog/index`（客户端筛选）、`archive`（年份分组）、`history`（编号时间线）、`index`（最近 3 篇）→ 收敛为 1 个编排器 |
| `.timeline` 在 `projects.astro` 与 `history.astro` 是**两套不同的东西** | 同名冲突，需重命名 |
| `.post-grid` 同名不同定义 | `index.astro:79` vs `blog/index.astro:26` |
| 6 处重复的 `grid-2` + 各自重写的 760px 媒体查询 | 抽为工具类 |

---

## 8. 验收

- [ ] 导航 5 项 + GITHUB 外链，页脚覆盖其余全部页面，**两者合计无遗漏**
- [ ] 所有现有 URL（尤其 `/blog/<slug>/`）返回 200
- [ ] `/research/` 与 `/notes/` 新增文章后**自动出现**，无需改代码
- [ ] 空壳文章不出现在任何列表的首位
- [ ] `/history/` 仍能访问 `/history/v1/` 与 `/history/v2/`
- [ ] `search` 在 header 里有可见文字
- [ ] 键盘 Tab 在移动端导航收起时**不会**聚焦到不可见链接
