# Current Project State

Updated: 2026-09-16

Branch: `main`

Verified starting HEAD: `0519dba` (`docs: 建立长期计划真相源避免需求漂移`)

## Current phase

W1 — FIELD LOG public-site completion

## Current task

WEB-007 — 首页编辑化重构

## Last known implementation state

- 公共 Astro 站、17 篇文章和两代历史展馆已存在。
- 重设计 P0–P3、P5a、P5c 已完成并**通过最终回归**（WEB-006 DONE）。
- 站点 chrome 已是 FIELD LOG 语言：masthead + colophon，无圆形徽章 / 光晕 / 胶囊。
- 导航与页脚合计覆盖全部结构性路由；旧 URL 与大小写行为均已验证。
- Studio、Knowledge Engine、WebDAV 集成、Collection 和灾备 UI 尚未实现。

## Current objective

按 Identity → Selected Work → Featured Writing → Recent Notes → Current Signal
重构首页，使首屏 5 秒内可回答 Who / What / Why。

## Next READY task

WEB-008 — 列表与栏目数据化（依赖 WEB-007）。

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
