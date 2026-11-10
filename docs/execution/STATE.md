# 2026-11-10 Google 真实验收发现隐私门禁失败

PR122 已获准发布且部署成功；开发分支 3915d34 的 Quality 42748630336 通过。实际生产诊断 42749020765 的构建、隐私、SDK 夹具、浏览器及无障碍步骤通过，但真实 SDK 阶段 FAIL：同意后官方 SDK 返回 200、收集接口返回 204，page_view 却包含公开诊断参数 ?qa=analytics-release，不符合去除查询参数的承诺。不得用夹具结果覆盖该失败，GA4 后台入库仍 NOT_VERIFIED。

本次仅扩充诊断证据：分别保存同意前、HTTP 回执、实际页面参数及撤回结果，并核对排队命令中的页面参数；参数断言移到撤回检查后，最终仍须严格通过原断言。生产脚本保持已批准字节，未发布新版本。下一步根据真实排队命令与网络差异修复并准备独立批准的生产候选。

Google 11 月 8 日邮件确认根域自 11 月 6 日起有搜索展示；11 月 9 日另报“备用网页（有适当的规范标记）”，受影响网址列表仍待后台读取，不能未经核对就移除 canonical。AdSense 欧洲法规消息页实际显示创建入口，未见已配置消息；网站审核最新通知仍为未达到要求，未提交复审或启用广告。

---

# 可选统计获准发布，真实SDK验收准备

所有者已专项批准博客PR122精确候选4cd16724884e1107cce42021d232368a5215a168。已约束匹配HEAD合并为9b605b667b031989a97c8b8aafb4207a1fad1a56，生产流水线42352768947全部成功。线上首页、friends、guestbook、now、privacy及统计脚本均200，新摘要已存在，privacy的统计资格false，脚本SHA256与批准源码逐字节一致。未发布Hub、启用广告、付费推广或AdSense复审。

Chrome自动化页面接口仍失败，不能用源码/夹具宣称真实Google收数成功。本次仅新增显式手动触发的云端生产SDK诊断：固定自有正式根域、核对获批脚本哈希、同意前无Google请求、真实官方SDK及收集端HTTP回执、一次清理查询/片段的page_view、撤回后的零请求/清Cookie。只保留去敏请求主机/路径与公开诊断字段，不保存CID/SID/Cookie。GA4后台入库仍独立NOT_VERIFIED；诊断访问不计自然增长。无新依赖、凭据或资源，现有完整门禁保留。新诊断代码待云端格式/质量与实际执行，不含新的生产发布。

---

# 中文字体云端复验候选

5eed49d的完整Quality 42350165533、Visual 42350177589成功，但人工截图复核发现中文方框，因此中文视觉验收未完成。所有者已专项批准仅为临时GitHub Actions runner安装fonts-noto-cjk及复验。候选保留全部原有门禁，并新增中文标题实际使用CJK字形断言；不改本机、网站依赖、生产统计或广告。完整检查及四张截图待新精确提交云端复验。

---

# 根域 Google 关联完成与自愿统计开发候选

PR121 精确候选625b439已获所有者独立批准并合并为e4c22e692dedefffb3757604ee78868c527474c8；Quality 42205091715及生产部署42206406815成功。官方HTML验证文件线上200。Chrome已完成根域Search Console验证、站点地图处理；首页已收录，topics仅已请求索引，不能宣称全站收录。

Frees Blog 独立GA4资源562903338、网站流16285933099（G-005T1QD6Z3）已建立，增强型衡量已关闭并读回。所有者专项批准后，根域Search Console关联已提交，Google列表回读“已成功建立关联”。当前生产没有博客GA4 SDK，真实事件尚未验收。

本次仅开发自愿统计候选：同意前不加载Google标签，广告始终拒绝；支持拒绝、撤回、跨标签同步和180天到期，去除页面查询/片段并仅保留来源域名。13项定向单元测试通过；完整质量和隔离SDK浏览器契约待GitHub Actions。后者不是Google真实收数验收。新候选尚未批准生产发布，不包含广告启用或AdSense复审。详见[GA4候选说明](../ga4-blog-readiness-20261106.md)。下方保留历史记录。

---

# 2026-11-06 根域 Search Console 验证候选（尚未发布）

所有者已批准添加并验证 `https://frees-ling.dev/` URL前缀资源，未批准DNS或额外生产文件发布。Chrome已进入官方验证流程；Google Analytics方法实际失败：Google未在首页找到跟踪代码。已下载Google提供的HTML验证文件，原样放入public；仅为公开所有权标记，不加载脚本、不启用广告或统计。文件发布需另行批准，根域验证/站点地图提交仍未完成。完整测试继续交GitHub Actions，本机仅比较下载原件与候选字节。

此前已批准的PR119精确候选d90da61已合并为37b706f9e26a6f52587dc8e707b92136318a0dc8，生产部署42168716563成功；候选Quality 42167779530及Visual Quality 42167865981成功。公共HTTPS已核对隐私、阅读路线、两篇提示、ads.txt和66个站点地图URL。AdSense仍低价值内容；未复审、未启用广告。下方保留历史失败与迭代记录。

---

# 2026-11-06 品牌名称完整性续修

b7c4f41的Quality 42167193142通过，Visual 42167232635的浏览器质量通过，但axe仍在14个页面报告brand名称不匹配；项目仓库链接已不再报错。先前只对齐作者名的修正不完整。新候选让brand可访问名称直接来自完整可见内容F/L及Frees Ling，移除覆盖名称的aria-label及标记上的aria-hidden；“返回首页”改为补充title。保留原有可见排版与链接、axe规则及所有路由，待新精确提交云端验证。

---

# 2026-11-06 读屏名称修复候选

76fb507完整Quality 42166535889通过；Visual 42166548507的浏览器质量门禁通过，但axe发现14个路由报告label-content-name-mismatch，主要是共用brand把可见Frees Ling替换为Frees Blog，项目仓库链接也有不匹配。候选将brand标签与实际可见作者名对齐，仓库说明改为title以保留可见文字作为链接名称。不屏蔽规则，待新候选完整Quality/Visual复验。GitHub compare已确认本PR未修改17篇原文与只读历史；本地缺少main对象，不用无效本地比较冒充证据。

---

# 2026-11-06 浏览器覆盖补充

将本批实际变更的两篇文章 qa / yolo-train-recommand 加入既有浏览器门禁及axe默认路由，并把新增阅读路线的topics加入axe。保留首页及所有原有路由、视口和阈值；不以未覆盖条件分支的泛化结果宣称新提示已验收。新精确候选质量与完整浏览器结果待运行。

---

# 2026-11-06 浏览器门禁发现与修复候选

46e66fc 的完整Quality 42165639522通过，但完整Visual Quality 42165875252确实FAIL：首页featured卡片在浅蓝底上有5处次要文字对比度不足。路由、导航、溢出、键盘、控制台检查通过；无障碍后续阶段未运行，不能标PASS。候选只在featured卡片内将次要文字映射到已有正文色，兼顾日期、摘要和标签；不改全局颜色、不降低对比度门禁。待新候选云端完整复验。

---

# 2026-11-06 AdSense 收益链路优先更新

所有者要求优先解决实际 Google 收益阻塞。Chrome 的 AdSense 首页已核实“收款：您的资料已完整”“广告：已确认广告设置”，不能再根据顶部通用激活横幅推断收款资料缺失。网站仍“需要注意 / 低价值内容”，ads.txt 后台仍未找到；不能标记可投放。

本批在既有主题页加入真实标注→配置随记→环境排错阅读路线，逐篇说明边界；两篇原文页面补充环境与短记录范围提示，不修改原文、旧 URL、日期或只读归档，不增添虚构经历、实验结果或硬件建议。轻量内容契约通过，仍有原有4项栏目警告。候选完整质量、HTML和渲染验证待PR119云端运行；未提交复审、未开启广告、未发布生产。

---

# 2026-11-03专项现场更新

当前实际分支 `gemini/blog-consent-ads-hardening-20261018`，审查起点6c48c35。下方9月历史记录保留，不能当作当前分支/验收状态。

所有者授权该目录参与Hub/根域AdSense低价值内容整改。当前本地候选：移除无条件广告SDK（保留验证meta/ads.txt）、自制授权弹窗改为原生隐私说明、补隐私与Hub入口、文章原始日期/作者结构化数据、搜索/404索引排除。17篇原始Markdown及历史归档未改。完整状态见[专项报告](../adsense-remediation-20261103.md)。所有者已单独批准推送当前开发分支、创建PR与云端检查；未批准生产发布。

轻量格式/语法、token与内容契约检查已执行；token/内容存在基线警告，未称零诊断。Biome因缺少本机cli-darwin-arm64模块失败，未安装依赖绕过。完整质量/浏览器/构建NOT_RUN，按所有者Local-Lite+Remote-Heavy要求由已获批准的开发分支PR在GitHub验证。

---

# Current Project State

Updated: 2026-09-17

Branch: `main`

Verified starting HEAD: `b120946`（`首页编辑化重构：首屏改为身份区，建立编辑物结构`）

## Current phase

W1 收口 → W2 — Article Renderer

## Current task

无进行中的任务。

本轮完成的是**治理收口**（GOV-003 / GOV-004 / GOV-005）：
部署改为依赖质量、Stop hook 不再无条件 `add -A`、lint 归零。
在此之前完成的是 MEDIA-001（本地媒体库）与 PERF-001（图片与字体管线）。

## Last known implementation state

- 公共 Astro 站、17 篇文章和两代历史展馆已存在。
- 重设计 P0–P3、P5a、P5c 已完成并**通过最终回归**（WEB-006 DONE，提交 `2b61609`）。
- 记忆与密钥的增量需求已并入现有计划（`a21c093`），三个缺口补为 MEM-001 / ARCH-001 / ACCESS-001。
- 站点 chrome 已是 FIELD LOG 语言：masthead + colophon，无圆形徽章 / 光晕 / 胶囊。
- 首页已按 Identity → Work → Writing → Notes → Signal 重构（WEB-007 DONE），首屏可答 Who/What/Why。
- 列表已收敛为单一编排器 PostList，栏目由 `src/data/sections.ts` 驱动，无硬编码白名单（WEB-008 DONE）。
- 文章渲染器契约已确立（RENDER-001 DONE），见 `docs/article-renderer.md`。
- Transformer 分章设计已定（RENDER-002 DONE），见 `docs/transformer-chaptering.md`：
  采用**页内分章**（不拆 URL）；实测结构为 109 h1 / 471 h2 / 71 h3（修正了 RENDER-001
  按源码 grep 得出的错误数字）。内容覆盖率闸门 `npm run check:coverage` 已可用。
- 页内分章已落地（RENDER-003 DONE）：正文标题在渲染期下移，页面标题成为唯一 h1
  （改动前 transformer 有 110 个），650 个锚点哈希逐字未变；长文目录按章节折叠、
  当前章跟随。`.md` 一个字节未改。
- 知识库存储层（K0）与服务层（KB-001 DONE）已实现，40 项测试通过；
  服务只绑 127.0.0.1、令牌鉴权、无任何发布到公网的路由。
- 本地编辑界面（KB-002 DONE）可用：登录、列表、阅读、编辑、新建、删除、检索、双主题。
  界面复用 tokens.css，未引入前端框架；有真实浏览器验收脚本。
- 模型适配层与模拟推理服务（KB-003 DONE）已就绪：默认只允许本机端点，
  非本机必须显式 allowRemote；AI 回答只能存为 ai_draft 草稿。
- AI Studio（KB-004 DONE）可用：对话、引用注入、存为草稿，
  有真实浏览器验收脚本（模拟推理服务，不依赖本机是否装 LM Studio）。
- 长期记忆引擎选型已定：自建，不引入第三方（ADR-023，研究见 docs/research/memory-engines.md）。
- 记忆审核界面（KB-006 DONE）可用。
- 语义检索（KB-007 DONE）：嵌入默认指本机 LM Studio，端点不可用时降级为关键词；
  向量存本地 SQLite，不引入向量数据库。
- 完整导出/导入与向量重建（KB-008 DONE）：导出不含向量、导入只接受空库、
  重建全算完才落库以避免半新半旧。
- 本地媒体库（MEDIA-001 DONE）：内容寻址 id + 迁移 v10，原子落盘与崩溃恢复。
  EXIF 策略是**原图保留、派生物一律不含元数据** —— 分界是「哪个文件会离开
  这台机器」。实测推翻三点：`.withMetadata(false)` 反而保留 EXIF、
  `withMetadata()` 往返会**造出** EXIF 块（使检测恒真）、GPS 不能靠搜字节判定
  （大端相机会漏报）。29 项测试，判据各自做过变异验证。
- 图片与字体管线（PERF-001 DONE）：母版移入 `src/assets/` 不再进产物，改走
  `astro:assets` 响应式多档 —— 照片墙宽图从「任何视口都下 1196 KB」变为
  桌面 51 KB / 手机 24 KB。OG 图独立生成（1200×630，102 KB，不带哈希的固定
  路径）。字体维持系统栈 0 字节，新增闸门守住「只许 KaTeX 一族、不许外链」。
  新增 `check:assets` 与 `check:offline`（断网真跑一次构建）。
- 研究与审查流水线（KNOW-002 DONE，迁移 v11）：来源**按域名**分级
  （不让调用方自填等级）、查重复用记忆层的 `dedupKeyOf`、冲突由人显式标记、
  校验只报告不改动。「AI 不可绕过人工发布」写成库层 CHECK 约束而非应用层约定 ——
  踩到 SQL 三值逻辑：`decided_by = 'human'` 在 NULL 时求值为 NULL、**不算违反约束**，
  必须用空值安全的 `IS`，这是被自己的用例抓到的。
- 命令行入口（KB-009 DONE）：status / start / export / import / rebuild，`npm run studio`。
- 加密备份格式（KB-010 DONE）：AES-256-GCM + scrypt，口令不落盘。
- 备份传输层（KB-011 DONE）：WebDAV 上传 → **回读校验** → 保留策略（默认 dry-run、
  永不删最后一份）。CLI 有 `backup` / `restore` / `retention`。
  已用真实 WebDAV 服务端（wsgidav）做过端到端验证，不只是 mock。
  **尚无真实凭证**，托管服务的认证/配额/限流等失败模式未验证。
- 三层关联（KB-005 DONE）：记忆可追溯到来源消息/档案并关联知识库条目；
  删除来源不销毁结论；统一检索排除待审核记忆。
- 凭证走 apiKeyHelper + macOS 钥匙串，磁盘零明文；读取带 5 秒看门狗（ADR-020/024）。
  读取脚本的退出码即状态（SEC-001）。
- 导航与页脚合计覆盖全部结构性路由；旧 URL 与大小写行为均已验证。
- Studio 技术选型已定并记录（STUDIO-001 DONE，ADR-025）：localhost Web +
  Node 内置能力，**运行时第三方依赖为 0**。
- 本地数据层已验证（STUDIO-002 DONE）：schema 版本与迁移、事务、重启恢复、
  备份一致性，全部在**真实文件库 + 跨进程**下测过。
- 配置与 secret reference（STUDIO-003 DONE，ADR-026）：普通配置在界面里改，
  敏感项**库里只存引用**（环境变量或钥匙串），界面里没有密码输入框。
  实测库文件、数据目录、浏览器存储、DOM 均无明文。
- 凭据引用解析与泄漏扫描（SEC-001 DONE）：钥匙串读取有七个明确状态
  （ok/missing/locked/denied/empty/unavailable/unset），每条都说明下一步做什么；
  描述状态**不读值**。三面扫描 `npm run verify:secrets` 覆盖磁盘/浏览器/仓库，
  且敏感性经过植入验证。
- Owner 认证威胁模型已定（SEC-002 DONE，`docs/security-threat-model.md`）：
  **不做公网 Owner mode**；本地场景下成立的两条威胁（DNS rebinding、猜令牌）
  已修并测。会话无细粒度撤销，撤销手段是轮换令牌后重启。
- 任务清单本身纳入闸门（`npm run check:tasks`）：查重复条目、悬空依赖、依赖成环。
  起因是 TASKS.md 里出现两块 STUDIO-002（一块 DONE、一块过期的 BACKLOG），
  而所有读取方按名字取最后一次 —— 于是 STUDIO-002 被判为未完成，
  连带堵住 EDITOR-001 → KNOW-001 → ACCESS-001 整条链。同一次检查还发现
  5 处依赖字段不可机器解析（中文顿号、散文）。
- 统一文档模型与生产预览（EDITOR-001 DONE）：渲染管线抽取为公开站与 Studio
  预览的共用真相源；`npm run check:preview` 逐字比对预览与发布（17 篇一致）；
  稳定 block ID 三种文档类型共用、产物零影响；Studio 侧预览接入，
  编辑会话存库、**关掉服务再起来未保存的草稿一字不少**。
- 供应商中立网关（AI-001 DONE）：能力声明（必填，按能力挑供应商）、
  重试（只重试可自愈的失败、带抖动、取消不重试）、用量按供应商累计
  （端点不回 usage 时给 null 而不是 0）。两个行为不同的 fixture 验中立性。
  尚未接进对话路由。
- AI 选区 diff 协议（EDITOR-002 DONE）：边界权威（越界即整份作废、不做部分应用）、
  陈旧检测、source gap 结构化字段、422 拒绝理由。生成与界面仍未做。
- 原始档案层（ARCH-001 DONE）：增量/去重/幂等的导入（Markdown、结构化 JSON、
  目录），去重判据是 **(来源, 内容)** —— 同一段文字来自两份文档各留一条，
  否则来源会无声消失。不抓取、不跟随符号链接。CLI `archive` 子命令。
- 外部 AI 访问（ACCESS-001 DONE）：核实结论是**「仅凭 API Key 就能让 ChatGPT
  访问本地知识库」不成立**（不接受贴 key、必须公网 HTTPS、要付费套餐）。
  真正的交付是受限访问身份：具名、有范围、可撤销、可审计，
  默认拒绝 + 只存哈希。MCP 服务器与隧道路径记为后续任务。
- 知识层已建立（KNOW-001 DONE）：`sources` / `prerequisites` / `related` 三个
  可选内容字段 + `src/utils/knowledge.mjs` 的反链索引 + 文章页「知识坐标」。
  全部来自人工声明，不做标签推断（ADR-019）。悬空引用是 error。
  **三个字段目前全为空** —— 填充是内容决策，不是工程任务。
- 长期记忆服务已建立（MEM-001 DONE，`docs/memory-service.md`）：三层分离、
  追加式纠正、去重与冲突标记、可见性、自动提取开关。31 项测试。
- Studio 的 WebDAV 集成尚未接进界面（当前只有 CLI 路径）；
  Collection 与灾备恢复 UI 尚未实现。

## Current objective

W1 / W2 / W3 已完成；M1 差一项（公开派生物），W4 未开工。
当前最高杠杆是 **WEBDAV 链**：`WEBDAV-001`（官方资料与受控测试）已完成，
但它下游的 6 项全部卡在 `CRED-001`（用户提供三个 endpoint 与凭据）上。

## Next READY task

与 `docs/execution/TASKS.md` 一致（`npm run check:tasks` 可核验）。当前可开工的 7 项：

| 任务 | 优先级 | 说明 |
| --- | --- | --- |
| `CRED-001` | P0 | **执行者是用户**：提供 WebDAV 三个 endpoint 与最小权限凭据 |
| `CONTENT-001` | P1 | 内容发布契约（连带解锁 INTEG-001/002） |
| `MEDIA-002` | P1 | 响应式公开派生物 |
| `KNOW-002` | P1 | 研究与审查流水线 |
| `MEDIA-003` | P2 | AI 生图适配器 |
| `KNOW-003` | P2 | 公开批注与讨论 |

> 这张表**不再手写下一步是什么** —— 上一版写的是 `EDITOR-001`，而它早已完成，
> 于是文档在指向一个不存在的工作。现在只列由 `check:tasks` 算出来的可开工项，
> 口径与任务清单同源。

`WEBDAV-002` 及其下游 6 项**不在**此表：它们等 `CRED-001`。

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
- 视觉方向为「书房」，单一蓝色相 + 中文优先；知识地图改为主题总览（ADR-019）。
- 无人值守提交使用独立自动化身份，不依赖 1Password（ADR-016）。
- 密钥闸门 check-secrets 覆盖路径黑名单与内容特征，不回显匹配内容。
- 栏目归属以数据决定，人工 `section` 字段优先于标签推断（ADR-014）。
- 组件 frontmatter 保持薄，派生逻辑放 `src/utils/`（ADR-015）。
