# Architecture Decision Record

本文件只记录会影响后续多项任务的决定。新决定采用下一个编号，不改写历史；被替代时标记 Superseded。

## ADR-001 — 保留 Astro 静态公共站

- Status: Accepted
- Date: 2026-09-16
- Decision: 公共展示继续采用现有 Astro 静态站，动态管理能力放入本地 Studio/受控 API。
- Reason: 现有 SEO、RSS、搜索、内容和零/低 JS 基线良好；管理能力不应扩大公开攻击面。

## ADR-002 — Studio 采用 local-first 边界

- Status: Accepted direction; implementation choice pending
- Decision: 草稿、编辑状态、研究任务和普通配置在本地持久化；Studio 不作为开放公共后台。
- Reason: 隐私、离线、文件/Git 集成和灾备目标要求本地权威。

## ADR-003 — Blog 与 Knowledge 共用文档核心和渲染器

- Status: Accepted
- Decision: 使用可区分文档类型的统一编辑模型、稳定 block ID 和生产渲染器。
- Reason: 避免两套编辑器、预览漂移和无法复用的 AI/媒体能力。

## ADR-004 — 1Password 是 secret 权威

- Status: Accepted
- Decision: 长期密钥放在 1Password；Studio 持久化引用而非明文。
- Reason: 避免 Git、SQLite、前端和日志泄露；利用现有恢复与轮换能力。

## ADR-005 — WebDAV 分成三个能力域

- Status: Accepted
- Decision: Public（公开资源）、Collection（隔离收集）、Security（加密备份）使用独立端点/权限。
- Reason: 三类数据的读写主体、风险和生命周期不同；不能靠路径约定混在一个权限域。

## ADR-006 — R2 不是平台必需依赖

- Status: Accepted
- Supersedes: 对话早期“原图必须上传 R2”的方案
- Decision: 先验证本地派生图、现有 WebDAV/Cloudflare 能力；只有实测收益与成本合理时再引入 R2/Images。

## ADR-007 — Knowledge 公开可读，批注可发布

- Status: Accepted
- Decision: Knowledge 正文公开；批注有 LOCAL/PUBLIC 状态，公开批注与规范正文视觉分层。

## ADR-008 — OTP 只用于认证

- Status: Accepted
- Decision: TOTP/一次性密码不得作为备份加密密钥或内容密钥。
- Reason: 短、可预测轮换值不适合数据加密；恢复密钥应是独立高熵秘密并归 1Password 管理。

## ADR-009 — Git 中的文档是真相源

- Status: Accepted
- Decision: AGENTS 导航，Product/Architecture/Decisions/Master Plan/Tasks/State 分工；临时代理任务列表不是长期真相源。

## ADR-010 — 当前不自动 push

- Status: Accepted by repository instructions
- Decision: 代理可在完整验证后主动 commit，但不 push；维护者审核后上线。
- Reason: 当前 `AGENTS.md` 的明确约定覆盖共享对话中更早的自动发布设想。

## ADR-011 — 归档只读

- Status: Accepted
- Decision: `archives/` 和 `public/history/` 不再修改；兼容性修补如确有必要必须先改变当前规则并获得授权。

## ADR-012 — 新需求并入现有计划，不新建平行计划

- Status: Accepted
- Decision: 后续关于长期记忆、知识检索、1Password 密钥、WebDAV 备份与外部 AI 访问的
  增量需求，一律并入 `MASTER_PLAN.md` / `TASKS.md` / `OPEN_QUESTIONS.md` / 本文件，
  **不创建第二套计划文档**。
- Reason: 项目已有 G0 建立的单一真相源体系，且上述领域在现有阶段表中已基本覆盖
  （S1–S4、K1–K3、R1–R2、I2–I4、M1–M2）。新建平行计划会造成两份事实互相漂移，
  正是 ADR-009 要避免的问题。
- Consequence: 经比对后仅**三个真实缺口**被补为任务：
  `MEM-001`（长期记忆服务与三层模型）、`ARCH-001`（原始档案层）、
  `ACCESS-001`（外部 AI 受限访问层）。其余需求已由既有任务覆盖，不重复立项。

## ADR-013 — Studio 是绿地开发，不是既有系统扩展

- Status: Accepted
- Decision: 按 S1（Studio Discovery）先做选型与 ADR，再进入 S2 实现。
  **不得跳过 S1 直接写数据层或 UI。**
- Reason: 2026-09-16 实测确认仓库中**没有任何 Studio 实现代码** ——
  `studio` / `sqlite` / `webdav` 的检索命中全部来自规划文档。
  需求中「在现有 Frees Studio 基础上扩展」的前提在当前代码库并不成立。
  测试夹具与模拟实现不能替代真实系统验证。

## ADR-014 — 栏目归属由数据决定，空分类与缺失同义

- Status: Accepted
- Decision: 栏目归属（`src/data/sections.ts` + `src/utils/posts-query.ts`）按
  「人工字段 `section` > 归一化分类 > 标签」的优先级推断；
  分类为空串时归一为「随笔」，与「未填写」同义。
- Reason: 原先 `/notes/` 用文章 id 白名单、`/research/` 用标签白名单，
  新增文章不会出现在任何栏目页；`research.astro` 的 `.slice(0,4)` 更让第 5 篇
  之后永久不可见。而 `normalizeCategory` 曾把空串与 `daily` 一起映射为「生活」，
  导致 `thinking.md`（3800 字，category 为空串）同时从两个栏目页消失且无任何提示。
  白名单里的 id 与实际 id 不一致（`lovev10` 对 `LOVEv1.0`）也不会有提示。

## ADR-015 — 组件 frontmatter 保持薄，派生逻辑放查询层

- Status: Accepted
- Decision: `.astro` 组件的 frontmatter 只做「取 props + 调一个模型函数 + 渲染」。
  分组、降权、排序一类推导一律放进 `src/utils/`。
- Reason: 2026-09-16 实测 —— 当 `PostList.astro` 的 frontmatter 同时含有较长的
  `interface Props` 与较长的派生逻辑时，Astro **静默放弃** `Props` 解析：
  `Astro.props` 退化为 `Record<string, any>`，`Props` 被报为未使用，
  并且**调用点传入非法道具不再被 `astro check` 捕获**
  （实测 `variant="bogus"` 与未知道具均通过检查）。
  二分定位到是 frontmatter 规模而非某个具体语法：截短接口体或截掉尾部推导
  任一者都能恢复解析。把推导移入 `buildListModel()` 后，hint 消失且属性检查恢复。
  这类失效没有错误信息，只能靠「故意传一个非法道具」来发现。

## ADR-016 — 无人值守提交使用独立自动化身份

- Status: Accepted
- Decision: 无人值守提交走 `scripts/automation/commit.sh`，
  使用专用密钥 `~/.ssh/frees_blog_automation_ed25519` 与身份
  `Frees Blog Automation <automation@frees-ling.dev>`，签名器为系统 `ssh-keygen`。
  全局 `~/.gitconfig`、`~/.claude/settings.json` 与本仓库 `.git/config` **均不修改**。
- Reason: 2026-09-16 诊断确认，**只有提交签名依赖 1Password**
  （`gpg.ssh.program = op-ssh-sign`）。GitHub 的 SSH 认证走的是 `~/.ssh/id_ed25519`
  文件密钥，`SSH_AUTH_SOCK` 指向 launchd 且 agent 内无身份时 `git ls-remote` 仍然成功 ——
  也就是说「1Password 导致无法访问 GitHub」这个前提不成立。
  1Password 锁定时提交会以 `error: 1Password: failed to fill whole buffer` 中断，
  且该失败是**状态相关**的：同日实测中，锁定时报错、解锁后同一命令成功。
  无人值守不能依赖需要人解锁的进程，但也不应因此取消签名或冒用个人身份。
- 边界: 不改变 push 策略（ADR-010）。该密钥未加入 GitHub，也不是 deploy key，
  不能读写任何仓库。

## ADR-017 — 视觉方向转为「书房」：单色相、中文优先

- Status: Accepted
- Supersedes: P5a 配色基座与 P5c Site Chrome 的**视觉部分**
  （WEB-006/007/008 的结构成果保留：编排器、栏目数据层、闸门、门禁）
- Decision: 以「书房」为隐喻、单一蓝色相为色彩语言、简体中文为界面语言。
  选定的方向是**书房 · 卡片目录**，并把知识地图并入 ——
  卡片上的「参见」是关系数据的局部视图，地图是同一份数据的全局视图，
  两者同源，不是两个并列功能。
- Reason: 用户 2026-09-16 明确反馈 FIELD LOG 的视觉「夸张的字体、大量英文、过度装饰」。
  这不是执行偏差而是方向不合，以用户判断为准。
  随后用户指定 Fuwari 为审美参考，但补充要求**不得复制其组件与布局**，
  并给出理由：复制构件会丢掉原理、只留下皮。
  因此本方向只采用从 Fuwari 提炼的四条原理 ——
  单色相（全部颜色来自一个色相族）、低彩度背景（彩度 ≤ 0.034）、
  高度规律（同类条目形状完全一致）、元信息从属（不与被描述对象竞争）。
- 技术边界: 不迁移 Fuwari 模板。保持 Astro 7、零框架、零 hydration、Pagefind、
  内容集合与 WEB-008 的列表编排器。不引入 Tailwind / Stylus / Svelte / swup。
- 已废止的具体做法: 拉丁导航、118px 衬线首屏、全大写 mono 眉标、
  坐标与条目编号装饰、signal red 第二强调色、直角。

## ADR-018 — 字体栈必须走 token，并由闸门强制

- Status: Accepted
- Decision: `check-tokens.mjs` 增加第 ⑤ 项检查：`font-family` 只允许
  `var(--font-display|sans|mono)` 或 `inherit`。
- Reason: 本次把 `--font-display` 从 Georgia 衬线改为中文优先的无衬线栈后，
  实测**只有 11 处生效**，另有 35 处写死在组件里（12 个文件用 `Georgia, serif`），
  页面上的文章标题仍是衬线 —— 也就是说「统一换字体」这件事在大部分文件里静默失效。
  原先的闸门只检查颜色、断点与 var() 引用，管不到字体族。
  这与 ADR 里记录过的 token 失效是同一类问题：**没有报错，只是没生效**。

## ADR-019 — 知识地图在当前语料下不做关系图，改为主题总览

- Status: Accepted
- Decision: 不实现节点-连线式关系图。知识导航由 `/topics/` 主题总览承担；
  文章级关联由「参见」承担（文章页与首页卡片）。两者读同一份 `buildRelations`。
- Reason: 2026-09-16 用真实数据实测，该语料画不出有结构的图 ——
  文章层 17 个节点只有 7 条边、11 个孤立，唯一的簇是权重完全相同的完全图；
  标签层 34 个标签里 31 个只出现一次。
  强行渲染只能靠编造关系填满画布，而用户明确要求地图必须是可用的导航而非装饰。
  同时删除了已写好的 `buildGraph`：保留一段产不出有效结果的实现，
  只会诱使后来者真的去画它。重新启用关系图的条件写入 `docs/visual-direction.md`。
- 附带修正: 「参见」曾用「同分类」作兜底信号（权重 0.05），
  实测导致每张卡片列出其余 12 篇 —— 「都是笔记」不是关联。已删除该信号。
