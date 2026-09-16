# 项目文档导航

本目录把“产品要做什么、系统怎么分层、现在做到哪里、下一步做什么”分开记录，避免设计讨论、
实施进度和长期架构互相覆盖。

## 每次开始工作先读

1. [`execution/STATE.md`](execution/STATE.md)：当前真实状态、阻塞项和下一任务
2. [`execution/TASKS.md`](execution/TASKS.md)：可独立验收的工作单元
3. [`execution/MASTER_PLAN.md`](execution/MASTER_PLAN.md)：阶段、依赖和退出条件
4. 当前任务对应的架构或设计文档

## 真相源

| 问题 | 文档 |
| --- | --- |
| 最终产品是什么 | [`product/PRODUCT_SPEC.md`](product/PRODUCT_SPEC.md) |
| 系统边界与组件关系 | [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) |
| 数据、存储、安全和恢复 | [`architecture/`](architecture/) 下的专题文档 |
| 为什么做出某项选择 | [`execution/DECISIONS.md`](execution/DECISIONS.md) |
| 如何分阶段实施 | [`execution/MASTER_PLAN.md`](execution/MASTER_PLAN.md) |
| 当前执行队列 | [`execution/TASKS.md`](execution/TASKS.md) |
| 当前检查点 | [`execution/STATE.md`](execution/STATE.md) |
| 如何验收 | [`execution/TEST_MATRIX.md`](execution/TEST_MATRIX.md) 与 [`execution/RELEASE_CHECKLIST.md`](execution/RELEASE_CHECKLIST.md) |
| 尚未确认的外部能力 | [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md) |

## 已有专项文档

- `design-audit.md`：2026-09-16 设计与技术基线审计
- `design-system.md`：FREES / FIELD LOG 视觉语言
- `information-architecture.md`：公共站信息架构
- `redesign-plan.md`：公共站重设计的细化子计划
- `redesign-progress.md`：公共站重设计的历史证据与阶段记录

这些是公共站重设计轨道的专项资料，不与上面的产品和执行真相源重复。
