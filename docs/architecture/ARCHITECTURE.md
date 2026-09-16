# 总体架构

状态：目标架构；每个外部适配器须在实施前验证

当前实现：Astro 公共站已存在，Studio 及多数平台能力尚未实现

## 1. 系统边界

```text
Public visitor
  → Astro static site
     → published content / generated indexes / optimized media references
     → comments provider
     → controlled public APIs only when required

Owner
  → Frees Studio UI (localhost)
     → Local privileged service
        → SQLite + local media filesystem
        → Git working tree
        → AI provider adapters
        → GitHub adapter
        → WebDAV adapters
        → 1Password adapter
        → build / test / publish orchestration
```

公共站和 Studio 是两个不同的信任域。公共站可以读取已发布产物，不能获得 Studio 的本地数据、
集成凭据或管理能力。

## 2. 组件

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| Astro Site | 静态公开展示、SEO、搜索、RSS、文章/知识生产渲染 | 草稿、密钥、任意管理写入 |
| Studio UI | 创作、配置、状态、预览、备份/恢复入口 | 持久保存明文密钥 |
| Local Service | 文件/DB/Git/供应商调用、权限边界、任务调度 | 公开匿名访问 |
| Content Core | ARTICLE/KNOWLEDGE/PROJECT 模型、转换、验证 | 供应商专属逻辑 |
| Renderer | Studio 预览与 Astro 发布共享的语义渲染规则 | 编辑器状态持久化 |
| AI Gateway | 能力发现、适配、用量、结构化请求、diff 返回 | 自动发布未经审查的事实 |
| Media Pipeline | 原始文件、派生图、元数据、上传、引用 | 把 Downloads 当永久仓库 |
| Integration Layer | GitHub/WebDAV/1Password/评论等适配器 | 将外部 API 形状泄露给核心模型 |
| Backup Engine | 快照、加密、上传、校验、恢复演练 | 保存 1Password 主密码 |

## 3. 推荐仓库形态（实现阶段再最终确定）

```text
apps/
  studio/             # UI 与本地服务，可按技术选择再拆
packages/
  content-core/
  renderer/
  ai-gateway/
  media-core/
  integrations/
  backup-core/
src/                  # 现有 Astro 公共站
docs/
```

在 Studio 技术选型完成前，不为了“看起来像 monorepo”提前搬动现有站点。

## 4. 关键数据流

### 发布

```text
Studio draft → validate → render preview → user approves → generate repository content
→ local quality gates → commit → maintainer push → CI → GitHub Pages → production verification
```

### AI 选区修改

```text
selection + section + document goal + sources
→ provider-neutral request
→ proposed patch + rationale + source gaps
→ diff review
→ accept/reject
→ local persistence
```

### 媒体

```text
local original → hash/media ID → metadata → derivatives → optional public upload
→ stable public reference → Blog/Knowledge/Project reuse
```

### 灾备

```text
SQLite + unpublished files + indexes + non-secret settings
→ manifest → authenticated encryption → Security WebDAV
→ remote verification → scheduled restore test
```

## 5. 架构原则

1. local-first，公开静态站优先，动态能力最小化。
2. 核心模型不绑定外部供应商；所有外部系统通过适配器进入。
3. 预览与发布共享渲染器，避免“双套 CSS/双套语义”。
4. 人工配置覆盖自动补充；已发布内容不依赖实时第三方请求。
5. 写入操作可重试、可审计；危险操作默认拒绝并要求明确授权。
6. 每个新动态端点都先建立 threat model、速率限制、输入约束和负向测试。

## 6. 尚未冻结的技术选择

- Studio 的桌面壳/纯 localhost Web UI 方案。
- SQLite 驱动、迁移工具、任务队列和全文索引实现。
- 公共动态 API 放在 Cloudflare Worker 还是其他现有能力上。
- 123 云盘 WebDAV/OpenAPI 是否支持安全的大文件直传/分片/范围请求。
- 图片派生链路是本地构建、Cloudflare Images、其他服务或组合。

这些必须先完成 `docs/research/OPEN_QUESTIONS.md` 中的验证任务，再写 ADR。
