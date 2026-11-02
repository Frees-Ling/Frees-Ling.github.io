# 根域 AdSense / SEO 整改 — 2026-11-03

工作区/分支：/Users/freesling/Develop/Frees-Ling.github.io，gemini/blog-consent-ads-hardening-20261018，原HEAD6c48c35。所有者已提供并授权本目录；不新建工作树，不重置改动，不改17篇原文和只读归档。

## 问题与修复候选

- Layout原先无条件载入AdSense，未Ready/认证CMP的外部证据；已移除SDK，保留真实pub验证meta和ads.txt。未来广告启用仍需Google实际审核与独立审批，不保证本次内容整改通过。
- 原自制modal读取本地granted并允许广告/分析四项授权，不能替代认证CMP；改为原生dialog说明当前禁用状态、第三方评论/媒体和本地主题。旧存储值不授权未来广告，未删除用户本地数据。
- 新privacy页面描述真实范围，区分主站、独立历史快照和Hub子域；保留联系邮箱。页脚增加可抓取的隐私与Hub入口，无法律模板/公司/客服资质冒充。
- 文章BlogPosting与OG日期使用原frontmatter的published/updated，真实作者来自site.owner；日期没有造假。JSON-LD转义小于号，canonical不带查询串，分享字段完整。
- search/404 noindex、sitemap过滤对应路径；保留爬取以便发现noindex，不用robots阻断替代noindex。
- 扩充check-html真实构建检查：canonical、描述、广告SDK关闭、JSON-LD解析和文章作者日期、索引边界。只读历史不参与新模板校验。

## 验证与限制

受影响非Astro文件Prettier已执行（按AGENTS不格式化.astro）；token/内容契约通过，伴随181项token警告、4篇文章未归类警告，未隐瞒。Biome失败：Cannot find module '@biomejs/cli-darwin-arm64/biome'，未安装依赖或绕过规则。AST/HTML最终构建、全部质量命令及浏览器测试尚未执行，不能声明CODE_COMPLETE/Ready。

所有者要求完整测试交GitHub；本仓库AGENTS另有“不要push——维护者审核后手动推送”。所有者已单独批准推送当前开发分支并创建PR，用现有Quality运行完整检查；不会推main或触发Pages生产部署。署名/提交保留1Password SSH机制。原始回滚点6c48c35；失败可review后revert本批，不改写历史。

Hub专项总证据位于/Users/freesling/Develop/Google/docs/adsense-remediation/。Google唯一已确认拒审原因是后台“低价值内容”；上述技术/隐私问题是独立审查结果，不能说Google已确认这些是拒审的全部原因。当前暂不建议复审。

官方参考：[Article结构化数据](https://developers.google.com/search/docs/appearance/structured-data/article)、[Astro sitemap过滤](https://docs.astro.build/en/guides/integrations-guide/sitemap/)、[AdSense内容体验](https://support.google.com/adsense/answer/10015918)。


## 远端复核与安全门禁

签名候选9327a75后，仅将与6c48c35完全相同文件树的远端主线隐私基线3f7b343合入开发分支，解决历史add/add冲突；合并提交072b296没有代码树差异，不改写历史。PR119当前可合并但未合并。完整Quality [41501475056](https://github.com/Frees-Ling/Frees-Ling.github.io/actions/runs/41501475056)已成功，包括真实构建与新增HTML门禁；不代表新增依赖安全门禁已通过。

GitHub默认分支31项依赖告警含11高危，已读取官方Dependabot元数据并对照当前锁文件：Astro7.3.1、undici8.10.2、vite8.2.2、devalue5.9.2、sharp0.35.4等确实处于报告范围。新增现有Quality中的独立只读依赖审查：审当前精确锁文件，若失败则仅在GitHub内生成既有版本范围的锁文件候选与audit证据，不执行生命周期/安装、不自动写仓库、不降低high阈值。原始失败仍阻止通过。候选需独立审阅后再应用；默认分支告警与静态生产实际可利用性也不能混为一谈。


远端审查41501843775：当前候选锁文件npm audit为9高危（与Dependabot按条数/数据库统计不同，不混为同一计数）；既有范围更新降至1高危，唯一剩余markdown-it15.0.1被markdownlint-cli2 0.23.3精确固定。官方GHSA-gfr2-rv44-r23c修复范围为15.0.3及以上。审查策略仅为同一15.0.x补丁加入override，不回退/force/弱化阈值；仍保留smol-toml override。先云端生成/复审最终候选再应用。完整Quality依赖安全门禁成功后执行，避免已知高危重复消耗构建额度。


最终远端候选41502462957已审阅：只有package.json overrides新增markdown-it同一15.0.x安全补丁范围，其余字段不变、无新增直接依赖；178个已解析包版本变化、16个新增传递包，全部resolved仍为registry.npmjs.org。候选audit为0高/0严重/0中，仍有6低危，未声称零漏洞。本机未安装这些更新。应用候选后仍须最新精确SHA完整Quality通过，先前41501475056不能替代更新后的测试。
