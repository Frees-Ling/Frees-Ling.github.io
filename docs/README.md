# 项目文档导航

这里是 Frees Blog / Frees Platform 的文档总入口。文档按“产品目标、架构边界、执行状态、
专项契约、研究证据、历史来源”分层，避免愿景、实现与进度互相冒充。

## 开始工作前

每次进入仓库先按顺序阅读：

1. [`execution/STATE.md`](execution/STATE.md)：上一个经过记录的实现检查点、限制和下一步
2. [`execution/TASKS.md`](execution/TASKS.md)：任务状态、依赖、验收证据与对应提交
3. [`execution/MASTER_PLAN.md`](execution/MASTER_PLAN.md)：阶段、关键依赖链和退出条件
4. 当前任务对应的产品、架构、研究或专项契约

`STATE.md` 是人工维护的检查点，不是运行时事实。如果它与代码、Git 历史或测试结果冲突，应先
核实，再把修正同步回 `STATE.md`、`TASKS.md`，必要时补充 ADR。

## 文档权威层级

| 需要回答的问题 | 首要真相源 | 辅助证据 |
| --- | --- | --- |
| 产品最终要成为什么 | [`product/PRODUCT_SPEC.md`](product/PRODUCT_SPEC.md) | 需求来源摘要 |
| 当前做到哪里 | [`execution/TASKS.md`](execution/TASKS.md) | `STATE.md`、Git、测试结果 |
| 下一步如何排期 | [`execution/MASTER_PLAN.md`](execution/MASTER_PLAN.md) | `TASKS.md` 的依赖关系 |
| 系统应该如何分层 | [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) | 专题架构文档 |
| 为什么选择当前方案 | [`execution/DECISIONS.md`](execution/DECISIONS.md) | 研究文档、验证记录 |
| 如何判断完成 | 任务 Acceptance | 测试矩阵、发布清单、Evidence |
| 外部服务是否真的可用 | 当前官方资料与受控测试 | `research/` 中注明日期的证据 |

聊天记录、一次性汇报和提交标题都不能单独证明任务完成。任务只有满足 Acceptance、写入 Evidence
并关联真实提交后才能标记 `DONE`。

## 产品与总体架构

| 文档 | 用途 |
| --- | --- |
| [`product/PRODUCT_SPEC.md`](product/PRODUCT_SPEC.md) | 产品定义、使用者、成功标准、范围与非目标 |
| [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) | 公共站、Studio、知识、媒体和外部服务的总体边界 |
| [`architecture/DATA_MODEL.md`](architecture/DATA_MODEL.md) | 文档、来源、主张、批注和关系的数据模型 |
| [`architecture/STORAGE_MODEL.md`](architecture/STORAGE_MODEL.md) | Git、本地库、媒体、WebDAV 等存储职责 |
| [`architecture/SECURITY_MODEL.md`](architecture/SECURITY_MODEL.md) | 信任域、密钥、Owner 身份和公开访问边界 |
| [`architecture/RECOVERY_MODEL.md`](architecture/RECOVERY_MODEL.md) | 备份范围、恢复流程、迁移与灾备目标 |

架构文档描述长期边界，不等于所有组件已经实现。实际状态必须回到 `TASKS.md` 和测试证据确认。

## 执行与治理

| 文档 | 用途 | 更新时机 |
| --- | --- | --- |
| [`execution/STATE.md`](execution/STATE.md) | 当前检查点、已知实现、阻塞与下一任务 | 每个任务收口时 |
| [`execution/TASKS.md`](execution/TASKS.md) | 持久任务、依赖、Acceptance、Evidence、Commit | 任务状态变化时 |
| [`execution/MASTER_PLAN.md`](execution/MASTER_PLAN.md) | 阶段路线与关键依赖链 | 路线或阶段边界变化时 |
| [`execution/DECISIONS.md`](execution/DECISIONS.md) | 架构决策记录（ADR） | 长期决策形成或被替代时 |
| [`execution/TEST_MATRIX.md`](execution/TEST_MATRIX.md) | 各模块最低验证范围 | 新增风险面或门禁时 |
| [`execution/RELEASE_CHECKLIST.md`](execution/RELEASE_CHECKLIST.md) | 发布前、本地与线上验收清单 | 发布流程变化时 |
| [`execution/PENDING_AUTHORIZATION.md`](execution/PENDING_AUTHORIZATION.md) | 必须由维护者决定或亲自操作的事项 | 授权产生、完成或撤销时 |
| [`execution/RUN_LOG.md`](execution/RUN_LOG.md) | 自主开发循环与调度器运行记录 | 自动化循环运行时 |
| [`execution/content-manifest.json`](execution/content-manifest.json) | 机器读取的内容完整性清单 | 由对应检查流程维护 |

## 公共站、内容与视觉

| 文档 | 用途 |
| --- | --- |
| [`information-architecture.md`](information-architecture.md) | 导航、页面层级、路径和栏目职责 |
| [`article-renderer.md`](article-renderer.md) | Markdown 到公开站/Studio 预览的共同渲染契约 |
| [`transformer-chaptering.md`](transformer-chaptering.md) | Transformer 超长文章的页内分章与锚点保护方案 |
| [`design-system.md`](design-system.md) | FREES / FIELD LOG 的视觉语言、组件原则和设计母题 |
| [`visual-direction.md`](visual-direction.md) | “私人数字书房”方向及其与既有设计的关系 |
| [`design-audit.md`](design-audit.md) | 2026-09-16 设计与技术基线审计，属于时间点证据 |
| [`redesign-plan.md`](redesign-plan.md) | 公共站重设计专项的阶段计划 |
| [`redesign-progress.md`](redesign-progress.md) | 重设计阶段的历史进度与验收证据 |

设计审计和进度文档保留当时观察，不应为了让历史“看起来一直正确”而回写结论。现行设计规则以实现、
设计系统、ADR 和当前任务验收为准。

## Studio、知识、记忆与安全

| 文档 | 用途 |
| --- | --- |
| [`knowledge-base.md`](knowledge-base.md) | 私人知识库的硬约束、数据层与本地服务实现 |
| [`memory-service.md`](memory-service.md) | 长期记忆的审核、纠正、冲突、可见性和来源契约 |
| [`security.md`](security.md) | 凭证轮换、钥匙串使用、泄漏防护和实际操作步骤 |
| [`security-threat-model.md`](security-threat-model.md) | Owner 认证威胁模型及本地场景下仍成立的风险 |

涉及密钥、认证、备份、删除和公网暴露的修改，不能只更新实现；必须同步检查安全模型、测试矩阵和恢复
路径。真实密钥不得进入文档示例。

## 研究与外部事实

| 文档 | 用途 | 证据边界 |
| --- | --- | --- |
| [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md) | 尚未确认的供应商能力与实施前问题 | 未关闭条目不得当成事实 |
| [`research/external-ai-access.md`](research/external-ai-access.md) | 外部 AI 访问本地知识库的可行性核实 | 区分 API 能力与真实可达性 |
| [`research/memory-engines.md`](research/memory-engines.md) | 长期记忆引擎的对比与自建决策依据 | 记录研究时点与被排除方案 |
| [`research/webdav-provider.md`](research/webdav-provider.md) | 123 云盘 OpenAPI/WebDAV 能力验证 | 明确已验证与需要真实凭证的未知项 |

供应商能力、价格、配额、认证和接口可能变化。使用研究结论前先查看日期；如果实现依赖该结论，应重新
核对当前官方资料或做受控测试，并更新证据边界。

## 需求来源

| 文档 | 用途 |
| --- | --- |
| [`source/chat-requirements-summary.md`](source/chat-requirements-summary.md) | 把共享对话中的需求整理为可追溯来源，并标记已被后续决定覆盖的想法 |

来源文档用于解释“需求从哪里来”，不是当前实现指令。后续产品规格、ADR 和任务验收可以覆盖早期想法，
但必须明确记录覆盖关系。

## 按角色阅读

### 只想了解项目

1. 根目录 [`README.md`](../README.md)
2. [`product/PRODUCT_SPEC.md`](product/PRODUCT_SPEC.md)
3. [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)

### 准备开始开发

1. 根目录 [`AGENTS.md`](../AGENTS.md)
2. `STATE.md`、`TASKS.md`、`MASTER_PLAN.md`
3. 当前任务对应的专题文档
4. `TEST_MATRIX.md` 与 `RELEASE_CHECKLIST.md`

### 修改公开站或文章

1. `information-architecture.md`
2. `design-system.md` 与 `visual-direction.md`
3. `article-renderer.md`
4. 涉及 Transformer 时再读 `transformer-chaptering.md`

### 修改 Studio、AI 或知识系统

1. `architecture/ARCHITECTURE.md`
2. `architecture/DATA_MODEL.md`
3. `knowledge-base.md` 与 `memory-service.md`
4. `architecture/SECURITY_MODEL.md` 与 `security-threat-model.md`

### 修改备份、媒体或外部集成

1. `architecture/STORAGE_MODEL.md`
2. `architecture/RECOVERY_MODEL.md`
3. `security.md`
4. `research/OPEN_QUESTIONS.md` 与对应供应商研究

## 文档维护规则

- **不要复制动态状态。** README 只保留稳定入口；任务数量、当前 HEAD 和下一任务写入执行文档。
- **完成任务要同时收口。** 更新 Acceptance、Evidence、Commit、`STATE.md` 和相关专项文档。
- **决定与实现分开。** 长期取舍写 ADR；代码细节写契约或模块文档；过程日志写 RUN_LOG。
- **计划与事实分开。** “目标”“已实现”“已验证”“待确认”必须使用明确措辞。
- **保留历史证据。** 审计、进度和来源摘要允许记录旧结论；用“被覆盖”说明演变，不静默改写历史。
- **避免新增孤立文档。** 新内容优先进入现有分类；确需新增时，把入口和更新责任补到本文件。
- **链接必须可达。** 移动或重命名文档后同步修复 README、AGENTS、TASKS 和相关引用。
- **不要写入秘密。** 凭证示例只使用明确占位符，禁止真实 key、密码、令牌、种子和私有地址。

当文档和仓库现状冲突时，按“当前代码与测试 → Git 历史 → TASKS Evidence → ADR/专题文档 → 旧讨论”
的顺序核实，再修正文档。不要为了让一份汇报成立而反向修改事实。
