# Frees Blog / Frees Platform

[![Quality](https://github.com/Frees-Ling/Frees-Ling.github.io/actions/workflows/quality.yml/badge.svg)](https://github.com/Frees-Ling/Frees-Ling.github.io/actions/workflows/quality.yml)
[![Deploy](https://github.com/Frees-Ling/Frees-Ling.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/Frees-Ling/Frees-Ling.github.io/actions/workflows/deploy.yml)

Frees Ling 的个人数字花园、公开作品档案与本地优先创作工具。

- 网站：[frees-ling.dev](https://frees-ling.dev)
- 源码：[Frees-Ling/Frees-Ling.github.io](https://github.com/Frees-Ling/Frees-Ling.github.io)
- 文档总入口：[docs/README.md](docs/README.md)
- 当前状态：[docs/execution/STATE.md](docs/execution/STATE.md)
- 任务清单：[docs/execution/TASKS.md](docs/execution/TASKS.md)

## 项目是什么

这个仓库同时承载两个边界清晰的产品面：

1. **Frees Blog**：使用 Astro 生成的公开静态站，收纳文章、项目、研究、音乐与生活记录，
   部署到 GitHub Pages。
2. **Frees Studio**：仅在本机运行的编辑、知识、记忆、媒体与备份工具。它遵循 local-first
   边界，不把 Owner 管理界面直接发布到公网。

目前公共站、文章渲染、全文搜索、响应式图片和 Studio 的核心数据层已经有真实实现；外部集成、
公开媒体派生物、完整恢复与部分研究流程仍在持续建设。不要从 README 猜测进度，最新证据以
[STATE](docs/execution/STATE.md)、[TASKS](docs/execution/TASKS.md) 和当前测试结果为准。

## 核心能力

### 公开站

- Astro 静态生成、RSS、Sitemap、Pagefind 全文搜索
- 文章、主题、标签、项目、研究、归档与历史站点
- 深浅主题、键盘导航、移动端布局与自动化无障碍检查
- 统一文章渲染管线、稳定锚点、长文目录与内容覆盖检查
- Astro Assets 响应式图片、独立 OG 图与资源预算门禁

### 本地 Studio

- 本地知识库的创建、编辑、检索、导入与导出
- AI 对话、引用注入、草稿边界与供应商中立网关
- 长期记忆的审核、纠正、冲突标记、可见性与来源追溯
- 原始档案的增量导入和内容寻址媒体库
- 加密备份、WebDAV 传输、回读校验与保留策略
- 钥匙串引用、密钥泄漏检查和仅回环地址可用的 Owner 界面

这些能力的准确边界、限制和未完成项记录在[产品规格](docs/product/PRODUCT_SPEC.md)与
[总体实施计划](docs/execution/MASTER_PLAN.md)中。

## 快速开始

### 环境要求

- Node.js：版本见 [`.nvmrc`](.nvmrc)
- 包管理器：npm
- macOS/Linux；Studio 的部分钥匙串能力目前面向 macOS

### 安装与启动公开站

```bash
npm ci
npm run dev -- --background
```

后台开发服务器可通过 Astro CLI 管理：

```bash
npx astro dev status
npx astro dev logs
npx astro dev stop
```

生产构建：

```bash
npm run build
```

构建结果位于 `dist/`，同时生成 Pagefind 搜索索引。

### 启动 Studio

```bash
npm run studio -- status
npm run studio -- start
```

Studio 默认只绑定回环地址。配置、凭证、备份和恢复方式请先阅读
[安全与凭证卫生](docs/security.md)和[知识库说明](docs/knowledge-base.md)，不要把真实密钥写入命令、
仓库、测试夹具或浏览器存储。

## 开发与验收

日常改动至少执行：

```bash
npm run format:check
npm run lint
npm run lint:md
npm run check:tokens
npm run check:content
npm test
npm run check
npm run build
npm run check:html
npm run check:assets
```

按改动风险补充专项检查：

| 命令 | 检查内容 |
| --- | --- |
| `npm run check:tasks` | 任务重复、依赖缺失与依赖环 |
| `npm run check:coverage` | 文章内容和渲染覆盖完整性 |
| `npm run check:preview` | Studio 预览与公开站渲染一致性 |
| `npm run check:offline` | 断网环境能否完成构建 |
| `npm run check:secrets -- --all` | 全部已跟踪文件中的敏感路径和密钥形态 |
| `npm run verify:secrets` | 数据库、目录、浏览器与仓库三面泄漏验证 |
| `npm run a11y` | axe-core 与键盘可达性 |
| `npm run gate` | 路由、视口、对比度、溢出与控制台错误 |

完整验收范围见[测试矩阵](docs/execution/TEST_MATRIX.md)和
[发布检查清单](docs/execution/RELEASE_CHECKLIST.md)。

## 仓库结构

```text
.
├── src/                  # Astro 公共站：页面、组件、内容、样式与共享渲染逻辑
├── studio/               # 本地 Studio：数据、AI、记忆、媒体、备份、服务与界面
├── scripts/              # 构建检查、视觉门禁、自动化与维护脚本
├── docs/                 # 产品、架构、决策、任务、研究与专项设计文档
├── public/               # 直接发布的静态资源
├── public/history/       # 只读历史展馆
├── archives/             # 只读旧工程与历史资料
└── .github/workflows/    # 质量检查与 GitHub Pages 部署
```

文章源文件位于 `src/content/posts/`。历史归档位于 `archives/` 和 `public/history/`，两处均为
只读边界，不得为了格式化、依赖升级或重构而修改。

## 文档阅读路线

第一次进入仓库时依次阅读：

1. [当前状态](docs/execution/STATE.md)
2. [持久任务清单](docs/execution/TASKS.md)
3. [总体实施计划](docs/execution/MASTER_PLAN.md)
4. [产品规格](docs/product/PRODUCT_SPEC.md)
5. 当前任务对应的架构、研究或设计文档

全部文档的用途、权威层级和更新规则见 [docs/README.md](docs/README.md)。聊天记录不是长期真相源；
如果文档与代码冲突，应先核对代码、Git 历史与测试，再修正文档并记录决定。

## 贡献边界

- 使用 npm，不混用归档旧工程里的 pnpm lockfile。
- 不格式化 `.astro`；相关原因与 Biome 例外见 [`AGENTS.md`](AGENTS.md)。
- 颜色字面量只允许出现在 `src/styles/tokens.css`。
- 不提交密钥、数据库、备份、私有媒体或本机配置。
- 完成任务时同步更新 `TASKS.md`、`STATE.md`，重大决定写入 `DECISIONS.md`。
- 提交信息使用中文并说明“为什么”；除非维护者明确授权，否则不要 push。
- 任何项目链接、仓库、成果和身份信息必须可核实，不得用占位链接伪装已完成。

更完整的协作规则见 [`AGENTS.md`](AGENTS.md)。

## License

代码与仓库材料的使用范围以 [`LICENSE`](LICENSE) 为准。文章、图片、音乐和个人内容不因源码公开
而自动放弃其原有权利。
