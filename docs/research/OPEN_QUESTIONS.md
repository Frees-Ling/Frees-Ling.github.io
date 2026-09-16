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
