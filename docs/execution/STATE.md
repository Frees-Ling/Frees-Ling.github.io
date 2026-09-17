# Current Project State

Updated: 2026-09-16

Branch: `main`

Verified starting HEAD: `b120946`（`首页编辑化重构：首屏改为身份区，建立编辑物结构`）

## Current phase

W1 收口 → W2 — Article Renderer

## Current task

KB-011 已完成（备份传输层）。下一项见下方 Next READY task。

## Last known implementation state

- 公共 Astro 站、17 篇文章和两代历史展馆已存在。
- 重设计 P0–P3、P5a、P5c 已完成并**通过最终回归**（WEB-006 DONE，提交 `2b61609`）。
- 记忆与密钥的增量需求已并入现有计划（`a21c093`），三个缺口补为 MEM-001 / ARCH-001 / ACCESS-001。
- 站点 chrome 已是 FIELD LOG 语言：masthead + colophon，无圆形徽章 / 光晕 / 胶囊。
- 首页已按 Identity → Work → Writing → Notes → Signal 重构（WEB-007 DONE），首屏可答 Who/What/Why。
- 列表已收敛为单一编排器 PostList，栏目由 `src/data/sections.ts` 驱动，无硬编码白名单（WEB-008 DONE）。
- 文章渲染器契约已确立（RENDER-001 DONE），见 `docs/article-renderer.md`。
- Transformer 分章设计已定（RENDER-002 DONE），见 `docs/transformer-chaptering.md`：
  采用**页内分章**（不拆 URL）；实测结构为 109 h1 / 471 h2 / 71 h3（修正了 RENDER-001
  按源码 grep 得出的错误数字）。内容覆盖率闸门 `npm run check:coverage` 已可用。
- 页内分章已落地（RENDER-003 DONE）：正文标题在渲染期下移，页面标题成为唯一 h1
  （改动前 transformer 有 110 个），650 个锚点哈希逐字未变；长文目录按章节折叠、
  当前章跟随。`.md` 一个字节未改。
- 知识库存储层（K0）与服务层（KB-001 DONE）已实现，40 项测试通过；
  服务只绑 127.0.0.1、令牌鉴权、无任何发布到公网的路由。
- 本地编辑界面（KB-002 DONE）可用：登录、列表、阅读、编辑、新建、删除、检索、双主题。
  界面复用 tokens.css，未引入前端框架；有真实浏览器验收脚本。
- 模型适配层与模拟推理服务（KB-003 DONE）已就绪：默认只允许本机端点，
  非本机必须显式 allowRemote；AI 回答只能存为 ai_draft 草稿。
- AI Studio（KB-004 DONE）可用：对话、引用注入、存为草稿，
  有真实浏览器验收脚本（模拟推理服务，不依赖本机是否装 LM Studio）。
- 长期记忆引擎选型已定：自建，不引入第三方（ADR-023，研究见 docs/research/memory-engines.md）。
- 记忆审核界面（KB-006 DONE）可用。
- 语义检索（KB-007 DONE）：嵌入默认指本机 LM Studio，端点不可用时降级为关键词；
  向量存本地 SQLite，不引入向量数据库。
- 完整导出/导入与向量重建（KB-008 DONE）：导出不含向量、导入只接受空库、
  重建全算完才落库以避免半新半旧。
- 命令行入口（KB-009 DONE）：status / start / export / import / rebuild，`npm run studio`。
- 加密备份格式（KB-010 DONE）：AES-256-GCM + scrypt，口令不落盘。
- 备份传输层（KB-011 DONE）：WebDAV 上传 → **回读校验** → 保留策略（默认 dry-run、
  永不删最后一份）。CLI 有 `backup` / `restore` / `retention`。
  已用真实 WebDAV 服务端（wsgidav）做过端到端验证，不只是 mock。
  **尚无真实凭证**，托管服务的认证/配额/限流等失败模式未验证。
- 三层关联（KB-005 DONE）：记忆可追溯到来源消息/档案并关联知识库条目；
  删除来源不销毁结论；统一检索排除待审核记忆。
- 凭证走 apiKeyHelper + macOS 钥匙串，磁盘零明文；读取带 5 秒看门狗（ADR-020/024）。
  读取脚本的退出码即状态（SEC-001）。
- 导航与页脚合计覆盖全部结构性路由；旧 URL 与大小写行为均已验证。
- Studio 技术选型已定并记录（STUDIO-001 DONE，ADR-025）：localhost Web +
  Node 内置能力，**运行时第三方依赖为 0**。
- 本地数据层已验证（STUDIO-002 DONE）：schema 版本与迁移、事务、重启恢复、
  备份一致性，全部在**真实文件库 + 跨进程**下测过。
- 配置与 secret reference（STUDIO-003 DONE，ADR-026）：普通配置在界面里改，
  敏感项**库里只存引用**（环境变量或钥匙串），界面里没有密码输入框。
  实测库文件、数据目录、浏览器存储、DOM 均无明文。
- 凭据引用解析与泄漏扫描（SEC-001 DONE）：钥匙串读取有七个明确状态
  （ok/missing/locked/denied/empty/unavailable/unset），每条都说明下一步做什么；
  描述状态**不读值**。三面扫描 `npm run verify:secrets` 覆盖磁盘/浏览器/仓库，
  且敏感性经过植入验证。
- Owner 认证威胁模型已定（SEC-002 DONE，`docs/security-threat-model.md`）：
  **不做公网 Owner mode**；本地场景下成立的两条威胁（DNS rebinding、猜令牌）
  已修并测。会话无细粒度撤销，撤销手段是轮换令牌后重启。
- 任务清单本身纳入闸门（`npm run check:tasks`）：查重复条目、悬空依赖、依赖成环。
  起因是 TASKS.md 里出现两块 STUDIO-002（一块 DONE、一块过期的 BACKLOG），
  而所有读取方按名字取最后一次 —— 于是 STUDIO-002 被判为未完成，
  连带堵住 EDITOR-001 → KNOW-001 → ACCESS-001 整条链。同一次检查还发现
  5 处依赖字段不可机器解析（中文顿号、散文）。
- 统一文档模型与生产预览（EDITOR-001 DONE）：渲染管线抽取为公开站与 Studio
  预览的共用真相源；`npm run check:preview` 逐字比对预览与发布（17 篇一致）；
  稳定 block ID 三种文档类型共用、产物零影响；Studio 侧预览接入，
  编辑会话存库、**关掉服务再起来未保存的草稿一字不少**。
- 原始档案层（ARCH-001 DONE）：增量/去重/幂等的导入（Markdown、结构化 JSON、
  目录），去重判据是 **(来源, 内容)** —— 同一段文字来自两份文档各留一条，
  否则来源会无声消失。不抓取、不跟随符号链接。CLI `archive` 子命令。
- 外部 AI 访问（ACCESS-001 DONE）：核实结论是**「仅凭 API Key 就能让 ChatGPT
  访问本地知识库」不成立**（不接受贴 key、必须公网 HTTPS、要付费套餐）。
  真正的交付是受限访问身份：具名、有范围、可撤销、可审计，
  默认拒绝 + 只存哈希。MCP 服务器与隧道路径记为后续任务。
- 知识层已建立（KNOW-001 DONE）：`sources` / `prerequisites` / `related` 三个
  可选内容字段 + `src/utils/knowledge.mjs` 的反链索引 + 文章页「知识坐标」。
  全部来自人工声明，不做标签推断（ADR-019）。悬空引用是 error。
  **三个字段目前全为空** —— 填充是内容决策，不是工程任务。
- 长期记忆服务已建立（MEM-001 DONE，`docs/memory-service.md`）：三层分离、
  追加式纠正、去重与冲突标记、可见性、自动提取开关。31 项测试。
- Studio 的 WebDAV 集成尚未接进界面（当前只有 CLI 路径）；
  Collection 与灾备恢复 UI 尚未实现。

## Current objective

ARCH-001 已完成。下一项见 Next READY task。

## Next READY task

EDITOR-001 — 统一文档模型与生产预览（依赖 STUDIO-002、RENDER-001；RENDER-001 已满足）。

## Blockers / human decisions

- GitHub Pages `https_enforced` 与 Cloudflare 真实生产边界需在发布变更前确认。
- 任何付费供应商、域名/DNS、公开管理端点和外部账号权限变更都需用户明确批准。
- 当前规则禁止代理 push；上线由维护者审核后手动推送。

## Recent binding decisions

- Astro 公共站继续作为静态发布面。
- Studio local-first，日常配置走 UI，秘密归 1Password。
- 三类 WebDAV：Public / Collection / Security。
- R2/Cloudflare Images 不是必需依赖，先做供应商能力研究。
- 公开批注允许发布；OTP 只认证、不加密。
- 视觉方向为「书房」，单一蓝色相 + 中文优先；知识地图改为主题总览（ADR-019）。
- 无人值守提交使用独立自动化身份，不依赖 1Password（ADR-016）。
- 密钥闸门 check-secrets 覆盖路径黑名单与内容特征，不回显匹配内容。
- 栏目归属以数据决定，人工 `section` 字段优先于标签推断（ADR-014）。
- 组件 frontmatter 保持薄，派生逻辑放 `src/utils/`（ADR-015）。
