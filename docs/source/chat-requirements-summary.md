# 共享对话需求整理

来源：用户提供的 [ChatGPT 共享对话](https://chatgpt.com/share/6aaa3e67-9c48-83ec-8ee8-a2f5933e3b4a)，
读取并整理于 2026-09-16。

此文件是产品发现材料的摘要，不是独立的执行真相源。正式需求以
[`../product/PRODUCT_SPEC.md`](../product/PRODUCT_SPEC.md) 为准。

## 解释规则

1. 仓库当前可验证事实优先于对话中的旧假设。
2. 后出现的明确决定覆盖早期脑暴。
3. 供应商能力、价格、限额和 API 行为必须实施前重新查官方资料。
4. 对话中“可自主推送/部署”的设想不覆盖当前 `AGENTS.md` 的“不 push”约定。
5. 未提供的个人经历、项目数据、朋友资料和密钥不得编造。

## 已确认方向

- 公共站采用 **FREES / FIELD LOG**：数字野外记录簿 × 工程日志 × 个人档案 × 独立杂志。
- 公共首页优先展示身份、Selected Work、Featured Writing、Recent Notes 和 Current Signal，
  不再以标签云或同质文章卡片为主角。
- 公共站继续使用 Astro，并保留现有 URL、文章、SEO、RSS、搜索、站点地图和历史展馆。
- 建设只在本地运行的 **Frees Studio**，日常配置与内容生产通过界面完成。
- Blog、Knowledge、Project 共用一个智能文档编辑器和生产渲染器；AI 修改必须提供可审查差异。
- AI 写作、研究、审查和生图供应商可替换；密钥不进入公开前端、Git、SQLite 明文或日志。
- 原始媒体统一保存在可配置的本地根目录，公开站只加载响应式派生图，原图按需获取。
- Knowledge 是公开可读的个人教材/技术手册；本地 Studio 提供编辑、研究、批注和 AI 协作。
- 公开批注属于知识内容的一层；每个知识页可接入评论/讨论。
- 朋友、项目和内容发布均应由数据与自动化驱动，人工覆盖永远优先于外部元数据。
- WebDAV 分成三种能力边界：Public（公开只读资源）、Collection（隔离收集）、Security（加密灾备）。
- 访客收集必须服务端隔离，任何访客不能列举或读取其他人的提交。
- 1Password 是长期密钥权威；Studio 只保留引用。123 云盘 Security WebDAV 只保存加密灾备包。
- 新电脑应能通过 Studio 的 Restore Existing 流程恢复非公开工作状态并重新连接服务。

## 已被后续决定覆盖的想法

| 早期想法 | 最终边界 |
| --- | --- |
| R2 是照片系统必需依赖 | R2/Cloudflare Images 仅是候选；先评估现有 123 云盘与本地派生图链路 |
| Knowledge 批注默认私有 | 批注可发布；草稿仍可只保存在本地 |
| 两个 WebDAV | 三个能力域：Public / Collection / Security |
| Studio 自己保存动态密钥 | 1Password 统一保存，Studio 只保存引用 |
| OTP 同时承担恢复/加密 | OTP/TOTP 只用于认证，不作为数据加密密钥 |
| 依赖 Notion/CMS 发布 | 采用与仓库共生的 local-first Studio |
| 一个巨大提示词维护项目 | `AGENTS.md` 导航 + 结构化 docs + 可验收任务 + 自动化闸门 |

## 当前仓库校正

- 活跃站点源码已在仓库根目录，不是旧 `Blog-v2` 子目录。
- `archives/` 与 `public/history/` 是只读历史归档。
- 公共站重设计已完成 P0–P3、P5a，并提交 P5c；不能从零重做。
- 当前生产权威经仓库记录为 GitHub Pages；Cloudflare 的准确角色仍需在发布架构审计中确认。
