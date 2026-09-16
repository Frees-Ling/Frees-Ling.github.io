# 数据模型计划

本文件定义稳定的领域概念，不锁定具体 ORM。

## 1. 文档

### Document

- `id`：稳定 UUID/ULID，不使用可变化标题作为主键
- `type`：`ARTICLE | KNOWLEDGE | PROJECT`
- `slug`、`title`、`summary`、`language`
- `status`：`DRAFT | REVIEW | PUBLISHED | ARCHIVED`
- `createdAt`、`updatedAt`、`publishedAt`
- `contentVersion`、`schemaVersion`
- `sourceIds[]`、`mediaIds[]`
- `publicationTarget` 与已发布 Git revision

内容块需要稳定 `blockId`，以支持公开批注、选区 AI 修改和合理编辑后的引用迁移。

## 2. 来源与主张

### Source

- 来源类型、标题、作者/机构、URL/本地文件、访问日期、内容 hash
- 权威等级与使用许可备注
- 抽取文本位置、页码或章节信息

### Claim

- 所属 document/block
- 主张文本或结构化摘要
- 关联 source 与定位
- 状态：`SUPPORTED | CONFLICTED | SOURCE_GAP | REVIEWED`

## 3. 批注与讨论

### Annotation

- 稳定 ID、documentId、blockId、anchor 信息
- 类型：NOTE / IMPORTANT / QUESTION / CORRECTION / EXAMPLE / UPDATE / WARNING
- `visibility`：LOCAL / PUBLIC
- 生命周期与修订记录

外部评论只存映射/缓存元数据，身份和讨论正文的权威仍属于评论提供商。

## 4. 媒体

### MediaAsset

- 稳定 media ID、内容 hash、MIME、尺寸、时长、原始文件位置
- 来源：UPLOAD / GENERATED / IMPORTED
- EXIF 处理状态、生成模型/提示/参数（适用时）
- 衍生版本及用途
- 远端对象、公开 URL、引用计数/反向引用
- 生命周期：ACTIVE / ORPHAN_CANDIDATE / ARCHIVED / DELETED

“删除文章”只减少引用，不直接删除远端媒体。

## 5. Studio 与 AI

### WorkspaceState

- 最近打开文档、编辑器布局、未提交操作、恢复检查点

### ProviderProfile

- provider type、endpoint、model、capabilities、secret reference
- 不含 API key 明文

### AIJob

- 任务类型、输入上下文摘要、provider/model、状态、输出补丁、用量、错误
- 按隐私设置决定是否保留完整对话

## 6. 集成与存储

### StorageEndpoint

- 类型：PUBLIC / COLLECTION / SECURITY
- URL、canonical root、能力、secret reference、最后健康检查
- 不含密码明文

### Collection / Submission

- Collection 定义上传规则、有效期、公开嵌入配置
- Submission 使用不可预测 ID 与独立命名空间
- Visitor session token 只授权当前提交，不能列举其他提交

### BackupSnapshot

- snapshot ID、schema version、manifest hash、对象位置、大小、创建/验证时间
- 加密算法参数（不含密钥）、恢复测试状态

## 7. 迁移纪律

- 所有持久化 schema 有版本号、向前迁移和备份前置步骤。
- 破坏性迁移先复制/快照，再在副本演练。
- 公开内容 schema 与 Studio 私有 schema 分开演进，通过显式发布转换连接。
