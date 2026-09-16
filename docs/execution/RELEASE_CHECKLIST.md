# 发布检查清单

当前发布边界：完成本清单并提交后停止；**不 push**，等待维护者审核。

## 变更前

- [ ] 工作区状态已记录，未覆盖用户改动
- [ ] 目标与 `PRODUCT_SPEC.md` 一致
- [ ] 供应商/外部事实已按需重新验证
- [ ] 数据迁移、回滚和安全影响已评估

## 本地验收

- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run lint:md`
- [ ] `npm run check:tokens`
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npm run check:html`（build 后）
- [ ] 风险相关专项测试（a11y / gate / screenshot / security / migration）
- [ ] 公开构建产物无 secret、调试数据、私有路径和意外大文件
- [ ] 旧 URL、RSS、sitemap、search、404 与历史展馆按风险抽查

## 内容与视觉

- [ ] 无伪造个人/项目/来源信息
- [ ] 中英文、移动端、深浅主题和键盘体验已检查
- [ ] 图片尺寸、alt、懒加载与原图请求符合预算
- [ ] 视觉改动至少三轮观察/批评/修正/验证

## Git

- [ ] TASKS/STATE/相关 ADR 已更新
- [ ] 提交只包含本任务相关文件
- [ ] 中文提交信息说明“为什么”
- [ ] 提交签名按现有配置保留并可验证
- [ ] 未执行 push

## 维护者推送后的线上验收

- [ ] GitHub Actions / Pages 成功
- [ ] canonical 域名、HTTPS 与关键路由正常
- [ ] Cloudflare/GitHub Pages 的实际链路与预期一致
- [ ] 线上控制台、资源、搜索、RSS、评论和移动端抽查通过
- [ ] 若严重故障：优先 fix-forward；无法及时修复时正常 `git revert`，不重写历史
