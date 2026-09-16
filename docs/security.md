# 安全与凭证卫生

> 本文件**不得记录任何密钥明文**，只记录位置、性质与处置方式。

## 一、2026-09-16 密钥暴露事件

### 事实

`~/.claude/settings.json` 的 `env` 块里有一个明文 API token，
Claude Code 在诊断「无人值守环境」时把它打印到了会话记录中。

| 项 | 值 |
| --- | --- |
| 归属 | **DeepSeek**（`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`） |
| 形态 | `sk-` + 32 位十六进制，长度 35 |
| 字段名 | `ANTHROPIC_AUTH_TOKEN` |

### 扩散范围（实测，不输出内容）

| 位置 | 命中 |
| --- | --- |
| `~/.claude/settings.json` | **1 处**（唯一的持久化位置） |
| 项目工作区（含未跟踪文件） | 0 |
| 项目 Git 历史（321 个提交） | 0 |
| `~/.zshrc` / `.zprofile` / `.profile` | 0 |
| `~/.claude/projects/` 会话记录 | **6 个文件** |

会话记录那 6 个文件跨了 3 个项目目录
（`Develop/Frees-Ling.github.io`、`Develop/android`、`~`），
说明更早的会话里也打印过，**不止本次**。

git 历史按 5 类密钥形态全量扫描（`sk-` / `ghp_` / `gho_` / `AKIA` / PEM 私钥）
结果均为 **0** —— 密钥从未进入版本控制。

### 严重性判断

**中等，不是公开泄露。** 理由：

- 记录文件权限为 `600`（仅本人可读），目录 `755`
- 不在 iCloud / Dropbox / OneDrive 等同步目录内
- 未被推送到任何远端；git 历史干净
- token 的使用端点就是签发方 DeepSeek 本身，不存在「第三方因此获得访问权」

**真实风险**是本地文件面：Time Machine 快照（当前 1 个本地快照）、
磁盘镜像、机器被他人物理接触、以及**将来分享或导出会话记录**。
因此处置是「轮换 + 收敛」，不是「紧急止血」。

### 轮换步骤（需你在服务商控制台操作）

1. 登录 `platform.deepseek.com`
2. 进入 **API Keys**
3. **先新建**一个 key 并复制（避免中间出现无可用 key 的窗口）
4. 回到列表，**删除**旧 key —— 可用前缀 `sk-a08…` 辨认
5. 用新 key 替换 `~/.claude/settings.json` 中的 `ANTHROPIC_AUTH_TOKEN`
6. 替换完成后重启 Claude Code

> 顺序很重要：先建后删。反过来会让当前会话立刻失效。
> 本文件与任何记录都**不要**写入新 key 的值。

---

## 二、凭证注入方案

### 当前状态（问题所在）

`~/.claude/settings.json` 直接保存明文 token。
Claude Code 从该 `env` 块读取环境变量启动，**不支持 `op://` 引用语法**，
因此不能只靠改这个文件实现「只存引用」。

### 方案 A —— 交互式注入（推荐，日常使用）

```sh
op run --env-file="$HOME/.claude/claude.env.op" -- claude
```

`claude.env.op` 内容形如：

```text
ANTHROPIC_AUTH_TOKEN=op://Private/DeepSeek/credential
```

- **磁盘上只有引用，没有明文**
- 代价：必须用这条命令启动 Claude Code；1Password 需处于解锁状态
- 与现在的 `op-ssh-sign` 前提相同 —— 你本来就依赖 1Password 解锁来签名

### 方案 B —— 无人值守

`op` 在无人值守下**只有两条路**，都需要先验证：

| 途径 | 前提 | 状态 |
| --- | --- | --- |
| 服务账户（`OP_SERVICE_ACCOUNT_TOKEN`） | 需要 1Password **Business / Teams** 计划；个人与家庭版不支持 | **待你确认计划类型** |
| 桌面应用集成 | 应用保持解锁 | 与 `op-ssh-sign` 同样的限制，不构成改进 |

若计划不支持服务账户，则「用 1Password 支撑无人值守」在原理上不成立 ——
此时诚实的结论是：无人值守要么退回到 600 权限的本地文件，
要么使用一个**权限与额度受限的专用 key**，把风险限制在可接受范围。

**当前版本尚未实施 A 或 B**，因为 A 会改变你的启动方式、
B 取决于计划类型。等你决定后再落地。

### 与提交签名的对照

值得注意：**提交签名那条路径已经不需要 1Password 了**（见 ADR-016），
因为自动化提交用的是本地专用密钥。真正还依赖 1Password 的只剩凭证注入这一处。

---

## 三、仓库侧的密钥防线

| 防线 | 机制 |
| --- | --- |
| 归档只读 | `archives/`、`public/history/` 由 deny 规则 + `protect-paths.sh` 阻止写入 |
| 提交前扫描 | 见第四节 —— `check-secrets.mjs` |
| 提交身份 | 自动化身份独立，不冒用个人签名（ADR-016） |
| 不落盘清单 | API key、WebDAV 密码、Cloudflare/GitHub token、TOTP seed、备份密钥一律不得进入 Git、前端、SQLite 明文、浏览器存储、日志、截图或测试夹具 |

## 四、待办

- [ ] 你：在 DeepSeek 控制台轮换密钥（第二节步骤）
- [ ] 你：确认 1Password 计划类型，决定方案 A / B
- [ ] 我：`check-secrets.mjs` 接入提交前校验（进行中）
- [ ] 我：自动化提交路径的路径黑名单（禁止提交密钥、数据库、备份）
