# 开放问题与供应商验证队列

本文件不记录猜测性结论。完成研究时填写检查日期、官方来源、受控测试证据、限制与架构影响，
并把稳定选择写入 ADR。

## P0 — 实施前必须回答

### ~~Studio 运行形态~~ —— 已结（ADR-025，STUDIO-001）

- 结论：localhost Web + Node 内置能力，运行时第三方依赖为 0。
  不引入 Tauri/Electron（它们解决的是「打包分发给别人」，而本项目要的是
  「只在本机跑」）。代价如实记录：无托盘/自启/文件关联，跨浏览器未逐一验证。
- 浏览器 UI 与本地特权服务的认证：见 ADR-024（令牌 + HttpOnly Cookie）。

### 123 云盘 / WebDAV —— **官方资料部分已结**（`docs/research/webdav-provider.md`）

- 结论：官方文档里**只有 OpenAPI，没有 WebDAV 的协议说明**；
  而我们的备份传输层走的正是 WebDAV。已确认 OpenAPI 的域名、鉴权、
  token 有效期（30 天 / 最多 3 个）与逐接口 QPS 上限。
- 仍然阻塞：`PROPFIND` 深度语义、href 形态、路径规范化（大小写 / NFC-NFD /
  尾随空格）、专用密码的权限边界、三个 endpoint 能否用独立凭据隔离 ——
  **都需要真实凭据实测**，文档里查不到。
- 是否存在短期直传：官方只提到「断点续传与并行上传」，无「匿名直传」表述。

### ~~1Password~~ —— 已改用 macOS 钥匙串（ADR-024、SEC-001）

- 个人版不支持 Service Account，改用 `apiKeyHelper` + 登录钥匙串。
  读取脚本的退出码即状态（ok/missing/locked/denied/empty/unavailable/unset），
  见 `studio/secrets/keychain.mjs`。
- 仍然成立的一条：钥匙串**锁定或系统睡眠后无法自行解锁**，
  因此无人值守会话不能用需要钥匙串的路径。

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
| **Frees Studio 实现** | ~~零代码~~ → **已建成**：KB-001～KB-011 全部完成，229 项测试 | 该行原记于 2026-09-16，当时属实。现已过期，订正于此 |
| **LM Studio** | **未安装**：无 `/Applications/LM Studio.app`、无 `~/.lmstudio`、无模型缓存目录、1234 端口无监听 | **仍阻塞**：S4 与记忆提取无法对真实本地模型验证，只能用 fixture 或 mock |
| **1Password CLI** | ~~阻塞~~ → **不再是本项目的依赖**（ADR-024 改用钥匙串） | 该行原记的阻塞已不适用；钥匙串方案另有「锁定后无法自解锁」的限制 |
| **`node:sqlite`** | ✅ 可用（Node 26.8.2 内置） | **有利**：本地 SQLite 无需新增原生依赖，S2 可零依赖起步 |
| **`sqlite3` CLI** | ✅ `/usr/bin/sqlite3` | 可用于人工核对与演练 |
| **当前依赖** | 运行时依赖 **0**（Studio 只用 `node:` 内置）；`package.json` 的 6 个 dependencies 全属 Astro 公共站 | 订正：原文「15 个」是当时的快照 |
| **WebDAV 凭据** | 未提供 | **仍阻塞**：I2/I3/I4/R2 无法验证 |

### 需要用户提供的解锁项

1. **LM Studio 安装并加载模型**（或在 S1 中决定改用其他本地推理方案）—— **仍未解锁**。
2. ~~`op` 登录~~ —— **已不需要**（ADR-024 改用 macOS 钥匙串）。
3. **123 云盘的三个 WebDAV endpoint 与最小权限凭据**（Public / Collection / Security 分离）——
   **仍未解锁**，且现在更明确：官方文档没有 WebDAV 的协议说明，
   `docs/research/webdav-provider.md` 第五节列出的未知项只能靠实测回答。
4. ~~确认 Studio 的运行形态偏好~~ —— **已定**（ADR-025：localhost Web）。

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
