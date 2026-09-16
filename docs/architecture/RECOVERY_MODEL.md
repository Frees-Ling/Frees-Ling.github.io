# 灾备与迁移计划

## 目标

在旧电脑完全不可用时，新电脑仍可恢复 Git 无法重建的创作状态，并重新连接外部服务。

## 备份范围

- Studio SQLite 及 schema version
- 草稿、未发布知识、未发布批注、研究任务和编辑器恢复点
- 媒体索引与必要的本地非公开文件（按配置纳入）
- 非秘密配置、集成引用、计划/待办状态和恢复说明
- manifest、文件 hash、应用版本、迁移版本

不包含：1Password 主密码、明文 API key/WebDAV 密码、可从 Git/公开远端可靠重建的缓存。

## 备份流程

1. 暂停写入或获取一致性快照。
2. 生成版本化 manifest 与 hash。
3. 使用 1Password 中的备份密钥执行认证加密。
4. 上传到 Security WebDAV 临时对象。
5. 验证大小/hash（能力允许时）并读取回测。
6. 在隔离目录解密，检查 manifest、SQLite 和必需文件。
7. 标记 verified 后进入保留策略；失败对象不替代上一份健康快照。

候选保留：latest + daily×7 + weekly×4 + monthly×12；在测量真实体积后冻结。

## 新机恢复流程

```text
Install/clone → open Studio → RESTORE EXISTING
→ unlock/connect 1Password
→ resolve Security WebDAV reference
→ list verified snapshots
→ download to temporary directory
→ retrieve backup key
→ verify/decrypt/migrate
→ restore database and files
→ reconnect integrations
→ run health checks
→ show migration report
→ switch active workspace
```

任何失败都保持旧/空工作区不变，并给出可操作错误。

## 恢复验收

- 从一台干净测试环境完成至少一次端到端恢复。
- 恢复后草稿、知识、批注、媒体索引、配置引用与任务状态一致。
- Git 工作树与公开产物不会被旧备份悄悄覆盖。
- 集成需要重新授权时清楚提示；不能伪造“已连接”。
- 每个备份显示最后验证时间；从未恢复测试的备份不能标记 Fully Verified。

## 1Password 引导边界

Studio 不能成为恢复 1Password 账号的前提。Emergency Kit、Secret Key、主密码和官方恢复机制
应独立于本平台保存并定期验证。
