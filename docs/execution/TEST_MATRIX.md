# 测试矩阵

## 当前公共站门禁

| 层级 | 命令/方式 | 触发 |
| --- | --- | --- |
| 格式 | `npm run format:check` | 每次提交 |
| TS/CSS/JSON lint | `npm run lint` | 每次提交 |
| 文章 Markdown | `npm run lint:md` | 每次提交 |
| Design tokens | `npm run check:tokens` | 样式/组件/页面；CI |
| Astro/TypeScript | `npm run check` | 每次提交 |
| Build + Pagefind | `npm run build` | 每次提交 |
| HTML 结构 | `npm run check:html` | build 后 |
| 无障碍/键盘 | `npm run a11y` | UI/语义改动 |
| 浏览器综合闸门 | `node scripts/visual/gate.mjs` | 主要 UI 改动 |
| 截图 | `npm run shot` | 主要 UI 改动，按路由/视口/主题比较 |

AGENTS 要求的五项基础命令全部必跑；专项脚本按改动风险叠加，不能用“基础五项通过”替代视觉或安全验收。

## UI 视口

主要界面至少覆盖：1440×900、1280×800、1024×768、768×1024、430×932、390×844、360×800，
深浅主题各一次；检查布局、横向溢出、焦点、键盘、reduced motion、控制台与网络资源。

## 未来模块最低测试

| 模块 | 单元/属性 | 集成 | 端到端/安全 |
| --- | --- | --- | --- |
| Renderer | 语义节点、sanitize、slug/anchor、fixture snapshot | Astro 与 Studio 同输入同输出 | 中英文、公式、代码、超长文、恶意 HTML |
| Studio persistence | schema/migration/事务 | 崩溃与重启恢复 | 干净安装、升级、降级失败不损坏 |
| AI Gateway | adapter contract、结构化输出 | 超时/取消/重试/用量 | 越界选区、prompt injection、secret redaction |
| Media | hash、去重、EXIF、派生 | 本地/远端上传与引用 | 原图不首屏请求、孤儿资产 dry-run |
| WebDAV | capability、路径规范化 | 只读/读写/失败/Range | traversal、编码绕过、权限最小化 |
| Collection | token/namespace/limits | 上传替换删除、过期 | 跨用户读取/列举/修改全部失败、滥用限流 |
| Knowledge | graph、claim/source、查重 | 研究→审查→发布 | 冲突来源、source gap、AI 不得越过审查 |
| Backup | manifest、encryption envelope | 上传回读、解密、DB 校验 | 干净环境完整恢复、错误密钥/损坏包不覆盖 |

## 证据格式

每个 DONE 任务至少记录：运行命令与结果、关键测试名称、UI 截图/观察（适用时）、安全负向用例、
已知限制和 commit。结构检查不能冒充真实听感、人工审美或生产部署验证。
