# Frees Platform 总实施计划

版本：2026-09-16

原则：先完成依赖和风险前置项，再扩展功能；每个阶段只有满足退出条件才算完成。

## 0. 已完成基线

公共站重写、17 篇文章保留和历史展馆已在早期提交完成。重设计专项当前已完成：

- P0 基线冻结与视觉工具
- P1 HTML/head 修复
- P2 语义、响应式断点和无障碍修复
- P3 token 架构与静态闸门
- P5a 配色基座
- P5c Site Chrome 已提交并**通过最终回归**（WEB-006 DONE）

证据见 `docs/redesign-progress.md`。总计划不把这些阶段重新打开，除非回归测试发现问题。

## 阶段路线

| 阶段 | 目标 | 关键依赖 | 退出条件 |
| --- | --- | --- | --- |
| G0 Governance | 建立产品、架构、任务、状态、决策和测试真相源 | 当前仓库 | 文档一致、无冲突、校验通过、提交 |
| W1 FIELD LOG 完成 | P5c 验收；首页、列表、栏目与页面专属语言落地 | G0、现有设计系统 | 主要路由 3 轮视觉 QA；全闸门通过 |
| W2 Article Renderer | 统一文章层级、TOC、图版、引用、长文策略 | W1 可并行部分 | 中英文文章与超长 Transformer 验收 |
| W3 Assets & Performance | 响应式图片、字体、CLS/LCP、资源预算 | W1/W2 | 真实构建体积和性能预算通过 |
| W4 IA & Content Pipeline | 数据驱动栏目、URL 守护、内容生成/校验命令 | W1/W2 | 无硬编码白名单；旧 URL 通过 |
| S1 Studio Discovery | 技术选型、威胁模型、原型和数据迁移策略 | G0，研究任务 | ADR 完成；可抛弃原型验证关键风险 |
| S2 Studio Foundation | 本地 UI/服务、SQLite、配置、任务和恢复点；**ARCH-001 原始档案层** | S1 | 重启恢复状态；无秘密落盘 |
| S3 Unified Editor | ARTICLE/KNOWLEDGE/PROJECT 编辑与生产预览 | S2、W2 | 共享渲染器；diff 编辑；文件导入入口 |
| S4 AI Gateway | 可替换供应商、模型能力、sidecar、用量与安全日志；**MEM-001 长期记忆服务** | S2/S3 | 至少两个兼容适配器；无供应商耦合；记忆引擎可替换且可导出 |
| M1 Media Core | 本地媒体库、hash/ID、派生图、引用和 EXIF 策略 | S2、W3 | 导入/派生/复用/回收演练通过 |
| M2 AI Image | 生图适配器、元数据、本地归档与可选上传 | S4/M1 | 生成资产可跨文档复用；密钥安全 |
| I1 GitHub/Friends | 项目构建期同步、Friends 数据/RSS 健康检查 | W4/S2 | 人工覆盖优先；公开页无实时依赖 |
| I2 WebDAV Layer | 三类 endpoint 的能力探测、路径安全、健康检查 | S2、研究任务 | 读/写能力准确；负向路径测试通过 |
| I3 Vault & Music | Public WebDAV 清单/代理、Range/缓存策略 | I2 | 凭据不进浏览器；媒体播放实测 |
| I4 Collection | 会话隔离收集、限制、审计、Owner 查看 | I2、安全评审 | 跨访客访问测试全部拒绝；大文件路径验证 |
| K1 Knowledge Core | 知识节点、来源、学习路径、搜索和公开渲染 | S3/W2 | 来源可追溯；公开构建与检索通过 |
| K2 Research Pipeline | 查重、研究、冲突、主张校验和审查队列 | K1/S4 | 不支持主张被标记；不能自动越过审查 |
| K3 Annotation & Discussion | 稳定锚点、公开批注、Giscus/讨论映射 | K1/S3 | 合理编辑后锚点策略可解释；评论可用 |
| R1 Secret & Owner Security | 1Password 引用、Owner 认证设计、审计；**ACCESS-001 外部 AI 受限访问层** | S2/I2 | threat model 和渗透负向用例通过；外部身份最小权限且可撤销 |
| R2 Backup & Restore | 加密快照、Security WebDAV、UI 恢复与演练 | R1/I2 | 干净环境端到端恢复成功 |
| F1 Integration | 模块整合、迁移、可观察性、失败恢复 | 前述阶段 | 关键用户旅程端到端通过 |
| F2 Production Hardening | 安全、性能、无障碍、内容和灾备总验收 | F1 | 发布清单全绿；维护者批准 push |

## 关键依赖链

```text
G0 → W1 → W2/W3/W4
G0 → S1 → S2 → S3 → S4
S2 → M1 → M2
S2 → I2 → I3/I4 → R1 → R2
S3 + W2 → K1 → K2/K3
all verified tracks → F1 → F2
```

## 每阶段统一循环

```text
READ STATE/TASKS
→ verify repository reality
→ research unstable provider facts
→ implement smallest accepted work unit
→ unit/integration/security tests
→ browser QA for UI
→ record evidence
→ update TASKS/STATE/DECISIONS
→ full relevant gates
→ logical commit
```

公共 UI 大改至少进行三轮：结构观察、层级/模板感批评、细节/响应式一致性。

## 不可并行的工作

- 同一组件/样式层的视觉改造。
- 数据 schema → API → UI 的强依赖链。
- 加密/恢复实现与未冻结的 key model。
- WebDAV 公共端点与尚未完成的路径/隔离安全模型。

可并行的是相互独立的只读研究、测试矩阵设计和不同模块的审计；不得为了并行制造冲突。

## 变更控制

- 影响产品范围：先改 `PRODUCT_SPEC.md`。
- 影响系统边界/供应商：写 ADR 到 `DECISIONS.md`。
- 影响阶段依赖：改本文件与 `TASKS.md`。
- 仅影响当前执行检查点：只改 `STATE.md`。
