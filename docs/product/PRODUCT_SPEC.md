# Frees Platform 产品规格

状态：Approved direction / implementation staged

最后更新：2026-09-16

## 1. 产品定义

Frees Platform 不是一个单纯博客主题，而是一套由公开数字档案和本地创作系统组成的个人平台：

1. **FREES / FIELD LOG**：公开的作品、文章、知识、媒体和个人动态入口。
2. **Frees Studio**：只在本机运行的内容、媒体、集成、安全和恢复控制中心。
3. **Knowledge Engine**：有来源、可修订、可学习的公开个人知识系统。
4. **Storage & Recovery**：在 Git、1Password、本地存储和 WebDAV 之间保持清晰边界。

## 2. 成功标准

- 新访客在 5 秒内理解 Frees 是谁、在做什么、最值得看什么。
- 站点看起来属于 Frees 本人，而不是换了内容的 Astro/SaaS 模板。
- 写作者只需专注内容；元数据、预览、媒体、验证、Git 和发布流程由工具辅助。
- Blog 与 Knowledge 的本地预览复用生产渲染器，发布前所见即所得。
- 外部资料进入 Knowledge 前保留来源、冲突和审查状态，不把 AI 当作事实来源。
- 丢失当前电脑后，可在不依赖旧电脑的情况下恢复非公开工作状态。
- 公开前端、Git 历史、日志和浏览器存储中没有长期密钥。

## 3. 使用者

- **公开访客**：阅读文章/知识、查看作品/媒体、发表评论、按授权下载公开资源。
- **Frees（Owner）**：在 Studio 中写作、研究、编辑、配置、发布、备份和恢复。
- **资料提交者**：通过独立收集页提交文件与说明，只管理当前临时会话，不能看他人数据。

## 4. 公共站：FIELD LOG

### 4.1 必须保留

- Astro 静态架构、现有内容集合与 17 篇历史文章原文。
- 可行范围内的既有 URL、canonical、RSS、sitemap、robots、Pagefind 搜索。
- 深浅主题、键盘操作、清晰焦点、reduced motion、AA 对比度、响应式布局。
- Giscus/现有讨论能力、历史站点展馆和只读归档边界。

### 4.2 首页

按编辑优先级组织，而不是按数据库分类统计组织：

1. Identity Hero：Who / What / Why / Where next
2. Selected Work
3. Featured Writing / Research
4. Recent Notes
5. Current Signal / Interests
6. Minimal Colophon

标签与分类是检索系统，不是首页主视觉。禁止大面积玻璃拟态、渐变字、发光球、Bento 卡片墙、
无意义统计和所有卡片统一上浮的模板动效。

### 4.3 内容与栏目

- `INDEX / WORK / NOTES / ARCHIVE / ABOUT / GITHUB ↗` 为一级导航语义。
- 旧 URL 保留，栏目由数据字段与标签回退解析，不能靠硬编码文章白名单。
- Project 的人工配置是权威；GitHub 数据只作构建期补充并允许人工覆盖。
- Friends 由结构化数据维护，可选抓取 RSS；首页不变成朋友圈。
- Transformer 超长内容改为枢纽页与章节页，但必须设计兼容 URL、锚点和迁移验证。

### 4.4 文章渲染系统

- Markdown 只表达语义，统一渲染器负责 H1–H4、正文、引用、代码、表格、图版、题注、callout。
- 中文与英文有独立的可读性调优；目录按标题数量降级，超长文不生成数百项 sticky TOC。
- 自动生成目录、阅读进度、引用和响应式媒体；预览复用同一渲染器。

## 5. Frees Studio

### 5.1 边界

- Studio 是 local-first 控制中心，不部署成不受限制的公开后台。
- 日常配置应能在 Studio 界面完成；界面可调用本地特权后端。
- “前端可配置”不意味着密钥可以交给浏览器或写入前端配置。
- 草稿、研究任务、未发布批注、编辑状态和必要的 AI 会话状态重启后仍可恢复。

### 5.2 统一智能文档编辑器

支持 `ARTICLE / KNOWLEDGE / PROJECT`，提供：

- 大纲、结构化内容块、Markdown/富文本适配、代码、公式、表格、图片、文件和引用。
- 生产渲染器预览与发布前验证。
- AI sidecar 理解文档、章节、选区、邻近上下文和用户意图。
- 选区修改只作用于授权范围，返回可接受/拒绝的 diff，不静默覆盖无关内容。
- 文件导入先成为来源材料，再选择“生成文章草稿/知识材料/提取概念/总结/分析”等动作。

### 5.3 AI 提供商

- 写作、研究、审查、生图是可替换适配器。
- 优先支持 OpenAI-compatible 接口，并为 OpenAI、Anthropic、DeepSeek、Gemini、OpenRouter、
  自定义端点及未来本地模型保留扩展位。
- 支持模型、端点、能力与用量配置；不得把供应商特性写死进编辑器核心。

## 6. 媒体与照片

- 上传和生成的原始文件获得稳定 media ID，进入统一、可配置的本地媒体根目录。
- 保存来源、尺寸、hash、生成提示/模型（适用时）、公开状态和远端对象信息。
- 公开图像使用缩略图/中图/展示图与 `srcset`，列表懒加载，lightbox 再加载大图。
- 原图只在明确请求时获取；删除文章不得自动删除可能被外部引用的公共资源。
- GPS EXIF 默认移除；保留原创归档的处理策略需由用户配置。

## 7. Knowledge Engine

- 知识页公开可读，形态更接近个人教材、技术手册和学习路径，而不是普通博客标签页。
- 支持主题、概念、前置知识、关联、反向链接、来源、引用、修订与搜索。
- AI 流程：研究计划 → 已有知识查重 → 资料收集 → 来源质量评估 → 冲突检测 → 草稿 →
  主张/来源校验 → 人工审查 → 发布。
- 重要事实可追溯；冲突来源显式呈现，不编造共识。
- 公开批注支持 NOTE / IMPORTANT / QUESTION / CORRECTION / EXAMPLE / UPDATE / WARNING。
- 选区修改若引入无来源事实，标记 `SOURCE GAP` 并建议补充研究。
- 每个知识页可使用既有 Giscus/Discussions 基础设施承载讨论。

## 8. WebDAV、Vault 与 Collection

- **Public WebDAV**：公开大文件、音乐、文档和 Vault；公共页面不得获得 WebDAV 凭据。
- **Collection WebDAV**：资料收集数据；每次提交独立命名空间，访客间严格隔离。
- **Security WebDAV**：只保存客户端先加密的灾备包，不保存动态密钥。
- 大文件优先采用控制面与数据面分离；具体直传能力实施前按官方资料验证。
- Collection 支持独立 `/collect/<id>` 和内容嵌入；刷新后不应暴露上次提交历史。

## 9. 安全、密钥与恢复

- 1Password 是长期密钥权威；Studio 保存 `op://...` 一类引用，不保存明文密钥。
- Owner OTP/TOTP 只用于认证，绝不作为备份或内容加密密钥。
- 备份使用成熟的认证加密方案；密钥放在 1Password，禁止自创密码学。
- 备份覆盖 Git 无法重建的内容：Studio 数据库、草稿、未发布知识/批注、研究状态、媒体索引、
  非秘密配置与待办状态。
- 恢复流程通过 Studio 的 `RESTORE EXISTING` 完成校验、解密、数据库恢复、连接重建和健康检查。
- 1Password 自身 Emergency Kit/恢复材料必须有独立离线副本，不能只存在 1Password 内。

## 10. 发布与运维

- 保留 GitHub Pages + 现有 Cloudflare 相关配置，确认真实边界后再调整，不迁移供应商。
- 每次发布前执行格式、lint、Markdown lint、类型检查、构建、HTML、token、无障碍、浏览器和安全检查。
- Dependabot 安全更新优先，但必须查看公告、兼容性、CI 和浏览器回归，不能盲目合并。
- 当前仓库规则：代理可在验证后主动 commit，**不得 push**；维护者审核后手动推送上线。

## 11. 明确非目标

- 不一次性同时开发所有模块。
- 不把公开 Astro 站改成通用 SPA 管理系统。
- 不让公共页面实时依赖 GitHub、WebDAV 或 AI API 才能完成基本渲染。
- 不伪造项目、朋友、访问量、专业经历、来源或研究结论。
- 不修改 `archives/` 和 `public/history/` 中的只读历史内容。
- 不在供应商能力未验证前承诺特定 API、限额、直链或存储行为。
