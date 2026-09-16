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
5. 回到本机，把新 key 存进钥匙串（**不要**写回 settings.json）：
   ```sh
   sh scripts/automation/store-credential.sh
   ```
6. 体检并切换，然后重启 Claude Code：
   ```sh
   sh scripts/automation/switch-to-keychain.sh --check
   sh scripts/automation/switch-to-keychain.sh
   ```

> 顺序很重要：先建后删，反过来会让当前会话立刻失效。
> 第 5 步的输入是隐藏的，密钥不经过聊天、命令行参数或 shell 历史。
> 本文件与任何记录都**不要**写入新 key 的值。

---

## 二、凭证注入方案

### 当前状态（问题所在）

`~/.claude/settings.json` 直接保存明文 token。
Claude Code 从该 `env` 块读取环境变量启动，**不支持 `op://` 引用语法**，
因此不能只靠改这个文件实现「只存引用」。

### 结论（2026-09-16 实测更新）

**采用方案 C：`apiKeyHelper` + macOS 钥匙串**，磁盘上零明文。

个人版 1Password **不支持 Service Account**（需 Business/Teams/Enterprise，
且官方文档明确它不能访问内置 Personal / Private 保管库 —— 个人版只有这类库），
因此转向钥匙串。实测细节见下一节。

### 方案 C —— apiKeyHelper + 钥匙串（当前采用）

```jsonc
// ~/.claude/settings.json
{
  "apiKeyHelper": "/绝对路径/scripts/automation/api-key-helper.sh",
  "env": { "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic" }
  // 注意：ANTHROPIC_AUTH_TOKEN 必须删除
}
```

- 密钥只存在于钥匙串条目与进程内存，**配置文件里只有脚本路径**
- 不需要改变启动方式，正常 `claude` 即可
- 由 `scripts/automation/` 下的四个脚本管理：存入 / 读取 / 体检 / 切换

### 实测记录（本地回环探针，12 次真实请求）

| 机制 | 填充的请求头 |
| --- | --- |
| `apiKeyHelper` 输出 | `X-Api-Key` |
| `ANTHROPIC_AUTH_TOKEN` | `Authorization: Bearer` |

两者**彼此独立**，同时存在时各填各的头。而 DeepSeek 的 Anthropic 兼容端点
**两者都接受**（有效 key 用任一方式均非 401；无效 key 用任一方式均 401）。
因此 `apiKeyHelper` 可以用于 DeepSeek —— 这一点与「DeepSeek 只认 Authorization」
的常见说法不同，是实测结论。

**另一个反直觉的实测结论**：`settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN`
**覆盖进程环境变量**。验证方式是把进程环境设成假值、不带 `--settings` 运行，
模型仍正常回复 —— 说明用的是文件里的值。
**只要明文还留在 settings.json 里，任何环境变量注入都不会生效。**
这正是切换脚本必须先删除明文的原因。

### 方案 A —— 交互式注入（备选）

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

### 方案 B —— 1Password Service Account（已排除）

**个人版不支持。** 服务账户需要 Business / Teams / Enterprise 计划；
且官方文档明确它不能访问内置 Personal、Private、Employee 保管库与默认 Shared 保管库 ——
个人版只有 Personal/Private，即便功能存在也无库可用。

不擅自升级套餐，因此排除。

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

## 四、凭证明文清除状态

| 位置 | 状态 |
| --- | --- |
| `~/.claude/settings.json` | **仍含明文** —— 待你轮换后由 `switch-to-keychain.sh` 移除 |
| 项目工作区 / Git 历史 | 干净（已全量扫描） |
| 会话记录 | 6 个文件含旧值，待轮换后失效 |

## 五、待办

- [ ] 你：在 DeepSeek 控制台**先建新 key，再删旧 key**
- [ ] 你：`sh scripts/automation/store-credential.sh` 存入新 key（隐藏输入，不经聊天）
- [ ] 你：`sh scripts/automation/switch-to-keychain.sh --check` 体检后执行切换
- [x] `check-secrets.mjs` 已接入提交前校验
- [x] 自动化提交路径的敏感路径黑名单已实现并实测
- [x] Stop hook 已改为失败时不回退到个人身份
