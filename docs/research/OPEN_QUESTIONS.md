# 开放问题与供应商验证队列

本文件不记录猜测性结论。完成研究时填写检查日期、官方来源、受控测试证据、限制与架构影响，
并把稳定选择写入 ADR。

## P0 — 实施前必须回答

### Studio 运行形态

- localhost Web、Tauri、Electron 或其他方案，哪一种在 macOS 优先、未来跨平台、文件系统、SQLite、
  1Password CLI、自动更新和安全边界之间最合适？
- 浏览器 UI 与本地特权服务如何认证，如何防止其他本机网页调用？

### 123 云盘 / WebDAV

- 当前官方 WebDAV/OpenAPI 的 PROPFIND、Range、写入、删除、限额、并发、直链与 token 能力是什么？
- 是否存在适合匿名大文件提交的短期直传能力？若没有，数据面如何设计？
- Public/Collection/Security 是否可由三个独立最小权限凭据可靠隔离？

### 1Password

- 目标平台上的 CLI/service account/desktop integration 最合适方式与解锁 UX。
- `op://` 引用、短期缓存、锁定、轮换、错误输出和日志脱敏行为。

### 生产链路

- GitHub Pages 是生产权威；Cloudflare 当前到底承担 DNS、代理、Pages preview 还是其他角色？
- `https_enforced: false`、HTTP 中间跳与 Cloudflare 规则的真实现状和安全修复路径。

## P1 — 模块开始前回答

- 图片派生：Astro 本地构建、Cloudflare Images/R2 或现有存储的真实成本与性能。
- 评论：现有 Giscus category、映射方式、知识页稳定 ID 与迁移行为。
- GitHub API：匿名/授权配额、ETag、Actions 缓存和失败降级。
- Friends RSS：抓取超时、缓存、恶意内容清理和构建失败策略。
- AI provider：各接口的结构化输出、图像、流式、工具、用量和数据保留差异。
- 文件导入：PDF/DOCX/OCR 的本地库、许可、准确率、宏/恶意文件隔离。

## 已核实的环境事实（2026-09-16 实测）

这些不是待研究项，而是**当前开发机的真实状态**，直接决定哪些工作可做、哪些被阻塞。

| 项 | 实测结果 | 影响 |
| --- | --- | --- |
| **Frees Studio 实现** | **零代码** —— 仓库中 `studio` / `sqlite` / `webdav` 的命中全部来自规划文档 | Studio 属**绿地开发**，不是「在现有实现上扩展」。S1 选型必须先做 |
| **LM Studio** | **未安装**：无 `/Applications/LM Studio.app`、无 `~/.lmstudio`、无模型缓存目录、1234 端口无监听 | **阻塞**：S4 与记忆提取无法对真实本地模型验证，只能用 fixture 或 mock |
| **1Password CLI** | `op` 2.39.0 已安装，`op account list` 有 2 个账号，但 **`op whoami` 报 account is not signed in** | **阻塞**：R1 的 `op://` 引用解析、锁定与轮换行为无法验证。需用户登录 |
| **`node:sqlite`** | ✅ 可用（Node 26.8.2 内置） | **有利**：本地 SQLite 无需新增原生依赖，S2 可零依赖起步 |
| **`sqlite3` CLI** | ✅ `/usr/bin/sqlite3` | 可用于人工核对与演练 |
| **当前依赖** | 15 个，全部是 Astro 构建工具链；无 AI / 记忆 / 数据库 / 1Password SDK | 任何 Studio 相关能力都需新增依赖，须先过 S1 选型 |
| **WebDAV 凭据** | 未提供 | **阻塞**：I2/I3/I4/R2 无法验证 |

### 需要用户提供的解锁项

1. **LM Studio 安装并加载模型**（或在 S1 中决定改用其他本地推理方案）。
2. **`op` 登录**：`op signin`，并确认用于本项目的 service account 或用户账号。
3. **123 云盘的三个 WebDAV endpoint 与最小权限凭据**（Public / Collection / Security 分离）。
4. **确认 Studio 的运行形态偏好**（localhost Web / Tauri / Electron）——
   这决定 S1 的 ADR 方向。

## 决策门槛

任何研究结果只有同时包含以下字段才能进入架构：

- Checked on
- Official source URL
- Tested version/account tier
- Observed behavior
- Known limits/unknowns
- Security implication
- Cost/lock-in implication
- Recommended decision and fallback
