# 自主开发循环运行日志

每轮由 `scripts/auto-dev/run.sh` 追加一行。**只记任务编号与结果，不记对话内容** ——
避免私人资料落盘。

日志文件本身是给人看的摘要；逐轮原始输出在 `.git/auto-dev/logs/`（不进版本库）。

| 时间 (UTC) | 任务 | 结果 | 说明 |
| --- | --- | --- | --- |

## 调度器

- 类型：macOS 用户级 launchd（`~/Library/LaunchAgents/dev.frees.auto-dev.plist`）
- 间隔：15 分钟
- 单实例锁：`.git/auto-dev/run.lock`（超过 30 分钟视为陈旧并回收）
- 会话互斥：`.git/auto-dev/session.lock` 新鲜（<15 分钟）时跳过，避免与交互式会话抢写
- 退避：连续失败按 1/2/4/8 轮退避（每轮 15 分钟），上限约 2 小时
- 预算上限：每轮 `--max-budget-usd 0.50`（`AUTO_DEV_BUDGET` 可覆盖）
- 权限：`--permission-prompts none`（需要审批的操作一律拒绝，**不是** bypass 模式）
- 管理：`sh scripts/auto-dev/ctl.sh status|pause|resume|stop|log`
| 2026-09-16T18:40:35Z | KB-001 | DONE | 服务层实现完成，40 项测试通过 |
| 2026-09-16T18:59:23Z | KB-002 | DONE | 编辑界面完成，48 项测试 + 浏览器验收 5/5 |
| 2026-09-16T19:10:12Z | KB-003 | DONE | 适配层 + 模拟推理 + 对话存储，70 项测试通过 |
| 2026-09-16T19:22:24Z | KB-004 | ACTIVE | 对话路由 + 引用注入完成（77 项测试），界面待做 |
| 2026-09-16T19:42:45Z | KB-004 | DONE | 对话界面完成，77 项测试 + 浏览器验收 6/6 |
