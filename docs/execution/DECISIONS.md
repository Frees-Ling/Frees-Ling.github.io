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
