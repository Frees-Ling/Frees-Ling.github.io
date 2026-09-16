# Current Project State

Updated: 2026-09-16

Branch: `main`

Verified starting HEAD: `a21c093` (`docs: 建立长期计划真相源避免需求漂移`)

## Current phase

W1 — FIELD LOG public-site completion

## Current task

WEB-008 — 列表与栏目数据化

## Last known implementation state

- 公共 Astro 站、17 篇文章和两代历史展馆已存在。
- 重设计 P0–P3、P5a、P5c 已完成并**通过最终回归**（WEB-006 DONE，提交 `2b61609`）。
- 记忆与密钥的增量需求已并入现有计划（`a21c093`），三个缺口补为 MEM-001 / ARCH-001 / ACCESS-001。
- 站点 chrome 已是 FIELD LOG 语言：masthead + colophon，无圆形徽章 / 光晕 / 胶囊。
- 首页已按 Identity → Work → Writing → Notes → Signal 重构（WEB-007 DONE），首屏可答 Who/What/Why。
- 导航与页脚合计覆盖全部结构性路由；旧 URL 与大小写行为均已验证。
- Studio、Knowledge Engine、WebDAV 集成、Collection 和灾备 UI 尚未实现。

## Current objective

收敛四套文章列表实现，使 Work / Notes / Archive 共用统一编排器，
并让栏目数据驱动、空内容诚实降权。

## Next READY task

RENDER-001 — 文章渲染器审计与契约（依赖 WEB-006，已满足）。

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
