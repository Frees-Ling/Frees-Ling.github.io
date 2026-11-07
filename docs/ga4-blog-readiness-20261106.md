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


## 云端中文字体验收补充

5eed49d的完整Quality 42350165533、Visual 42350177589虽通过，人工查看截图发现中文方框，不能据此标记中文视觉验收成功。所有者已单独批准仅在GitHub Actions临时测试机安装fonts-noto-cjk及复验。工作流增加该安装与字体匹配检查，统计浏览器测试通过Chrome平台字体接口断言中文标题实际使用CJK字形；本机及网站依赖不变。新精确候选须重跑完整Quality/Visual并人工核对四张截图，真实SDK收数仍待获准生产发布后验收。


## 批量公开页面审查与摘要修正

公开站点地图66个唯一URL已逐页完整读取，HTTP、标题非空且不重复、描述非空、canonical精确匹配、单一h1、站点地图不含noindex及广告SDK未启用检查通过。最初21次Python读取发生IncompleteRead，切换完整传输校验的HTTP/1.1客户端重试后完成，初次失败保留在私有报告；不将客户端传输问题宣称为站点缺陷。

发现首页、friends、guestbook、now共用站点默认description。候选为后三页补充与实际可见内容一致的独立摘要，now保留2026年9月时间切片边界，避免伪装实时更新。未改原文、日期、路由或归档。此公开HTML检查不证明Google收录或AdSense通过，新候选仍须云端完整检查及独立发布批准。


## 已批准发布与真实SDK诊断边界

PR122的4cd1672已获所有者专项批准并合并为9b605b667b031989a97c8b8aafb4207a1fad1a56；生产流水线42352768947成功。上线脚本SHA256为6c5abbaa259bd8f4e97ef490943cb8af82ce051fac69fa15a9901799b47ef906，与获批源码一致；三页独立摘要已线上生效，privacy的data-eligible为false。Chrome原生控制仍不可靠，不能声明已手动验收。

新增production_analytics输入仅显式手动触发，在云端Google Chrome访问固定自有公开页面。真实Google SDK与收集HTTP回执不使用夹具；同意前与撤回重载后要求无Google请求。输出删除CID、SID、Cookie和原始URL查询，限制为主机/路径、公开衡量ID、事件名和净化页面地址。测试一次明确同意会产生诊断page_view，不能算作自然增长；HTTP回执不证明GA4后台入库或Google审核通过。默认不运行；不使用账号密钥、生产D1、支付或广告，未开通新资源。此测试代码无需再次部署网站，仍走开发分支完整质量检查。
