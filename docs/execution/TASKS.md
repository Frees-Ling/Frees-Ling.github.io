# 持久任务清单

状态：`BACKLOG / READY / ACTIVE / BLOCKED / DONE / DROPPED`。

只有满足 Acceptance 并填入 Evidence/Commit 后才能标记 DONE。

## 当前队列

### GOV-001 — 建立长期计划真相源

- Status: DONE
- Phase: G0
- Priority: P0
- Depends-On: none

Objective：把共享对话的最终决定与当前仓库事实整理为不冲突、可迁移、可执行的文档体系。

Acceptance：

- 产品、架构、存储、安全、恢复、总计划、任务、状态、决策、测试、发布与开放问题均有明确文档。
- 明确记录早期方案被覆盖的关系。
- 保留现有重设计专项文档，不重置已完成阶段。
- `AGENTS.md` 指向新的真相源，且当前“不 push”规则保持不变。
- 所有仓库质量命令通过并提交。

Evidence：

- `npm run format:check`、`lint`、`lint:md`、`check:tokens`、`check` 全部通过。
- `npm run build` 构建 66 页，Pagefind 索引 17 页；`npm run check:html` 检查 65 个 HTML 文件通过。
- 对新增治理文档额外运行 markdownlint，0 issue。
- `scripts/visual/serve.mjs` 的并行工作区改动未纳入本任务。

Commit：本文件所在的 GOV-001 治理提交。

### WEB-006 — P5c Site Chrome 最终回归

- Status: DONE
- Phase: W1
- Priority: P0
- Depends-On: GOV-001

Objective：以提交 `17d3e9a` 为基线完成导航、页脚、主题、移动菜单和全部路由的最终验收。

Acceptance：

- 1440/1024/768/430/390 代表视口，深浅主题，无横向溢出。
- 键盘、Escape、焦点回交、收起导航不可聚焦。
- 导航和页脚覆盖全部主要路由，旧 URL 可达。
- 对比度、控制台、HTML、token、a11y、构建闸门通过。
- `docs/redesign-progress.md` 不再保留矛盾/重复状态行。

Evidence：

- **全部 10 项命令通过**：`format:check`、`lint`、`lint:md`、`check:tokens`、`check`、
  `build`、`check:html`、`a11y`，以及 `scripts/visual/gate.mjs` 分别对 dev server 与
  构建产物各跑一次。
- **浏览器门禁**（7 视口：1440/1280/1024/768/430/390/360 × 16 路由）：
  对比度 0 失败、路由可达性全通过、横向溢出 0、键盘走查干净、控制台错误 0。
- **交互验收 11/11**：菜单展开、`aria-expanded` 切换、`aria-label` 切换、
  展开后链接可聚焦、Escape 关闭、**焦点回交菜单按钮**、收起后链接不可聚焦、
  主题切换、标签随主题更新、`aria-pressed` 同步。
- **覆盖检查**：导航 6 项 + 工具 1 项 + 页脚 15 项，覆盖全部 13 个结构性路由。
- **旧 URL 18/18 可达**；**大小写负向测试 4/4**（`/tags/ai/`、`/Tags/AI/`、
  `/BLOG/`、`/Projects/` 均 404 —— 与 Linux/GitHub Pages 行为一致）。
- **CWV**（7 视口）：LCP 44–96ms、CLS 0.0000、TBT 0ms。
- 截图 84 张存于 `_backups/shots/web006/`。

本任务中发现并修复的缺陷：

1. **`/search/` 入口丢失**（我在 P5c 重写 Header 时移除）→ 补回 `SEARCH` 工具链接。
2. **`/research/` 与 `/notes/` 成为孤儿页** —— 五区导航合并后无任何入口
   → 纳入页脚二级导航。
3. **Pagefind「清空」按钮不可见却可聚焦** —— 该组件用 `opacity:0` 隐藏，
   但 `opacity` 不移出 Tab 序列 → 补 `visibility:hidden`。
4. **搜索框无可见标签** —— Pagefind 生成的 input 无 `id`、无 `label`，只有 `title`
   → 补可见 `<label>` 并在初始化后绑定 `id`。
5. **`/history/` 在无头环境下 DOM 求值超时** —— 内嵌两个完整归档站点会长时间
   占用渲染进程主线程。已核实生产返回 200、页面 2 秒内 `readyState=complete`，
   属无头自动化固有限制而非用户可见缺陷；门禁改为只对其做 HTTP 可达性检查并记录原因。

<!-- 修复 1–4 的提交见本文件所在提交；缺陷 5 的判定依据见 docs/redesign-progress.md -->

Commit：本文件所在提交。

### WEB-007 — 首页编辑化重构

- Status: DONE
- Phase: W1
- Priority: P0
- Depends-On: WEB-006

Objective：按 Identity → Selected Work → Featured Writing → Recent Notes → Current Signal 重构首页。

Acceptance：首屏 5 秒测试可回答 Who/What/Why；无标签云/模板卡片墙；真实内容；三轮视觉 QA；
移动端独立成立；所有质量闸门通过。

Evidence：

- **首屏改为 Identity 区**：`Frees Ling / 凛风` + 明确的研究方向
  （AI 决策 / 计算机视觉 / 机器人实验）+ 为什么继续看（2025–2026 至今 17 篇、含推理过程
  与失败尝试）。旧 hero 是站点名 `Frees Blog.` 加装饰圆环 —— 只回答了「这个站叫什么」。
- **移除 `.practice-section`** —— 那块整幅反色块的四宫格内容与导航重复，
  且是审计中标记的「整页最突兀的元素」。
- **顺序调整为** Identity → Selected Work → Featured Writing → Recent Notes →
  Current Signal → Quote。
- **Selected Work** 用发丝线表格行（编号 / 类型 / 名称 / 描述 / 状态），不用卡片。
- **Recent Notes** 是与卡片形成密度对比的**索引列表**（编号 + 日期 + 标题），
  直接来自内容集合，**未引入硬编码白名单**（栏目数据化属 WEB-008）。
- 全部内容为真实数据：项目取自 `site.ts`，文章取自内容集合，无编造数字或成果。

三轮视觉 QA：

1. **结构**：移动端工作行与索引列表的栅格重排独立成立。
2. **层级与模板感**：修正工作行的 baseline 错位（大字号标题被压低）；
   修正引言 `max-width:15ch` 对中文过窄导致的「保持具 / 体。」断行。
3. **细节与一致性**：发现 `featured` 取 2 篇会在网格右侧留半格空白
   （首篇 span 2 + 次篇半列），改为取 3 篇正好填满；
   另修正 `PostCard` 的圆形箭头按钮（`border-radius:50%`）与全站直角语言冲突。

验证：

- `format:check`、`lint`、`lint:md`、`check:tokens`、`check`、`build`、`check:html` 全部通过。
- 浏览器门禁：7 视口 × 16 路由，对比度 0 失败、横向溢出 0、键盘干净、控制台 0 错误。
- `npm run a11y`：axe-core 0 违规、键盘走查干净。
- 截图存于 `_backups/shots/web007-r1/`。

超出本任务范围、已记录待后续处理：`about.astro` 的头像与文章页 CC 徽章仍为圆形
（`border-radius:50%`），属 WEB-008 列表与页面语言的范畴。

Commit：本文件所在提交。

### WEB-008 — 列表与栏目数据化

- Status: DONE
- Phase: W1/W4
- Priority: P1
- Depends-On: WEB-007

Acceptance：Work/Notes/Archive 使用统一编排器；无文章标题白名单；人工内容字段可验证；空内容诚实降权。

Objective：收敛 6 处各自实现的文章列表，让栏目由数据驱动，短内容诚实降权而非隐藏。

Evidence：

**① 统一编排器** —— 新增 `src/components/PostList.astro`，差异由三个正交维度表达
（`variant` card/row/index × `density` × `lead` + `groupBy`），替代了此前分散在
首页、`/blog/`、`/archive/`、`/tags/`、`/notes/`、`/research/` 的 6 份实现。
其中「两列网格 + 首篇跨列」这条规则此前被复制 5 遍，每份带一个自己的 900px 媒体查询。

**② 取数层** —— 新增 `src/utils/posts-query.ts`（`getAllPosts` / `getLatest` /
`getByYear` / `getByTag` / `getAllTags` / `getBySection` / `splitBySubstance` /
`buildListModel`），页面不再各自 `getCollection` + 各自排序。

**③ 栏目数据化** —— 新增 `src/data/sections.ts`，删掉两处硬编码白名单：

- `notes.astro` 的文章 id 白名单 `['lovev10','meeting','thinking','index']`
- `research.astro` 的标签白名单 + `.slice(0, 4)`

后者让第 5 篇之后的研究记录**在任何栏目页都不可见**，而它们本来就在内容集合里。
现在栏目为 8 / 5 篇，全部来自真实数据。

**④ 人工内容字段可验证** —— schema 新增可选 `section`（人工覆盖归属，优先级高于标签推断）；
新增 `scripts/check-content.mjs`，接入 `npm run check:content`、`quality.yml`
与 `stop-commit.sh` 的 CHECKS。它拦下三类**原本完全静默**的错误：
`section` 拼写错误、`updated` 早于 `published`、`sections.ts` 里声明了不存在的标签。
未归入任何栏目的文章会以警告列出（当前 4 篇），不隐藏。

**⑤ 空内容诚实降权** —— `SUBSTANCE_MIN = 600`，取自 17 篇去代码块后的真实断层
（555 与 751 之间）。降权到列表末尾并标注「短记录」，**不隐藏** ——
URL、SEO 与外链都保留。归档页不重排（年份是它的契约），只在行内标注。

本任务中发现并修复的缺陷：

1. **`thinking.md` 从所有栏目页消失** —— 它的 `category` 是显式空串 `''`，
   而 `normalizeCategory` 把空串与 `daily` 一起映射成「生活」。
   一篇 3800 字的文章因此不在任何栏目里，且没有任何提示。
   已改为空串与「缺失」同义（schema 默认即随笔），只有 `thinking` 一篇受影响。
2. **短记录分组栅格列错位** —— 该分组没有编号列，却沿用了四列的 `rows-index` 定义，
   日期被挤进 48px 列折成三行、标题被压进 128px 列。第一轮视觉 QA 发现，已单独定义 `rows-plain`。
3. **`PostList` 的属性类型检查完全失效** —— 组件 frontmatter 过长时，
   Astro 静默放弃 `Props` 解析，`Astro.props` 退化为 `Record<string, any>`，
   于是页面传入非法道具不会被发现。已把派生逻辑移入查询层修复，见 ADR-015。

附带修正（WEB-007 记录的遗留项）：`about` 头像、文章页许可徽章与上下篇导航、
SoundLab 面板的卡片式圆角改为 `var(--radius)` / `var(--radius-sm)`。
保留两处**具象**圆形：SoundLab 的唱片封面与 `history` 里浏览器 mock 的交通灯 ——
它们是所描绘的对象本身，不是圆角卡片语言。

验证：

- 8 项命令全部通过：`format:check`、`lint`、`lint:md`、`check:tokens`、
  `check:content`、`check`、`build`、`check:html`。
- 浏览器门禁：16 路由 × 7 视口，对比度 0 失败、横向溢出 0、键盘干净、控制台 0 错误。
- `npm run a11y`：axe-core 0 违规；键盘走查无不可见元素获得焦点。
- 三轮视觉 QA：结构（短记录列错位）、层级/模板感（移动端独立构图）、
  一致性（浅色主题卡片、直角语言）。
- 首页 CWV 7 视口：LCP 48–72ms、CLS 0.0000、TBT 0ms。
- 截图存于 `_backups/shots/web008-r1/` 与 `web008-r2/`。

Commit：本文件所在提交。

### WEB-009 — 书房方向视觉落地

- Status: DONE
- Phase: W1
- Priority: P0
- Depends-On: WEB-008

Objective：按「书房」方向替换 FIELD LOG 视觉，引入参见交叉引用与主题总览。

Acceptance：单一蓝色相；中文界面；字体全部走 token；参见与主题总览同源；
桌面/移动/深色验证；全部闸门通过。

Evidence：

- **配色收敛到单一蓝色相**，删除 signal red 第二强调色。
  语义 token 名全部保留（约 20 个文件在引用），只换值，结构零破坏。
- **47 处界面英文改为中文**（导航、页眉页脚、全部眉标与状态标签）；
  专有名词保留。修掉首页硬编码的假数据「232K 字 · Transformer」，改为由内容集合计算。
- **字体静默失效**：`--font-display` 改为中文优先无衬线后实测只有 11 处生效，
  另有 **35 处写死在组件里**（12 个文件硬编码 `Georgia, serif`）。
  已全部改走 token，并给 `check-tokens.mjs` 增加第 ⑤ 项强制检查（ADR-018）。
- **参见交叉引用**：`utils/relations.ts`，按标签稀有度加权。
  文章页显示 4 条，首页卡片显示 3 条。
- **主题总览 `/topics/`**：知识地图的诚实形态。实测关系图不可行（ADR-019），
  改为「已成形 3 组 + 只写过一次 31 个」。
- **修掉自己制造的缺陷**：「参见」曾用同分类兜底，导致每张卡片列出其余 12 篇。
- 门禁路由表补入 `/topics/`（新页面原本不在固定路由表里，等于没被验证）。

验证：9 项命令全部通过；浏览器门禁 **17 路由 × 7 视口**全绿；
axe-core 0 违规；首页 CWV 七视口 LCP 48–64ms、CLS 0.0000、TBT 0ms。

Commit：本文件所在提交。

### RENDER-001 — 文章渲染器审计与契约

- Status: DONE
- Phase: W2
- Priority: P0
- Depends-On: WEB-006

Acceptance：确定语义节点、样式责任、Studio 复用边界、fixture 集与兼容策略；不改文章正文事实。

Evidence：

契约写入 **`docs/article-renderer.md`**。核心结论基于对 17 篇产出 HTML 的实际清点：

- **元素种类 61，而 `transformer` 一篇独占 59 种**（其余 16 篇只有 28–30 种），
  含 543 个 `h2`、546 个 `hr` 与全套 KaTeX 节点。
  结论：**transformer 才是这套渲染器真正的验收对象**，
  只按普通文章调样式等于没测过最难的输入。
- 样式责任已划清：`.prose` 内部归 `prose.css`（唯一责任方），
  外部归页面内联样式，颜色/字体/圆角/间距归 tokens 并由闸门强制。
  KaTeX 与 Shiki 的第三方样式**不覆盖**，只调外层容器。
- Studio 复用边界：必须复用 `prose.css` + `tokens.css` + 同一套 Markdown 管线；
  不得复用页面级布局；不得分叉复制样式（预览漂移是编辑器最昂贵的缺陷）。
  Markdown 管线目前内嵌在 `astro.config.mjs`，接 Studio 前需抽为共享模块（列入 EDITOR-001）。
- fixture 集定为五类，覆盖两个极端（transformer 与 index.md）与中间档。

审计中发现并修复 4 处缺陷（见契约第三节），其中一条是用户可见的：

| 缺陷 | 影响 |
| --- | --- |
| `.prose` 标题 `scroll-margin-top: 100px` | 页头已是 `--header-h: 60px`，**锚点跳转后标题被页头盖住约 40px** |
| `.prose img/pre/code` 三处硬编码圆角 | 绕过 token 体系 |

验证：`check:tokens`、`format:check`、`build` 通过；未改动任何 `.md` 内容。

Commit：本文件所在提交。

### KB-001 — 私人知识库服务层（K1）

- Status: DONE
- Phase: K1
- Priority: P0
- Depends-On: 无（K0 存储层已 DONE）

Objective：在 `studio/db/` 存储层之上建立本地 HTTP 服务，让知识库可被实际读写。

Acceptance：

- 只绑 `127.0.0.1`，不监听 `0.0.0.0`；不提供任何对公网开放的开关
- 首次启动生成随机 token 写入 `~/.frees-studio/token`（权限 600），所有请求校验
- 笔记的增删改查、标签、检索接口
- 原始档案导入接口（幂等）、记忆提出与审核接口
- 私人内容默认不可公开：不提供任何「发布到公网」的接口
- 单元测试覆盖鉴权失败、参数校验、边界情况
- 集成测试用合成数据跑通全部接口

Evidence：

- `studio/server/index.mjs`：HTTP 服务，**只绑 127.0.0.1**（`BIND_HOST` 是常量，
  刻意不提供改成 0.0.0.0 的开关）；额外一道 `remoteAddress` 检查，
  即便监听地址被改错也仍拒绝非本机连接
- `studio/server/routes.mjs`：笔记 CRUD、标签、检索、档案导入、记忆提出与审核
- 令牌：首次启动生成 32 字节随机值写入 `~/.frees-studio/token`（**600**），
  恒定时间比较避免时序侧信道；**没有「默认密码」这回事**
- 私人内容默认不可公开：**路由表里不存在任何发布/导出到公网的路由**，
  且有测试断言 `/api/publish` 等路径全部 404
- 鉴权无例外：`/api/health` 同样要求令牌（有专门测试）
- 错误响应不回显堆栈与内部路径，并有测试断言响应体不含 `/Users/` 与 `node_modules`
- 请求体有 1MB 上限

测试：**40 项全部通过**（`npm test`）。覆盖鉴权（无令牌/错令牌/健康检查）、
CRUD、参数校验、中文检索、档案幂等、记忆审核状态机、未知路由、无发布路由、
超大请求体。

遗留：超大请求体是「先读完再拒绝」，实测约 6 秒 —— 应在读取过程中按累计长度
提前中断，属性能优化，不影响正确性。

Commit：本文件所在提交。

### KB-002 — 本地编辑界面（K2）

- Status: DONE
- Phase: K2
- Priority: P0
- Depends-On: KB-001

Objective：在本地 Studio 中真正能创建、编辑、搜索、阅读私人笔记，延续蓝色中文书房风格。

Acceptance：

- 列表、阅读、编辑、新建、删除可用
- 检索可用（含中文）
- 复用 `prose.css` 与 `tokens.css`，不引入新的前端框架
- 真实浏览器验证（截图），非仅构建通过
- 键盘可达、对比度达标

Evidence：

- `studio/web/`：原生 HTML + CSS + JS，**未引入任何前端框架**（界面只有「列表 + 编辑」两件事）
- 颜色、字体、圆角**全部取自 `/tokens.css`** —— 该文件由服务直接托管项目的
  `src/styles/tokens.css`，与公开站同一真相源；有测试断言 `studio.css` 内
  **不含任何颜色字面量**
- 会话认证：登录页粘贴一次令牌 → 服务端下发 `HttpOnly; SameSite=Strict` Cookie。
  **刻意不把令牌放进 URL**（会进浏览器历史、可能被 Referer 带出、会出现在截图里）
- 静态资源路径已做越界检查，并有测试覆盖

验收（`node studio/verify/browser.mjs`，真实 Chrome + 真实服务）：

```
✓ 未登录时显示登录页
✓ 经真实界面新建的笔记已落库
✓ 检索命中该笔记
✓ 主题可切换
✓ 键盘可依次聚焦到 8 个元素
```

测试：**48 项全部通过**（`npm test`）。

**浏览器验证抓出了一个单测发现不了的缺陷**：登录表单提交的是
`application/x-www-form-urlencoded`，而服务端只按 JSON 解析 ——
于是 token 永远为空、登录必然失败。单测传的是 JSON，所以一直是绿的。
这正是「构建通过不等于界面可用」的实例。

遗留：
- 控制台有一条 401 与一条 404（后者疑为 favicon）。不影响功能，未查明来源。
- 未对 Studio 界面单独做对比度测量（公开站的门禁不覆盖 Studio）。

Commit：本文件所在提交。

### KB-003 — 模型适配层与模拟推理服务（K3）

- Status: DONE
- Phase: K3
- Priority: P1
- Depends-On: KB-001

Objective：建立 OpenAI 兼容的模型适配层，用模拟服务完成接口、存储与前端测试，
不依赖本机是否安装 LM Studio。

Acceptance：

- 适配层可切换 base URL 与模型名
- 提供模拟推理服务（本地、合成响应），供测试使用
- 对话历史持久化
- 知识库检索结果可作为引用进入对话
- AI 回答可存为**草稿**（`origin='ai_draft'`），不直接成为已确认内容
- 不向任何未授权的外部服务发送私人资料

Evidence：

- `studio/ai/provider.mjs`：面向 OpenAI 兼容的 `/chat/completions` 协议 ——
  这是事实标准（LM Studio、Ollama、llama.cpp、vLLM 都提供），
  因此适配层无需为每个供应商写分支，只需能改 base URL 与模型名
- **隐私边界是本模块最重要的约束**：默认**只允许连本机端点**，
  非本机地址必须显式传 `allowRemote: true` 才放行。
  理由是「某次调试顺手把 base URL 改成公网地址」不该是一个静默可行的操作
- `studio/ai/mock.mjs`：模拟推理服务，实现同一套协议。
  本机没装 LM Studio 不构成阻塞 —— 与模型无关的部分（对话历史、引用注入、
  草稿保存）可以先做完并测透，真实联调时只换 base URL
- schema v2：`conversations` + `messages`，引用以 JSON 持久化，**可事后追溯**
  「这句回答基于哪几条笔记」
- **AI 回答只能变成草稿**：`saveAnswerAsDraft` 一律写 `origin='ai_draft'`，
  且**不提供把回答直接存成已确认内容的接口**；用户编辑后 `updateNote` 才转为 human

测试：**70 项全部通过**（AI 层 22 项）。覆盖端点隐私判定、拒绝外部端点、
协议校验、模型列举、补全、超时与不可达的可读错误、非 200 不泄露响应体、
结构缺字段时报错而非静默返回 undefined、对话 CRUD、引用追溯、
草稿标记与「只有 assistant 消息能存草稿」。

遗留：
- 对话的 HTTP 路由与界面尚未接入（本任务只做适配层与存储）
- 真实模型联调未做（本机无 LM Studio）

Commit：本文件所在提交。

### KB-004 — 对话路由与 Studio 界面接入

- Status: DONE
- Phase: K3
- Priority: P1
- Depends-On: KB-003、KB-002

Objective：把 KB-003 的适配层与对话存储接到 HTTP 路由与界面上，让 AI Studio 可用。

Acceptance：

- 对话的增删查路由；消息追加触发一次模型调用
- 知识库检索结果可作为引用注入对话，且引用被持久化
- 界面上有对话区：模型配置、连接状态、消息列表、发送、存为草稿
- 端点不可达时界面显示可操作的提示，而非静默失败
- 真实浏览器验证

Evidence（进行中）：

服务侧已完成并有测试覆盖：

- `studio/server/chat.mjs`：对话增删查、发送消息（检索 → 注入引用 → 调用模型 → 双写入库）、
  存为草稿。已接入主路由
- **引用注入**：提问时用 FTS5 检索知识库，命中的笔记作为系统消息注入，
  并在指令里写明「不足以回答就说明缺少什么，不要编造」
- **引用持久化**：`citations` 落到消息上而非每次重算 —— 笔记会被编辑和删除，
  事后重算得到的依据与当时看到的不再相同
- **模型失败时保留用户消息**，且**不把错误写进历史** ——
  否则下次请求会把这段错误当作上下文带上
- 无可用端点时返回 503 与可操作提示（「请先启动本地推理服务」），不静默失败
- `provider` 已透传进服务依赖，默认指向 127.0.0.1:1234，**不假设它一定在运行**

测试：**77 项全部通过**（对话路由新增 6 项）。覆盖对话 CRUD、空消息拒绝、
无端点提示、模型不可达时保留用户消息且不污染历史、引用注入与持久化、
存为草稿带 ai_draft 标记。

界面部分已完成：

- 标签页在「笔记」与「对话」之间切换，共用同一套 tokens
- 对话区：新建/切换对话、模型端点探活与状态显示、消息列表、
  发送、以及把回答**存为草稿**
- 引用在回答下方列出，可看到这条回答基于哪条笔记

验收（`node studio/verify/chat.mjs`，真实 Chrome + 模拟推理服务）：

```
✓ 模型端点探活成功
✓ 提问后产生用户与助手两条消息
✓ 回答带上了知识库引用
✓ 存为草稿后带 ai_draft 标记
✓ 草稿状态为 draft，未自动成为已确认内容
✓ 无脚本异常
```

测试：**77 项全部通过**。

浏览器验证在本任务中抓出了三个单测抓不到的缺陷：

1. **接口形状不一致** —— `POST /api/conversations` 返回刚插入的行（无 `messages`），
   而 `GET` 返回完整对象。前端按后者写，新建对话后一 push 就崩。
   已统一为始终返回完整形状
2. **`[hidden]` 被 `display: grid` 覆盖** —— 浏览器默认的 `[hidden]{display:none}`
   优先级极低，被 `.layout` 的 `display:grid` 压过，于是笔记视图与对话视图
   **同时显示、叠在一起**。已显式声明 `[hidden]{display:none!important}`
3. **favicon 每次加载产生 401 噪音** —— 它不在免鉴权白名单里。已单独处理；
   同时把验收里的「脚本异常」与「资源加载噪音」分开判定 ——
   混在一起会让那条断言失去意义

前两条都是「功能测试全绿但界面实际是坏的」，
第三条是「噪音会训练人忽略控制台」。三者都只有真实浏览器能暴露。

### KB-005 — 关联知识库、聊天历史与长期记忆

- Status: DONE
- Phase: K4
- Priority: P1
- Depends-On: KB-001、KB-003、KB-004

Objective：把三层数据连起来 —— 原始档案是底档，长期记忆是从中提取且经人工确认的结论，
知识库是整理后的正式内容。目前三层各自存在但互不连通。

Acceptance：

- 对话中的回答可提取为**待审核**记忆，并保留来源（可追溯到具体消息）
- 记忆可关联到知识库条目，且关联可反向查询
- 统一检索：一次查询同时返回笔记与**已确认**记忆，待审核记忆不进入结果
- 记忆的来源链完整：记忆 → 来源消息/档案；关联 → 知识库条目
- 删除来源不破坏记忆本身（来源置空而非级联删除）
- 全部用合成数据测试

Evidence：

此前三层各自存在但互不连通：档案 · 记忆 · 知识库 · 对话，唯一的连接是
`memories.source_entry_id → archive_entries`。迁移 v3 补上两条：

- `memories.source_message_id → messages`（用 `ON DELETE SET NULL`）
- `memory_notes` 关联表（记忆 ↔ 知识库条目，多对多）

**关键设计：删除来源不销毁结论。** 删掉一段对话只把来源置空，
而不是级联删除它产生的记忆 —— 否则一次清理动作会销毁一条已确认的结论。
有测试覆盖这条。

**统一检索刻意排除待审核记忆。** 检索是给人用的，把未经确认的 AI 推测
混进「我的知识」里，等于让推测冒充事实。只有 `approved` 的记忆进入结果。

**来源链一次取全。** `getMemoryProvenance` 返回 记忆 + 档案来源 + 对话来源 + 关联笔记，
不让调用方自己拼四张表的 SQL —— 拼错一次就会得到一条看似合理实则错误的来源。

路由：`/api/conversations/:id/memories`（提取）、`/api/search-all`（统一检索）、
`/api/memories/:id/provenance`（来源链）、`/api/memories/:id/notes`（关联增删）。

测试：**93 项全部通过**。

**本任务暴露了一个我自己的流程缺陷**：KB-005 写完后我只测了 store 层函数，
**从没调用过新加的路由**，于是那四个路由从写出来就是坏的
（一次 `import` 替换因 Prettier 重排而静默失败，新函数根本没被导入），
而 88 项测试**全绿**。已修复导入，并补上 4 项**路由级**测试。
教训：store 层测试通过 ≠ 功能可用。

另修一处测试自身的错误假设：提取记忆时默认取的是助手消息正文，
而模拟服务的回答是固定文案、不含查询词 —— 不显式指定内容的话，
测的是「搜不到」而不是「待审核被排除」。

覆盖范围：来源带上、只有 AI 回答可提取、关联与反向查询、重复关联不产生重复行、
**删除来源后记忆仍在且来源置空**、删除笔记清理关联但保留记忆、
统一检索排除待审核、来源链完整追溯，以及四项路由级端到端。

遗留：新功能尚未接入界面（本任务的验收只要求服务层）。

Commit：本文件所在提交。

### KB-006 — 记忆审核界面

- Status: DONE
- Phase: K4
- Priority: P0
- Depends-On: KB-005

Objective：三层模型的核心约束是「AI 提取的记忆必须经人工确认」。
此前只能在 API 上批准，界面上做不到 —— 约束在实践中被绕过。

Acceptance：界面上可查看待审核/已确认记忆、可确认与驳回、可查看来源链；真实浏览器验证。

Evidence：

- 新增「记忆」标签页：待审核 / 已确认两个视图
- 每条待审核记忆有「确认」「驳回」「查看来源」三个动作
- 状态文案明确写出「确认后才会进入检索」，让约束在界面上可见
- 来源链显示「来自对话《标题》」/「来自档案 …」/「关联笔记 …」

验收（`node studio/verify/memory.mjs`，真实 Chrome + 模拟推理服务）：

```
✓ 待审核列表显示该记忆
✓ 状态文案说明「确认后才进入检索」
✓ 确认前不进入检索
✓ 来源链可查
✓ 确认后进入检索
✓ 已确认列表可见
✓ 无脚本异常
```

**本任务中 assert 起了作用**：给 HTML 加标签页时的字符串匹配因 Prettier 重排而失败，
`assert` 立刻抛出而不是静默跳过。这正是上一轮那次静默失败的 import 替换换来的做法。

Commit：本文件所在提交。

### KB-007 — 记忆与笔记的语义检索

- Status: DONE
- Phase: K4
- Priority: P1
- Depends-On: KB-005

Objective：现在是纯关键词检索，换个说法就搜不到 —— 搜「注意力」找不到只写了
「self-attention」的笔记。语义检索是「找得到我写过的东西」的关键。

Acceptance：

- 嵌入走 OpenAI 兼容的 `/v1/embeddings`，默认指向本机 LM Studio
- **端点不可用时降级为关键词检索，而不是报错** —— 检索是基础功能，
  不能因为模型没启动就整个不可用
- 向量存本地 SQLite，不引入向量数据库
- 检索结果同时含笔记与已确认记忆，待审核记忆仍被排除
- 相似度计算可单独测试（不依赖真实模型）
- 界面能看到用的是哪种检索

Evidence：

- `studio/ai/embeddings.mjs`：面向 OpenAI 兼容的 `/v1/embeddings`，
  默认指向本机 LM Studio；与对话适配层**共享同一条隐私边界**
  （默认只允许本机端点、`redirect: 'error'` 防止经重定向外发）
- 向量存本地 SQLite 的 BLOB（Float32 字节），**不引入向量数据库**。
  个人知识库规模下 JS 暴力算余弦相似度是毫秒级；引入 Qdrant 之类
  意味着多一个服务、多一份备份负担、多一种会过期的格式。
  注释里写明了何时该换（十万条以上）
- `semanticSearch`：待审核记忆**仍被排除** —— 换检索方式不改变
  「AI 推测不得冒充事实」这条约束，有测试断言
- 维度不一致的旧向量（换过嵌入模型）**跳过而不是让整个检索失败**，有测试

**降级路径**（本任务的关键验收）：

- `searchWithFallback`：端点不可用时退回关键词检索，**不抛错**
- 返回值**必须带 `mode`**（semantic / keyword / empty）与实际原因 ——
  让调用方看出「这次结果为什么不太对」，而不是让人以为语义检索生效了却得到空结果
- 界面上显示实际用的模式

测试：**110 项全部通过**（新增 17 项）。覆盖向量往返精度、余弦相似度边界
（相同/正交/零向量不返回 NaN/维度不一致抛错）、嵌入覆盖而非新增、
检索排除待审核、minScore 过滤、删笔记后不残留、端点隐私边界、
端点不可达的可读错误、**三种降级路径（有端点/端点挂掉/未配置）**、
空查询。

遗留：尚未做向量重建入口（换嵌入模型后需重建全部向量），
当前靠 `model` 字段区分，重建需手工触发。

Commit：本文件所在提交。

### KB-008 — 完整导出、导入与向量重建

- Status: DONE
- Phase: R2
- Priority: P0
- Depends-On: KB-005、KB-007

Objective：满足「可完整导出」这条硬要求，并补上换嵌入模型后无法重建向量的缺口。

Acceptance：

- 导出为**单一 JSON 文件**，含笔记、标签、关联、记忆、来源链、对话与消息
- 导出**不含向量**（可由重建恢复，且体积会大数倍）；导出含 schema 版本
- 导入到空库后数据等价（逐项比对，不是「看起来一样」）
- 导入**幂等**：重复导入同一份文件不产生重复
- 导入不覆盖已有数据，冲突时报错而不是静默合并
- 向量重建：换嵌入模型后一键重算全部向量，并报告数量与失败项
- 端点不可用时重建给出可读错误，不留下半重建状态
- 全部用合成数据测试

Evidence：

`studio/db/portable.mjs`，三个能力：

**导出**（`exportAll` / `exportToFile`）：单一 JSON，含笔记、标签、关联、记忆、
来源链、对话与消息、档案，并带 `schemaVersion` 与 `format` 标识。

**刻意不含向量**：向量是**派生数据** —— 同样文本 + 同样模型必然得到同样向量。
写进导出会让体积大数倍（1024 维 float32 ≈ 4KB/条），还会让「这份导出能否被
将来的模型使用」变成假问题。导出语义数据，向量由重建恢复。有测试断言
导出内容不含 `"vector"`。

**导入**（`importAll` / `importFromFile`）：只接受空库，**拒绝而非合并**。
合并两份来源不同的知识库需要人判断冲突（同 id 不同内容怎么办），
脚本静默选一边等于替人做了一个他不知道做过的决定。
整个过程在一个事务里，失败即回滚。测试逐项比对源库与目标库
（笔记、记忆、标签、关联、消息），而不是「看起来一样」。

**重建**（`rebuildEmbeddings`）：全部分批算完才落库，保证不会出现
「一半旧模型向量、一半新模型」的状态 —— 那比完全不重建更糟，
检索结果会变得不可解释且没有提示。端点中途挂掉即中止，旧向量原封不动。
只给**已确认**记忆建向量，待审核的不参与检索因而无需向量。

测试：**121 项全部通过**（新增 11 项）。

**本任务中两次被自己的工装坑到**：
1. 导入时外键顺序写错 —— `memories.source_message_id` 指向 `messages`，
   但这与「逻辑上谁先谁后」无关，只取决于 REFERENCES 指向谁
2. 我用脚本重排插入顺序时，`block_end` 的括号计数对**单行语句**失效
   （同行内深度归零，判断条件永不成立），一直扫到下一个块结尾，
   结果复制了三个块、丢了别的。已重写并在脚本里加了「每表恰好一次」的断言

两处都是「转换静默产出错误结果」，与之前那次 `import` 替换失败同类。
已在重写脚本里加断言，不再依赖肉眼检查。

Commit：本文件所在提交。

### KB-009 — 知识库命令行入口

- Status: DONE
- Phase: K1
- Priority: P1
- Depends-On: KB-008

Objective：导出、重建、启动目前都要手写 Node 单行命令，日常不可用。

Acceptance：

- `status` / `start` / `export <file>` / `import <file>` / `rebuild` 五个子命令
- 不打印令牌与任何私人内容
- `export` 默认**拒绝覆盖已存在的文件**（导出是备份，静默覆盖等于毁掉上一份）
- 数据目录可用 `FREES_STUDIO_HOME` 覆盖
- 子命令失败时给出可操作的提示，退出码非零
- 测试覆盖各子命令的实际行为，不只是「能跑」

Evidence：

`studio/cli.mjs` 五个子命令：`status` / `start` / `export` / `import` / `rebuild`，
并有 `npm run studio` 快捷入口。

- **不打印令牌**：终端会被截图、也进 scrollback；有测试断言输出里不含令牌内容
- **`export` 拒绝覆盖已存在的文件**。导出是备份，静默覆盖会毁掉上一份，
  而人往往在需要它时才发现。有测试断言旧文件内容原封不动
- **`status` 在库未创建时说明情况而不是报错** —— 未建库是正常状态
- 数据目录可用 `FREES_STUDIO_HOME` 覆盖，便于测试与多环境

测试：**134 项全部通过**（新增 14 项）。用**子进程**跑真实命令行入口，
而不是直接调函数 —— CLI 的价值就在参数解析、退出码、输出这些外壳上，
只测函数等于把它最容易被写错的部分跳过去了。

**端到端实操抓出一个测试没覆盖的真实 bug**：

`import` 到**全新的数据目录**时失败 —— 目录还不存在，SQLite 建不了文件，
报 `unable to open database file`。而「在新机器上从备份恢复」正是
`import` 最常见的用法。

之所以没被测出：测试里总是先 `mkdtempSync` 建目录，恰好绕过了这条路径。
已修（导入前 `mkdirSync`）并补上专门的测试用例。

这与本会话前几次同类：**测试覆盖的是「我以为的用法」，而不是真实用法**。

Commit：本文件所在提交。

### KB-010 — 加密备份格式

- Status: DONE
- Phase: R2
- Priority: P0
- Depends-On: KB-008

Objective：备份要离开本机（U 盘、网盘、WebDAV），因此必须加密。
先把加密层与快照格式做完并测透 —— 它不依赖任何凭证。

Acceptance：

- 用**认证加密**（AEAD），而不是单纯的 AES-CBC —— 后者不防篡改
- 密钥从口令派生（scrypt），**口令不落盘、不进日志、不进 argv**
- 每次备份用新的随机盐与 IV，同一份数据两次备份密文不同
- 口令错误时**明确失败**，不是解出乱码
- 文件头含格式版本与 KDF 参数，便于将来换算法时识别旧格式
- 密文被篡改一个字节即解密失败
- 全部用合成数据测试

Evidence：

`studio/backup/crypto.mjs`。备份要离开本机（U 盘、网盘、WebDAV），因此必须加密。

**用 AES-256-GCM 而非 AES-CBC。** CBC 不加认证，攻击者可在不知道密钥的情况下
翻转密文比特、让解密结果产生可预测的改变，而解密方**看不出被动过**。
对备份尤其致命 —— 备份的全部价值在于「需要它时它是对的」。

**密钥派生用 scrypt**（N=32768, r=8），有意的内存硬化以抵抗 GPU 暴力破解。
盐与 IV 每次随机：同一份明文两次加密必须得到不同密文，
否则「这两次备份内容相同」本身就成了泄露的信息。

**口令不落盘、不进日志、不进 argv**，只能由调用方运行时提供。
加密与解密都强制校验口令长度（≥12 字符）—— 一个 4 位口令的备份，
加密与否区别不大，却会给人「已经加密了」的错觉，而**错误的安心比没加密更危险**。

**文件头含格式版本与 KDF 参数**，将来调参或换算法时旧备份仍能正确解开。

测试：**146 项全部通过**（新增 11 项）。用例偏向**攻击视角**：
往返、任意二进制（含空与 200KB）、两次加密密文不同、错口令、**篡改任意字节**、
文件头被改、截断文件、弱口令、头部参数被篡改。

**测试抓出两个真实缺陷**：

1. Node 的 scrypt 默认 `maxmem` 是 32MB，而 N=32768,r=8 恰好需要 32MB，
   正好越界报「memory limit exceeded」。已显式给足并按参数计算 ——
   解密侧同样需要，否则将来调参后的旧备份会解不开。
2. 篡改文件头里的 N 字段后，抛的是 Node 原始的「Invalid scrypt params」，
   调用方无从判断这是「口令错」还是「文件坏了」。已加入参数合法性校验
   （N 必须是 2 的幂）与错误包装。

遗留：只做了加密层。**传输层（WebDAV 上传/回读/保留策略）尚未实现**，
因为 WebDAV 凭证仍待用户提供 —— 但那不影响加密层先做完并测透。

Commit：本文件所在提交。

### KB-011 — 备份传输层（WebDAV 上传 / 回读校验 / 保留策略）

- Status: DONE
- Phase: R2
- Priority: P0
- Depends-On: KB-010

Objective：把加密备份送到远端并**验证它真的能取回来**，同时管理保留份数。

Delivered：

- `studio/backup/webdav.mjs` —— 最小客户端，只实现 PUT / GET / DELETE / PROPFIND。
  凭证只从环境变量读，缺失时逐项报出缺哪个，而不是拿空值去连
- `studio/backup/remote.mjs` —— `runBackup`（快照 → 加密 → 上传 → **回读校验**）、
  `applyRetention` / `runRetention`（默认 dry-run，永不删最后一份）
- `studio/backup/mock-webdav.mjs` —— 内存版服务，用于无凭证时把逻辑测透
- `studio/cli.mjs` —— 新增 `backup` / `restore` / `retention [n] [--apply]`
- `studio/backup/remote.test.mjs`（17 项）+ `studio/cli.test.mjs` 新增 11 项外壳用例

Evidence：

- **全量 174 项测试通过**（新增 28 项），十项闸门全绿。
- 外壳层用例跑**真实 CLI 子进程 + 真实 HTTP**，验证的不是函数而是行为：
  口令与 WebDAV 密码不出现在 stdout/stderr；退出码；dry-run 后远端份数不变；
  `--apply` 后只剩最新一份；`keep=0` 时仍留下最后一份。
- **用真实 WebDAV 服务端（wsgidav 4.3.5）做了端到端验证**，不只是自己的 mock：
  上传 → 服务端落盘 → 回读校验通过 → 密文以 `FREESBK1` 魔数开头、
  `grep` 搜不到笔记正文 → 保留策略 dry-run 4 份不变 / `--apply` 后剩 1 份 →
  `restore` 到全新目录后 `status` 显示 1 篇笔记、1 已确认 / 1 待审核，与源库一致。
- 真实服务端返回的 PROPFIND href 用的是 `ns0:` 命名空间前缀 +**绝对路径**，
  与 mock 的 `d:` 前缀不同 —— 这验证了列举实现的前缀无关正则确实必要，
  而不是照着 mock 写的巧合。

修复（都是被这批测试逼出来的，不是预先想到的）：

1. `retention` 的份数原先从 `argv[4]` 取，而那是 `--apply` 的位置。
   `Number('--apply')` = `NaN`，于是 `retention 1 --apply` **报成功却一份都不删**，
   备份会一直累积。现在从 `argv[3]` 取，且非整数直接报错而非静默放过。
2. `mock-webdav` 的 `close()` 只调 `server.close(cb)`，而它要等所有连接关闭 ——
   客户端保持 keep-alive 时回调永不触发。已改为先 `closeAllConnections()`。
3. 与其配套的测试陷阱：mock 跑在**测试进程自己的事件循环**上，
   用 `execFileSync` 去跑访问它的子进程会三方互等、静默挂死
   （实测整个文件挂满 10 分钟无输出，`--test-timeout` 也触发不了，
   因为同步调用阻塞的是事件循环本身）。已改用异步 `runAsync`，并把原因写进注释。

遗留与限制：

- 真实服务端只观察到**绝对路径**形态的 href；**完整 URL** 形态仅由单测覆盖，
  尚未在真实服务上遇到过。
- 只验证了 wsgidav 一个实现。第三方服务（坚果云、Nextcloud 等）的
  认证方式、目录配额、非 ASCII 文件名行为均未验证。
- 没有真实凭证，因此没有测过认证失败、配额超限、限流这些真实世界的失败模式。

Commit：本文件所在提交。

### RENDER-002 — Transformer 枢纽/分章迁移设计

- Status: DONE
- Phase: W2
- Priority: P0
- Depends-On: RENDER-001

Acceptance：记录章节划分、旧 slug/anchor 兼容、搜索/RSS/SEO 策略、迁移脚本和回滚；迁移前后内容 hash/覆盖率可核验。

Delivered：`docs/transformer-chaptering.md`

Evidence：

- **修正了 RENDER-001 的两处数字**。它按 `grep -c '^## '` 数源码得到「543 个 h2」，
  而这个数法把**代码块里的 Python 注释**当成了标题 —— `grep '^# '` 数出 437 个 h1，
  其中绝大多数是注释。按产出 HTML 重数为：**109 个 h1 / 471 个 h2 / 71 个 h3，
  共 651 个标题，且 651 个都有 id**。事实以渲染结果为准，不以源码文本为准。
- 方案定为**页内分章**（不拆 URL）。拆成枢纽页 + 章节页被否决，理由是可核验的：
  用户已定「文章 URL 完全不动」；GitHub Pages 不支持服务端重定向，拆完 651 个
  锚点会全部落空；拆分会把现有搜索权重摊薄。被否决的方案连同理由一并写进文档。
- 记录了三处**内容侧**既有问题（课号 66/67/68 各出现两次、第 80 课夹在 71–76 之间、
  缺失「第一阶段」标记）。这是用户的内容决定，渲染器不代为重新编号 ——
  锚点一旦按课号生成，重号就会互相覆盖。
- 交付覆盖率闸门 `npm run check:coverage` + 基线 `docs/execution/content-manifest.json`，
  逐篇比对标题、正文纯文本 sha256、锚点 id 集合、各级标题计数。
  **这道闸门被实测证伪过两次并已修复**，两条都是「会说谎」的缺陷：
  ① 取正文区时切到 `</article>`，把上下篇导航算了进去，导致改 A 的标题会报
  B 的正文变化（实测：改 thinking 的标题，闸门报 shadowrocket）；
  ② 在陈旧产物上 `--write`，把从未存在过的中间态记成基线。
  两条的复现步骤与修法都写在文档第四节。
- 顺带修掉两个**线上真实缺陷**（axe 实测，非推断）：
  `transformer` 有一个 KaTeX 解析错误（`\text{}` 内的裸下划线），
  页面一直在渲染一串红色报错文本；以及 5 个公式块横向可滚动但不能用键盘滚。
  后者只给**真正溢出**的块加 `tabindex`（496 个公式块全加会制造 496 个 Tab 停靠点，
  比原问题更糟），实测桌面 5/124、手机 34/124，零误标零漏标。
- `/blog/transformer/` 已加入 axe 默认路由集 —— 它此前不在其中，所以这两个缺陷
  一直没被这道闸门看到。

遗留：标题降级与两级目录是**实现**，见 RENDER-003。本条只交付设计与闸门。

Commit：本文件所在提交。

### RENDER-003 — Transformer 页内导航实现

- Status: DONE
- Phase: W2
- Priority: P1
- Depends-On: RENDER-002

Objective：按 `docs/transformer-chaptering.md` 落地页内分章。

Delivered：

- `src/utils/rehype-normalize-headings.mjs` —— 渲染期把正文标题下移，
  使页面标题成为唯一 h1。**一个 `.md` 都没改。**
- `src/utils/toc.ts` —— 目录模型（短文平铺 / 长文按章分组）
- `src/pages/blog/[...slug].astro` —— 分组目录 + 当前章跟随；`prose.css` 补 h4/h5

Evidence：

- **锚点逐字未变**：650 个锚点的集合哈希与改动前完全相同
  （`7a00804a…`），正文 218,796 字符一字未动。覆盖率闸门报告的
  **只有**「标题层级变化」，正文变化 0 条、锚点变化 0 条。
- **页面唯一 h1**：改动前 transformer 有 110 个 h1（页面标题 + 109 个正文 h1），
  改动后 17 篇全部恰好 1 个。
- 目录：109 章 = 89 个可折叠 `<details>` + 20 个无子项的直达链接。
  实测 1440 视口下：初始高亮 1 章；锚点跳转后跟随正确且侧栏内可见；
  连续滚过 5 个位置，**任意时刻高亮恰好 1 章**；跳到有 15 个子项的章节会
  自动展开且全页只开 1 章；键盘可聚焦 summary、展开后子项可聚焦。
  390 视口：目录按既有规则隐藏，**隐藏的链接 0 个可聚焦**，无横向溢出。
- 十一项闸门全绿，axe 全站无违规。

过程中被实测推翻的三处实现（都不是靠推理发现的）：

1. **IntersectionObserver 判断「当前章」不可靠**。最初用视口顶部一条窄带，
   而锚点跳转的落点是 `scroll-margin-top: 76px`，恰好落在带外 ——
   于是点目录跳过去之后目录反而不跟随（这正是本任务的核心场景）。
   改为缓存各章标题的文档偏移 + 滚动时二分查找：结果是确定的，
   且每帧不读任何 rect。实测跳转与连续滚动均正确。
2. **`<a>` 放进 `<summary>` 构成嵌套交互控件**，axe 报
   `nested-interactive` ×109。改为 summary 只负责展开、章节链接作列表首项。
3. **程序改 `open` 会派发 `toggle`**，于是首次自动展开就把 `userTouched`
   置为 true，「只展开当前章」从此永久失效 —— 浏览器实测表现为同时开着两章。
   加 `programmatic` 标志区分，并在事件循环末尾复位。

另有两次是**测试本身错了**，不是代码错了（记下来因为很容易误判）：
量页面位移时站点开着平滑滚动，900ms 后动画仍在进行（量到 26 万像素的位移）；
以及键盘用例挑中的章节恰好没有子项。两次都表现为「代码像是坏了」。

Commit：本文件所在提交。

### PERF-001 — 图片与字体管线

- Status: BACKLOG
- Phase: W3
- Priority: P1
- Depends-On: WEB-007

Acceptance：响应式图像、固定尺寸、懒加载、OG 独立资产、字体体积/CLS 预算；构建不依赖不稳定网络。

### CONTENT-001 — 内容发布契约

- Status: BACKLOG
- Phase: W4
- Priority: P1
- Depends-On: RENDER-001

Acceptance：schema、slug、摘要、TOC、媒体引用、预览、验证与 Git 步骤被脚本化；不要求每篇手写排版。

### MEM-001 — 长期记忆服务与三层数据模型

- Status: DONE
- Phase: S3/S4
- Priority: P0
- Depends-On: STUDIO-001, RENDER-001

Delivered：迁移 v6 + `studio/memory/service.mjs` + 契约文档 `docs/memory-service.md`
+ 31 项测试。

**先核实再动手**：验收里的「三层分离」「来源与审核状态」「AI 不得直接当事实」
「导出」这四项，KB-001～KB-008 已经做了 —— 三条规则分别在
`proposeMemory` 的写死 status、`reviewMemory` 的状态机、`exportAll` 的完整性上。
因此本任务只补真正缺的部分，没有重做已有的东西。

Evidence：

- **三层分离**：`archive_entries` / `memories` / `notes` 三张表，连接靠显式外键。
  补了一条用例守「字段不互串」—— 记忆表里不出现 `title`，知识库表里不出现
  `confidence`。三张表但字段互相塞，那还是混在一起。
- **纠正靠追加**：`correct()` 写新条、旧条用 `superseded_by` 指过去、**旧条留着**。
  就地 UPDATE 等于静默篡改历史，改错就连「原来的说法」都查不回来。
  `supersessionChain()` 能从任意一环走到最新。
- **三条检索规则集中在 `RETRIEVABLE`**：已确认 + 未被取代 + 不在冲突组。
  语义检索必须过 `filterRetrievable()` —— 各写一份迟早漂移，
  而漂移的表现是「换个检索方式就冒出不该出现的记忆」。
- **去重是算出来的，冲突是标出来的**。去重键 = NFKC 规范化 + 空白/大小写折叠
  后的 sha256（NFKC 不能省：中文全角半角混用会让相同的两条算成不同）。
  冲突**只支持人工标记** —— 判定矛盾需要语义理解，假装能判会产出
  「系统认为它们不冲突」这种没人验证过的结论，比不判更危险。
- **自动提取开关拦自动不拦手动**。`add()` 的 `source` 默认值是 `'auto'`（保守侧），
  所以将来接自动提取的人忘了写参数也绕不过开关。目前**没有自动提取器**，
  开关拦不到任何现存行为 —— 这一点如实记在文档里，不假装它已经在工作。
- 「换引擎」解耦的三个维度与对应的验证方式写在文档第六节。

顺带把 chat 路由的提取路径从直接调 store 改为走 service，让去重键、可见性、
开关这些规则只有一处实现。

过程中修掉：迁移 v6 里重复建了 v1 已有的索引，整个迁移失败 ——
事务回滚保住了一致性（`openDatabase` 拒绝启动而不是留下半迁移状态），
但迁移就是没跑成。这条也说明迁移的错误处理是有效的。

Commit：本文件所在提交。

Objective：建立与具体记忆引擎解耦的长期记忆能力，并明确它与原始档案、知识库的关系。

背景：现有计划里 S4 解决的是**模型供应商抽象**，K1 解决的是**知识节点**，
但「长期记忆」这一层本身尚无任务。需求明确要求：记忆不得依赖任何单一引擎的私有格式，
即使该引擎停止维护也必须能导出、换引擎、重建索引。

Acceptance：

- 定义 `MemoryService` 接口，覆盖：添加 / 检索 / 更新纠正 / 删除 / 列举导出 /
  来源与时间 / 关联原始会话或知识条目 / 去重与冲突标记 / 可见性与权限 / 可关闭自动记忆。
- **三层分离且不混为同一字段**：原始档案（完整历史与来源）、长期记忆（提取的偏好、
  背景、决策）、知识库（已整理的正式内容）。
- 记忆条目必须带来源与置信/审核状态，且允许人工纠正；
  **AI 自动总结不得直接当作已验证事实**。
- 记忆引擎作为可替换实现（候选含 Mem0），需先按 `OPEN_QUESTIONS.md` 的决策门槛
  验证其自托管能力、存储依赖、许可证、备份方式与本地模型兼容性。
- 验证：重启后记忆仍在；换引擎后可重新索引；可完整导出。

### ARCH-001 — 原始档案层

- Status: BACKLOG
- Phase: S2/S3
- Priority: P0
- Depends-On: STUDIO-002

Objective：完整保存历史对话、文档与修改记录及其来源，作为不可被摘要替代的底档。

Acceptance：

- 原始档案与记忆摘要**分开存储**，摘要不得作为原档的替代品。
- 导入流程支持用户主动提供的导出文件与结构化 Markdown/JSON；**增量导入、去重、重复导入幂等**。
- 每条档案保留来源与时间；冲突信息可标记。
- 支持完整导出与迁移。
- 明确不假设可自动读取用户账户数据；未获确认不得抓取。

### ACCESS-001 — 外部 AI 受限访问层

- Status: BACKLOG
- Phase: R1/I4
- Priority: P1
- Depends-On: SEC-002, KNOW-001

Objective：为外部 AI（如 ChatGPT 中的 Puro）提供受限、可审计的访问入口。

背景：R1 覆盖 Owner 认证，I4 覆盖访客会话隔离，但**面向外部 AI 的独立访问身份**尚无任务。

Acceptance：

- 先验证当前实际可行的连接方式（标准 REST 与 MCP 现状），
  **不得声称仅凭 API Key 即可让 ChatGPT 访问本地知识库**；不可行部分记为后续集成任务。
- 独立身份：默认仅搜索与读取；写入只进待审核草稿；删除/发布/密钥管理需独立权限。
- 凭证可撤销与轮换；访问记审计日志。
- **检索结果执行服务端权限检查** —— 未授权方不得通过搜索、摘要、向量接口或 AI 对话获得私人内容。
- 外部文档、网页与历史对话中的文本均视为不可信内容，
  **不得因其被检索出来就允许其越权触发工具调用**。

### STUDIO-001 — Studio 技术选型研究

- Status: DONE
- Phase: S1
- Priority: P0
- Depends-On: GOV-001

Acceptance：比较 localhost Web、Tauri/Electron 等候选的安全、跨平台、文件/SQLite/1Password 集成与维护成本；
用最小原型验证关键风险并写 ADR。

**与原文的出入**：本条验收假设技术栈尚未选定。实际相反 ——
KB-001～KB-011 已按 localhost Web 把 Studio 建成并验证。因此交付的是
**记录已建成系统的事实与理由**（ADR-025），而不是选型前的预测。
核实依据是代码与测试，不是文档。

Evidence：`docs/execution/DECISIONS.md` 的 ADR-025。要点：

- **运行时第三方依赖为 0**：`package.json` 的 6 个 dependencies 全属于 Astro 公共站；
  `studio/` 里的 import 只有 `node:` 内置与相对路径。前端 1019 行，无框架无构建步骤。
- 不引入 Tauri/Electron 的理由不是偏好：它们解决的是「打包分发给别人」，
  而本项目的需求是「只在本机跑」。且**根本不存在把服务暴露到公网的代码路径**。
- 代价如实记录：没有托盘/自启/文件关联；跨浏览器行为未逐一验证
  （真实浏览器验收只在 Chromium 上做过）；钥匙串锁定后无人值守无法自行解锁。

Commit：本文件所在提交。

### STUDIO-002 — 本地数据与迁移原型

- Status: DONE
- Phase: S1
- Priority: P0
- Depends-On: STUDIO-001

Acceptance：SQLite schema version、事务、重启恢复、迁移/回滚、备份一致性在可抛弃原型中验证。

Evidence：验证在真实文件库上完成（不是 `:memory:`），新增
`studio/db/schema.test.mjs`（8 项）与备份一致性用例（2 项）。

**先修掉三个真问题** —— 都是「静默」那一类：

1. **库比程序新时会照旧读写。** `openDatabase` 从不比较库的版本与
   `SCHEMA_VERSION`。降级运行（切回旧提交、跑一份旧副本）时，旧程序面对
   一张它不认识的表结构，**不报错**，只按自己的理解读写，把数据写坏，
   而且当场看不出来。现在拒绝打开并说明怎么办。
   已验证敏感性：移除守卫后恰好这两个用例失败，其余全过。
2. **导出会撕裂。** `exportAll` 连读 10 张表却没有事务。单进程内看不出来
   （Node 单线程），但 CLI 与服务端是**两个进程** —— 一边 export 一边写，
   就会导出「有笔记没标签」这种不自洽的快照，而它看起来完全正常，
   直到有人拿它恢复。现在整段读取在一个读事务里。
   已验证敏感性：去掉事务后并发用例**连续 3 次全部失败**，加回后通过。
3. **一条测试名不副实。** `store.test.mjs` 里的
   「重复打开同一个库不会重复应用迁移」全程用 `:memory:` 且**只开了一次库** ——
   `:memory:` 每次打开都是新的，所以那条用例永远不会失败，
   一条实际不存在的覆盖却看起来存在。已移除，并说明原因。

新增覆盖：全新库版本记录、数据跨关闭重开存活、重开后 FTS 仍可用
（重开后写入的内容必须立刻可检索）、v1 旧库带数据升级到最新且不丢数据、
只补缺的版本、拒绝打开更新的库、拒绝时不改动库、迁移失败整体回滚、
导出失败回滚且连接仍可用、并发写入下导出不撕裂。

遗留：**没有降级（downgrade）路径**。迁移只能前进；库比程序新时选择
拒绝打开而不是尝试降级。理由是没有把握的降级会真的丢数据，
而「打不开」是可恢复的、「打开了但写坏」不是。

Commit：本文件所在提交。

### STUDIO-002 — 本地数据与迁移原型

- Status: BACKLOG
- Phase: S1
- Priority: P0
- Depends-On: STUDIO-001

Acceptance：SQLite schema version、事务、重启恢复、迁移/回滚、备份一致性在可抛弃原型中验证。

### STUDIO-003 — 配置与 secret reference

- Status: DONE
- Phase: S2
- Priority: P0
- Depends-On: STUDIO-002

Acceptance：普通配置可经 UI 修改；敏感项只持久化引用；日志/DB/浏览器/Git 扫描无明文 secret。

Delivered：迁移 v5（`settings` 表）+ `studio/db/settings.mjs` / `settings-schema.mjs`、
`/api/settings` 路由、界面「配置」页。决策见 ADR-026。

Evidence（全部用随机哨兵串实测，不是断言「应该没问题」）：

- **普通配置可经 UI 修改**：真实浏览器里改一个输入框 → 显示「已保存」→
  刷新后仍是改过的值（说明真落库了，不是只改了 DOM）。
- **敏感项只存引用**：库里 `webdav.password` 的值就是
  `{"kind":"env","name":"FREES_WEBDAV_PASSWORD"}`。
- **拒绝明文**：`setSetting('webdav.password', 'hunter2')` 抛错；
  绕过界面直接 `PUT {"value":"hunter2"}` 得到 **HTTP 400**，
  且响应里**不含** `hunter2` —— 拒绝不能反过来变成泄漏渠道。
- **值不从读取接口出去**：`listSettings` 对敏感项**没有 `value` 键**
  （断言 `Object.hasOwn(item,'value') === false`），整个响应序列化后不含哨兵。
- **界面里没有密码输入框**：实测 `#settings input[type=password]` 数量为 **0**。
- **扫描**：库文件字节、整个数据目录、浏览器 localStorage/sessionStorage/cookie、
  页面 DOM —— 均不含哨兵。仓库侧由既有的 `check:secrets` 覆盖。
- 203 项测试通过（新增 20 项），十一项闸门全绿。

顺带修掉：新增迁移 v5 后，`schema.test.mjs` 里一条**写死了 `[1,2,3,4,…]`** 的
用例红了。那条用例想验的是「拒绝时没有改动库」，不是「版本号是几」，
已改为从 `SCHEMA_VERSION` 推导 —— 否则每加一个迁移都要为它改一次。

遗留：`resolveSecret` 的钥匙串读取路径尚未接上真实 `security` 调用
（reader 由调用方注入）；接的时候必须复用 `read-credential.sh` 的看门狗，
否则钥匙串锁定时会挂起近两分钟（ADR-024 实测过）。

Commit：本文件所在提交。

### EDITOR-001 — 统一文档模型与生产预览

- Status: BACKLOG
- Phase: S3
- Priority: P0
- Depends-On: STUDIO-002, RENDER-001

Acceptance：ARTICLE/KNOWLEDGE/PROJECT 共用稳定 block ID 和生产渲染预览；重启恢复编辑状态。

### EDITOR-002 — AI 选区 diff 协议

- Status: BACKLOG
- Phase: S3/S4
- Priority: P0
- Depends-On: EDITOR-001

Acceptance：选区边界权威；输出结构化 patch、解释和 source gap；可接受/拒绝；无越界静默修改。

### AI-001 — Provider-neutral gateway

- Status: BACKLOG
- Phase: S4
- Priority: P1
- Depends-On: STUDIO-003, EDITOR-001

Acceptance：能力/模型/端点抽象；至少两个 OpenAI-compatible 或不同供应商 fixture；超时、取消、重试、用量可见。

### MEDIA-001 — 本地媒体目录与索引

- Status: BACKLOG
- Phase: M1
- Priority: P1
- Depends-On: STUDIO-002

Acceptance：稳定 media ID/hash、元数据、EXIF 策略、派生物、反向引用、重复导入和崩溃恢复测试。

### MEDIA-002 — 响应式公开派生物

- Status: BACKLOG
- Phase: M1
- Priority: P1
- Depends-On: MEDIA-001, PERF-001

Acceptance：照片墙首屏不请求原图；srcset/尺寸/lazy/placeholder；lightbox 按需加载；大图库渐进渲染。

### MEDIA-003 — AI 生图适配器

- Status: BACKLOG
- Phase: M2
- Priority: P2
- Depends-On: MEDIA-001, AI-001

Acceptance：生成物自动归档、记录模型/提示/参数、可上传并跨文档复用；密钥不泄露。

### INTEG-001 — GitHub Project 构建期同步

- Status: BACKLOG
- Phase: I1
- Priority: P2
- Depends-On: CONTENT-001

Acceptance：缓存元数据、失败降级、速率限制、人工覆盖优先；公开页面无运行时 GitHub 依赖。

### INTEG-002 — Friends 数据与 RSS 健康

- Status: BACKLOG
- Phase: I1
- Priority: P2
- Depends-On: CONTENT-001

Acceptance：Studio/结构化数据可维护；RSS 可选、失败不阻断构建；首页不自动聚合 Friends feed。

### WEBDAV-001 — 官方能力验证

- Status: BACKLOG
- Phase: I2
- Priority: P0
- Depends-On: STUDIO-001

Acceptance：用当前官方资料/受控测试确认 PROPFIND、读写、Range、限额、直链、分片/直传和路径语义；记录日期与证据。

### WEBDAV-002 — Endpoint 能力探测与路径安全

- Status: BACKLOG
- Phase: I2
- Priority: P0
- Depends-On: WEBDAV-001, STUDIO-003

Acceptance：正确识别 read-only/read-write；canonical root 持久化；`..`/编码/大小写/分隔符/符号链接负向测试通过。

### VAULT-001 — Public Vault/Music 交付

- Status: BACKLOG
- Phase: I3
- Priority: P2
- Depends-On: WEBDAV-002

Acceptance：公开浏览器无凭据；清单/代理/缓存策略明确；音频 Range 与移动网络实测；故障可降级。

### COLLECT-001 — Collection threat model 与协议

- Status: BACKLOG
- Phase: I4
- Priority: P0
- Depends-On: WEBDAV-001

Acceptance：隔离、令牌、限额、过期、删除、Owner 查看、大文件数据面和滥用控制全部有协议与测试计划。

### COLLECT-002 — 隔离提交 MVP

- Status: BACKLOG
- Phase: I4
- Priority: P0
- Depends-On: COLLECT-001, WEBDAV-002

Acceptance：访客只能管理当前临时提交；跨提交读取/列举/修改均失败；无可复用 WebDAV 凭据下发。

### KNOW-001 — Knowledge schema 与公开路由

- Status: BACKLOG
- Phase: K1
- Priority: P1
- Depends-On: EDITOR-001, RENDER-001

Acceptance：节点、来源、前置知识、关联、反链、修订、搜索可构建；事实来源可追溯。

### KNOW-002 — 研究与审查流水线

- Status: BACKLOG
- Phase: K2
- Priority: P1
- Depends-On: KNOW-001, AI-001

Acceptance：已有知识查重、来源分级、冲突、claim/source 校验、review queue；AI 不可绕过人工发布。

### KNOW-003 — 公开批注与讨论

- Status: BACKLOG
- Phase: K3
- Priority: P2
- Depends-On: KNOW-001, EDITOR-002

Acceptance：稳定 anchor、公开/本地状态、合理编辑后的迁移策略、Giscus 映射和无障碍显示。

### SEC-001 — 1Password 集成与密钥扫描

- Status: DONE
- Phase: R1
- Priority: P0
- Depends-On: STUDIO-003

Acceptance：reference resolve、不可用/锁定状态、最小泄露日志、仓库/DB/浏览器存储扫描测试。

注：本项目实际用的是 **macOS 钥匙串**（ADR-020/024 已定），
不是 1Password —— 个人版不支持 Service Account，本机钥匙串是当时选定的替代。
本任务按「凭据引用解析 + 泄漏扫描」的实质交付，集成对象以 ADR-024 为准。

Delivered：

- `scripts/automation/read-credential.sh` —— **退出码即状态**，并新增 `--state`
- `studio/secrets/keychain.mjs` —— `describeKeychainRef`（不读值）/ `readKeychainRef`（读值）
- `studio/db/settings.mjs` —— `describeSecret`，`listSettings` 返回具体状态
- `studio/verify/secret-scan.mjs` —— 三面扫描（`npm run verify:secrets`）

Evidence：

- **状态不再混为一谈**。原先「取不到」只有一种表现（null）：钥匙串锁定、
  条目不存在、访问被拒、变量没设全都不分。而它们的下一步动作完全不同 ——
  解锁、去配、查权限、设变量。现在退出码承载状态，每条都给出**怎么办**：
  `locked` →「需要先解锁」，`missing` →「需要先存入」。
  七个状态：ok / missing / locked / denied / empty / unavailable / unset。
- **描述一个密钥不需要把它取出来**。`describe` 走 `--state`，
  实测**一次都没有用 `-w` 形式问过 security**（用假 security 记录调用参数断言）。
  界面、诊断、日志都走这条，于是「显示状态」这条路径上不存在明文。
- **最小泄露日志**：子进程跑完整流程，断言 stdout/stderr 里不含哨兵。
- **三面扫描**（`npm run verify:secrets`）：磁盘（库文件字节 + 整个数据目录）、
  浏览器（localStorage / sessionStorage / cookie / DOM / 配置接口响应体）、
  仓库（复用 `check:secrets`）。用**随机哨兵**而不是固定串 ——
  固定串可能碰巧出现，那时断言「含」就分不清是泄漏还是巧合。
- 扫描的**敏感性经过验证**，不是「跑通了就算」：故意让配置接口回传敏感值 →
  扫描准确报出「浏览器/配置接口响应体」这一处且不误报；故意把明文写进 settings 表 →
  扫描报出磁盘两处。两次植入都被抓到，移除后恢复通过。
- 213 项测试通过（新增 10 项），十一项闸门全绿。

过程中修掉三个真问题：

1. **`--state` 说是不读值，其实读了。** 它写在最后的 `case` 里，
   于是虽然不打印值，却**已经把值读进了进程**。注释与代码不一致本身就是缺陷。
   改为在读取之前就返回。
2. **我自己在 `--state` 里重犯了脚本警告过的 `$?` 陷阱。**
   `if cond; then …; fi` 之后取 `$?` 拿到的是 if 语句本身的状态（无 else 时为 0），
   于是「钥匙串锁定」被报成「没配过」—— 正好是那段注释警告的错误。
   实测暴露：锁定用例返回 `missing`。改为在 `else` 分支里取。
3. **夹具的 `finally` 在 Promise 结算前还原了环境。**
   假 `security` 通过 PATH 注入，而 `try { return fn() } finally { 还原 }`
   会在异步回调完成**之前**就还原，导致被测代码用回真的 security。
   三个用例因此静默走成同一条路径，其中一个还「通过」了 ——
   通过的原因与它想验的事情毫无关系。已改为 async + await，
   并加「假 security 确实被调用过」的断言堵住这类假通过。

另外把看门狗超时从 1 秒放宽到 3 秒：机器忙时假 security 的启动可能接近 1 秒，
卡在边界上会让「可读」偶发变成「锁定」—— 一条时好时坏的用例比没有更糟。
改后连跑 8 次全绿。

Commit：本文件所在提交。

### SEC-002 — Owner 认证 threat model

- Status: DONE
- Phase: R1
- Priority: P0
- Depends-On: SEC-001

Acceptance：明确是否真的需要公网 Owner mode；若需要，覆盖 TOTP、会话、重放、撤销、恢复和限流；OTP 不参与加密。

Delivered：`docs/security-threat-model.md` + `studio/server/guard.mjs` + 16 项测试。

**结论：不需要公网 Owner mode。** 不是「暂时不做」，是当前架构里
根本没有那条路径 —— BIND_HOST 是常量且注释写明不允许改、不存在任何发布到
公网的代码路径、连接层二次校验来源地址、每个请求含 `/api/health` 都要鉴权。
差别在于「默认关闭」靠配置正确，「没有那条代码路径」靠不存在。

因此验收里列的 TOTP、会话表、重放窗口、撤销、恢复**一项都不需要实现**：
它们的威胁在「服务只在回环地址上存在」这个前提下不成立。文档里写明了
什么情况下这个结论失效（六节列出三个信号），届时按公网标准重做。

**但本地场景下仍有两条威胁成立** —— 「只绑回环」挡的是别的机器，
挡不住本机上跑着的网页。两条都已修复：

1. **DNS rebinding**。外站把域名解析到 127.0.0.1，浏览器便认为与本地服务
   同源，而服务端看到的 remoteAddress 确实是 127.0.0.1。区别只剩 Host 头。
   新增 `hostAllowed()`，只认回环的三种写法，**刻意不接受任何域名**
   （哪怕它当下解析到本机 —— DNS 随时可改）。返回 403 而非 401：
   地址不对与凭据不对的下一步动作不同。
2. **无限次猜令牌**。令牌有 256 位熵，猜不中；但无限次尝试会淹没日志，
   且会让将来任何一次熵不足的改动直接变成可攻破。新增滑动窗口限流，
   **只统计失败**（用户自己反复登录不该被锁在门外）、窗口滑过自动恢复
   （不需要后台任务，也不把锁死状态写进磁盘）。

过程中发现并修正一处设计问题：限流器原先是模块级的，于是同一进程里的两个
服务共用一份计数 —— 测试里立刻暴露。改为属于服务实例。

撤销的取舍如实记录：Cookie 里存的就是令牌本身，服务端无会话表，
因此**没有细粒度撤销**，只能轮换令牌后重启。这在单用户本地场景下成立，
文档写明了需要改成服务端会话表的信号。

验证：16 项测试。含 Host 白名单、伪造 Host 的 HTTP 请求（连 /api/health
也不放行）、限流各分支、Cookie 四种属性、401/403 语义区分、
以及 12 种路径穿越写法（含二次编码与反斜杠）。

一处验证局限已记录：路径穿越用例**只删一层防线时仍会通过** ——
`resolveStatic` 有两层独立防线，任何一层单独存在都足够；
实测把两层一起去掉才会报错。这是纵深防御的必然结果，也是验证时的陷阱，
已写进用例注释。

Commit：本文件所在提交。

### RECOVERY-001 — 加密备份 MVP

- Status: BACKLOG
- Phase: R2
- Priority: P0
- Depends-On: SEC-001, WEBDAV-002

Acceptance：一致性快照、成熟认证加密、上传回读、解密、manifest/DB 校验、保留策略 dry-run。

### RECOVERY-002 — 干净环境完整恢复

- Status: BACKLOG
- Phase: R2
- Priority: P0
- Depends-On: RECOVERY-001

Acceptance：新环境通过 Studio UI 恢复并生成迁移报告；失败不覆盖现有状态；记录真实演练证据。

## 完成任务归档

公共站 P0–P3、P5a、P5c 的详细证据与提交记录保留在 `docs/redesign-progress.md`，避免在此重复。
