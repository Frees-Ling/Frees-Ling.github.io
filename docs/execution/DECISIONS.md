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

## ADR-020 — 凭证走 apiKeyHelper + macOS 钥匙串，不引入明文也不升级套餐

- Status: Accepted
- Decision: `~/.claude/settings.json` 以 `apiKeyHelper` 指向
  `scripts/automation/api-key-helper.sh`，凭证存 macOS 登录钥匙串；删除 `env` 中的明文。
- Reason: 1Password **个人版不支持 Service Account**（需 Business/Teams/Enterprise，
  且服务账户不能访问个人版唯一具备的 Personal/Private 库），
  按用户要求不擅自升级套餐，因此转向钥匙串。
  实测确认 `apiKeyHelper` 的输出填 `X-Api-Key`、`ANTHROPIC_AUTH_TOKEN` 填
  `Authorization: Bearer`，而 DeepSeek 的兼容端点**两者都接受** ——
  所以 apiKeyHelper 可用于 DeepSeek，磁盘上可做到零明文。
- 关键约束: 实测发现 `settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN`
  **覆盖进程环境变量**。因此「启动时注入环境变量」的方案不成立
  （已实现后删除 run-claude.sh），且**必须先删除明文**，否则钥匙串永远不会被用到。
- 风险与边界: 钥匙串条目以 `-T /usr/bin/security` 授权，
  任何以本人身份运行且能调用 security 的进程都可读取 —— 这是无人值守的必要代价，
  已在脚本注释中写明授权范围与撤销方式。条目内只有这一个开发用密钥。

## ADR-021 — 文件路径权限规则只认 Edit(path)

- Status: Accepted
- Date: 2026-09-17
- Decision: 文件路径权限规则一律写成 `Edit(path)` / `Read(path)`。
  不再使用 `Write(path)`、`NotebookEdit(path)`、`MultiEdit(path)`、`Glob(path)`。
  归档只读（ADR-011）由 `Edit(/archives/**)` 与 `protect-paths.sh` 两层保障。
- Reason: 官方文档明确 —— 「Claude Code checks file permissions against `Edit(path)`
  and `Read(path)` rules only. If you write a path rule for `Write`, `NotebookEdit`,
  `Glob`, or the legacy `MultiEdit` tool instead, Claude Code accepts the rule but never
  consults it, and warns at startup.」同页另有「`Edit` rules apply to all built-in tools
  that edit files.」
  （来源：code.claude.com/docs/en/permissions）
  这意味着 `Write(/archives/**)` **从未生效**。之所以要固化成 ADR：
  这类空操作**不会在任何闸门里失败** —— 配置被接受、无报错、只多一条启动警告，
  却给人一种「又加固了一层」的错觉。靠检查脚本发现不了，只能靠记录。
- 验证: 移除两条死规则后，用伪造的 PreToolUse 载荷直接喂 `protect-paths.sh`：
  `archives/new.md`、`public/history/x.html`、`./archives/../archives/y.md`（穿越）、
  `ARCHIVES/z.md`（macOS 大小写不敏感）全部退出码 2 拦截，`src/pages/index.astro` 放行。
  仓库内已无 `Write(` 路径规则残留。

## ADR-022 — 取凭证必须有时限

- Status: Accepted
- Date: 2026-09-17
- Decision: 任何读取钥匙串的路径都必须带超时，超时要有独立于其他失败的退出码；
  `api-key-helper.sh` 只做薄封装，不重复实现读取逻辑。
- Reason: 2026-09-16 实测，钥匙串**锁定**时 `security find-generic-password`
  不立即失败，而是挂起约 108 秒等一个 GUI 解锁弹窗才返回 128；
  `security show-keychain-info` 同样会挂起（17 秒），
  所以「先探测是否锁定、再决定要不要读」这条路走不通。
  无人值守时没人能点那个弹窗，于是它表现为**卡住**而不是报错 —— 比直接失败更难诊断。
  且 Claude Code 对 `apiKeyHelper` 有 10 秒慢速告警、失败在 3 次尝试内报错，
  近两分钟的阻塞会让整条凭证链路失效。
- 关键约束: 实现选纯 POSIX sh 看门狗 —— macOS 不保证有 `timeout(1)`，也没有 perl 保证。
  必须用 `if cmd; then :; else rc=$?; fi` 取返回码，
  不能写 `if ! cmd; then rc=$?; fi`：后者的 `$?` 是取反运算符的状态（恒为 0），
  会把「钥匙串锁了」误报成「没配过条目」。
- 验证: 用桩替换 `security` 重放锁定行为，红绿对照 ——
  旧版等满桩的时长并报「钥匙串中没有该条目」（原因说反），
  新版 3 秒看门狗触发、4 秒返回并报「读取钥匙串超时 —— 钥匙串很可能已锁定」。

## ADR-024 — 凭证读取加看门狗；移除两条无效的 deny 规则

> 编号说明：本条原先误编为 ADR-021，与「文件路径权限规则只认 Edit(path)」重号。
> 现改为 ADR-024，正文一字未动。引用它请用 ADR-024。

- Status: Accepted
- Decision:
  ① `read-credential.sh` 对钥匙串读取加纯 POSIX 看门狗（默认 5 秒上限）；
  ② 移除 `.claude/settings.json` 中 `Write(/archives/**)` 与 `Write(/public/history/**)`。
- Reason ①: 实测钥匙串**锁定**时 `security find-generic-password` 会挂起约 **108 秒**
  等待一个 GUI 弹窗，`security show-keychain-info` 同样挂起（17 秒，不能用作前置探测）。
  无人值守下没有人能点弹窗，于是每次取凭证阻塞近两分钟 ——
  表现为「卡住」而非「报错」，比直接失败更难诊断。
  看门狗不依赖 macOS 上并不存在的 `timeout(1)`，用桩程序模拟挂起 30 秒验证：
  2 秒内失败并明确提示「钥匙串很可能已锁定」与解锁命令。
- Reason ②: 这两条规则是**空操作** —— Claude Code 启动时明确警告
  「只有 Edit(path) 规则会被文件权限检查匹配，Edit 规则已覆盖所有文件编辑工具」。
  移除前已验证保护边界不变：`Edit(/archives/**)` 与 `Edit(/public/history/**)` 仍在，
  且 `protect-paths.sh` 钩子独立拦截两个目录（含路径穿越、大小写折叠、符号链接）。
  两层保护都在，启动警告消失，差异仅限这两条。
- 未声称: 完全无人值守。睡眠/重启后登录钥匙串会锁定且无法自行解锁；
  屏幕锁定状态未验证。

## ADR-023 — 长期记忆自建，不引入 Mem0 / Letta / OpenMemory

- Status: Accepted
- Decision: 本项目自建最小记忆层（KB-001～KB-006 已完成），不引入第三方记忆引擎。
- Reason: 研究基于仓库页面、LICENSE、包元数据与源码实测，结论可核查：
  · **OpenMemory 已归档**（2026-07-23 移入 openmemory-archive，安装脚本实测 404），
    且 `mem0ai/openmemory` 仓库名已被挪用给一个与记忆无关的项目
  · **Letta 已重写为 TypeScript** 并迁至 `letta-ai/letta-code`，原仓库源码清空、
    Python 版冻结在 archive 分支。且它是**完整 agent 平台**（TUI、App Server、
    多智能体、MCP、crons…），为一个记忆层引入它体系严重过载
  · **Mem0 本地模型支持最强**（`lmstudio.py` 默认即 `localhost:1234/v1`，零配置），
    但仍不满足决定性需求 —— 见下
- 决定性理由: **三者都没有「人工审核」门禁**。Mem0 的 `add()` 立即生效，
  其 64KB prompt 文件中 `confidence|source|provenance|human review|approv`
  的 grep 命中数为 **0**；Letta 文档明确说复核「does not ask you for approval」。
  这不是文档没写，是代码里没有这个概念。而它正是本项目三层模型的基石。
  另：两者**默认都联网**（Mem0 → PostHog，Letta → api.letta.com），
  需要显式关闭遥测。
- 借鉴: Mem0 的 `ADDITIVE_EXTRACTION_PROMPT` 两点设计值得采用（Apache-2.0，只借思路）：
  ADD-only + 互链（比让 LLM 决定 UPDATE/DELETE 可审计得多，后者判错即静默篡改历史）；
  相对时间必须锚定成绝对日期（「上周去了巴黎」六个月后毫无用处）。
  详见 `docs/research/memory-engines.md` 第四节。

## ADR-025 — Studio 采用 localhost Web + Node 内置能力，不引入桌面壳

- Status: Accepted
- 背景: STUDIO-001 的验收原文假设技术栈**尚未选定**（「比较 localhost Web、
  Tauri/Electron 等候选」）。实际情况相反：KB-001～KB-011 已经按 localhost Web
  把 Studio 建成并验证了。因此本 ADR 记录的是**已建成系统的事实与理由**，
  不是选型前的预测 —— 预测会被后来的实现推翻，事实不会。

- Decision: Studio 是只绑 `127.0.0.1` 的本地 Web 应用。
  后端 `node:http`，存储 `node:sqlite`，前端无框架、无构建步骤。
  **不引入 Electron / Tauri，也不引入 Web 框架或 ORM。**

- 实测证据（可复核，非推断）:

  | 项 | 实测 |
  | --- | --- |
  | Studio 运行时第三方依赖 | **0**（`package.json` 的 6 个 dependencies 全属于 Astro 公共站） |
  | studio/ 里的 import | 只有 `node:` 内置与相对路径 |
  | 前端规模 | 1019 行（index.html 151 + app.js 516 + studio.css 352） |
  | 存储 | `node:sqlite`（Node 26 内置），WAL + FTS5 trigram，4 个迁移版本 |
  | 测试 | 183 项；另有 CLI / HTTP / 真实浏览器三层验收脚本 |

- 为什么不用 Tauri / Electron:
  · 它们解决的是「**打包成桌面应用分发**」，而本项目的需求是
    「只在本机跑、数据不出本机」。绑定 127.0.0.1 + 随机令牌已经满足，
    而且**根本不存在把服务暴露到公网的代码路径**（不是默认关闭，是没有那条路）
  · 二者的体积与供应链代价是实打实的：Electron 带一个 Chromium 运行时
    与自动更新通道，Tauri 带 Rust 工具链。为零依赖的项目引入它们，
    换来的是「能双击启动」这一项收益
  · 教训已经付过一次：公共站因为 fontsource provider 而**构建期必须联网**。
    运行时的依赖面同理 —— 每多一个依赖，就多一个将来构建不出来的理由

- 为什么不用 Web 框架:
  · 端点约 20 个，`routes.mjs` 的手写分发比引入框架更短，且没有隐式行为
    （中间件顺序、body 解析、错误兜底这些都得自己写，但也就几十行）

- 代价与未决（不掩饰）:
  · **没有桌面壳 = 没有托盘图标、文件关联、开机自启**。需要用户自己起服务；
    已提供 `npm run studio start` 与 launchd 方案
  · **浏览器成了运行时依赖**，而跨浏览器行为未逐一验证 ——
    真实浏览器验收只在 Chromium 上做过
  · 1Password 集成是**引用式**的（apiKeyHelper + macOS 钥匙串），
    不走桌面壳的 keychain API；这也意味着钥匙串锁定或系统睡眠后
    无人值守会话无法自行解锁（见 ADR-024）

- 关联任务: 本 ADR 结清 STUDIO-001。
  STUDIO-002 要求的 schema 版本、事务、重启恢复、迁移回滚、备份一致性
  已在 `studio/db/schema.test.mjs` 与 `studio/db/portable.test.mjs` 中验证。

## ADR-026 — 敏感配置只存引用，不存值，也不加密存值

- Status: Accepted
- Decision: 配置分两类。普通项（端点、模型名、备份目录）直接存进 SQLite；
  敏感项（WebDAV 密码、备份口令）**在库里只存一个引用**，指向环境变量或
  钥匙串条目。真正的值在用到的那一刻才解析，解析函数刻意不接收 db 连接。

- 理由 ①：**加密存储只是把问题往上挪一层。**
  加密要求程序手里有主密钥，而主密钥又得存在某处 —— 要么明文（等于没加密），
  要么再用另一把密钥保护（无限递归），要么让人每次输入（那就不能无人值守）。
  引用式借用已有的保管者（钥匙串、launchd 环境），程序本身**没有可泄漏的东西**。
  这与 ADR-020/024 的凭证方案是同一条思路，这里把它推广成配置层的通则。

- 理由 ②：**拒绝必须发生在类型层面，而不是靠约定。**
  敏感槽只接受对象（`{kind:'env',…}` 或 `{kind:'keychain',…}`），
  传字符串一律拒绝 —— 包括那些「长得像引用」的字符串。
  留一个「先写明文、以后再改」的口子，就一定会有人走，而且漏网的那次不会被发现。
  实测：绕过界面直接 `PUT {"value":"hunter2"}` 得到 400，且**响应里不回显输入值**
  （否则拒绝反而成了泄漏渠道）。

- 理由 ③：**读取接口在结构上就没有那个字段。**
  `listSettings` 对敏感项返回 `{ref, available, source}`，**不存在 `value` 键** ——
  不是留空，是根本没有。这样「值不外流」由一个出口保证，而不是靠每个调用方自觉。

- 界面后果: 配置界面里**没有密码输入框**（实测 `input[type=password]` 数量为 0）。
  这不是省略，是设计：服务端本来就拒收，给个框只会让用户白输一遍再被拒。
  用户能选的只有「值放在哪」。

- 验证（真实服务 + 真实浏览器，均用随机哨兵串）:
  界面结构、普通项经 UI 修改并持久化、浏览器存储与 DOM 均不含哨兵、
  绕过界面塞明文得 400 且不回显、库文件字节里不含哨兵。

- 未决: 钥匙串引用目前只有 `service` + 固定 `account: 'frees-studio'`，
  没有在界面上暴露 account；多账户场景尚未需要。`resolveSecret` 的钥匙串
  读取路径尚未接上真实的 `security` 调用（reader 由调用方注入），
  接的时候要复用 `read-credential.sh` 的看门狗（ADR-024）。
