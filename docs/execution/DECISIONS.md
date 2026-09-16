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

## ADR-017 — 视觉方向由 FIELD LOG 转为 Fuwari 式蓝色书房

- Status: Accepted
- Supersedes: P5a 配色基座与 P5c Site Chrome 的视觉部分（WEB-006/007/008 的结构成果保留）
- Decision: 以 `archives/sites/Frees-Blog/`（Fuwari 派生）为视觉与交互参考，
  采用**借鉴设计语言**而非迁移模板：保留 Astro 7、零框架、零 hydration、Pagefind、
  内容集合与 WEB-008 的列表编排器，只替换视觉层。
- Reason: 用户 2026-09-16 明确反馈现有视觉「夸张的字体、大量英文、过度装饰」，
  并指定 Fuwari 为参考。这与刚完成的 FIELD LOG 方向（拉丁导航、118px 衬线首屏、
  直角、单色 + signal red）直接冲突，以用户判断为准。
  实测 Fuwari 的调色是单 `--hue` 驱动的 oklch 体系（旧配置 `hue: 250` 即蓝色），
  与本站既有的 CSS 变量分层同构，因此可以只移植 token 与组件外观。
  迁移模板则需要 Astro 7→5 降级并引入 Tailwind/Stylus/Svelte/swup，
  会破坏现有 token 闸门、视觉门禁与零 JS 基线，代价远高于收益。
