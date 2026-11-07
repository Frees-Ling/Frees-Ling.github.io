# Frees Blog GA4 自愿统计候选

## Google 后台已完成

现有Frees账号下新建独立资源562903338、网站流16285933099，公开衡量ID为G-005T1QD6Z3，网址https://frees-ling.dev。增强型衡量关闭并已读回。所有者单独批准后，根域Search Console关联列表显示“已成功建立关联”；根域验证及站点地图处理成功。首页已收录；topics仅收到请求索引回执，其他URL不能宣称已收录。私有截图存放在Hub的test-results/google-remediation，不提交账号个人资料。

## 候选行为

仅https://frees-ling.dev精确来源的可索引公开页面允许加载；隐私、搜索、历史、预览和错误页不加载。显式同意前无Google标签或同意状态请求，旧授权键不迁移为同意。允许与拒绝具有同等入口，页脚可改选。授权最多180天；存储不可用时仅当前页内存选择。撤回、跨标签拒绝/清空、到期会停用指定衡量ID，删除本博客统计Cookie并在已加载标签时重新载入。其他Cookie不删除，已传输数据不因此自动删除。

统计仅发送一次明确page_view，禁用自动page_view、Google Signals及广告个性化，广告相关同意均为denied。传输前删除URL查询和片段，来源仅保留origin；使用主机隔离fl_blog Cookie及有限有效期。SDK故障显示失败，无自动重试。隐私面板不宣称广告认证CMP。

## 验证边界

本机仅执行13项定向Node测试及语法检查，不安装依赖或运行完整CI/构建/浏览器。完整Quality和Visual交GitHub Actions。新增浏览器测试用真实构建页面、拦截全部第三方请求并以本地SDK夹具代替Google，覆盖明暗主题与390/1280宽度、键盘同意、去敏、去重、撤回和axe；此结果不能证明真实Google事件入库。

本机缺少Prettier，独立云端format-review只输出精确基线SHA和格式补丁，需审查后应用，不代替质量检查。所有现有门禁保留。

## 上线门禁与未完成项

当前生产没有此博客统计SDK。候选完成云端检查后，需所有者独立批准精确提交及自愿统计发布，再验证官方SDK请求、拒绝时零请求、撤回及GA4实时事件。尚无本批生产发布批准。广告保持关闭、AdSense仍低价值内容、后台ads.txt仍待刷新；不提交复审，不承诺收益或全站收录。

## 官方依据

- [Consent mode概念](https://developers.google.com/tag-platform/security/concepts/consent-mode)：采用显式同意前不加载标签的基本模式。
- [同意状态设置](https://developers.google.com/tag-platform/security/guides/consent)：先默认拒绝，再根据选择更新。
- [隐私参数与停用](https://developers.google.com/tag-platform/security/guides/privacy)：指定衡量ID停用、关闭Google Signals/广告个性化及自动page_view。
- [Cookie参数](https://developers.google.com/tag-platform/security/guides/customize-cookies)：前缀、域、期限与更新行为。
