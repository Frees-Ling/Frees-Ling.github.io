# Current Project State

Updated: 2026-09-16

Branch: `main`

Verified starting HEAD: `afce569` (`修复视觉脚本静态服务器的大小写盲点`)

## Current phase

W1 — FIELD LOG public-site completion

## Current task

WEB-006 — P5c Site Chrome 最终回归

## Last known implementation state

- 公共 Astro 站、17 篇文章和两代历史展馆已存在。
- 重设计 P0–P3、P5a 已完成。
- P5c Site Chrome 已提交；`docs/redesign-progress.md` 仍标记“待最终验收”。
- 视觉静态服务器已补充大小写精确检查（`afce569`），应纳入 WEB-006 路由回归。
- Studio、Knowledge Engine、WebDAV 集成、Collection 和灾备 UI 尚未实现。

## Current objective

在不开始新视觉功能的前提下，对提交 `17d3e9a` 完成多视口、双主题、键盘、路由与浏览器闸门回归，
修正 `docs/redesign-progress.md` 中剩余的实际状态。

## Next READY task

WEB-006 完成后进入 WEB-007 — 首页编辑化重构。

## Blockers / human decisions

- GitHub Pages `https_enforced` 与 Cloudflare 真实生产边界需在发布变更前确认。
- 任何付费供应商、域名/DNS、公开管理端点和外部账号权限变更都需用户明确批准。
- 当前规则禁止代理 push；上线由维护者审核后手动推送。

## Recent binding decisions

- Astro 公共站继续作为静态发布面。
- Studio local-first，日常配置走 UI，秘密归 1Password。
- 三类 WebDAV：Public / Collection / Security。
- R2/Cloudflare Images 不是必需依赖，先做供应商能力研究。
- 公开批注允许发布；OTP 只认证、不加密。
