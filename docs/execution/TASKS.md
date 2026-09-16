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

- Status: BACKLOG
- Phase: W1/W4
- Priority: P1
- Depends-On: WEB-007

Acceptance：Work/Notes/Archive 使用统一编排器；无文章标题白名单；人工内容字段可验证；空内容诚实降权。

### RENDER-001 — 文章渲染器审计与契约

- Status: BACKLOG
- Phase: W2
- Priority: P0
- Depends-On: WEB-006

Acceptance：确定语义节点、样式责任、Studio 复用边界、fixture 集与兼容策略；不改文章正文事实。

### RENDER-002 — Transformer 枢纽/分章迁移设计

- Status: BACKLOG
- Phase: W2
- Priority: P0
- Depends-On: RENDER-001

Acceptance：记录章节划分、旧 slug/anchor 兼容、搜索/RSS/SEO 策略、迁移脚本和回滚；迁移前后内容 hash/覆盖率可核验。

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

- Status: BACKLOG
- Phase: S3/S4
- Priority: P0
- Depends-On: STUDIO-001, RENDER-001

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

- Status: BACKLOG
- Phase: S1
- Priority: P0
- Depends-On: GOV-001

Acceptance：比较 localhost Web、Tauri/Electron 等候选的安全、跨平台、文件/SQLite/1Password 集成与维护成本；
用最小原型验证关键风险并写 ADR。

### STUDIO-002 — 本地数据与迁移原型

- Status: BACKLOG
- Phase: S1
- Priority: P0
- Depends-On: STUDIO-001

Acceptance：SQLite schema version、事务、重启恢复、迁移/回滚、备份一致性在可抛弃原型中验证。

### STUDIO-003 — 配置与 secret reference

- Status: BACKLOG
- Phase: S2
- Priority: P0
- Depends-On: STUDIO-002

Acceptance：普通配置可经 UI 修改；敏感项只持久化引用；日志/DB/浏览器/Git 扫描无明文 secret。

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

- Status: BACKLOG
- Phase: R1
- Priority: P0
- Depends-On: STUDIO-003

Acceptance：reference resolve、不可用/锁定状态、最小泄露日志、仓库/DB/浏览器存储扫描测试。

### SEC-002 — Owner 认证 threat model

- Status: BACKLOG
- Phase: R1
- Priority: P0
- Depends-On: SEC-001

Acceptance：明确是否真的需要公网 Owner mode；若需要，覆盖 TOTP、会话、重放、撤销、恢复和限流；OTP 不参与加密。

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
