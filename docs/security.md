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

**顺序：先建 → 存入 → 切换 → 验证 → 最后才撤销。**
在旧凭证失效之前，必须先确认新凭证能正常工作。

```sh
# ① 控制台：新建 API Key，复制（此时不要删旧的）
#    platform.deepseek.com → API Keys → 新建

# ② 存入钥匙串（隐藏输入，不进聊天/argv/shell 历史）
sh scripts/automation/store-credential.sh

# ③ 切换到 apiKeyHelper（会备份 settings.json 并移除明文）
sh scripts/automation/switch-to-keychain.sh --check   # 先体检
sh scripts/automation/switch-to-keychain.sh

# ④ 验证新凭证确实可用（不打印密钥，只报状态码）
sh scripts/automation/check-credential.sh
#    再开一个新会话随便问一句，确认真实对话正常

# ⑤ 确认无误后，回控制台删除旧 Key（前缀 sk-a08…）
```

**为什么验证必须在撤销之前**：旧 key 一旦删除就不可恢复。
如果新 key 有问题而旧 key 已删，服务会立刻中断且没有退路。
反过来，多留一会儿旧 key 的代价只是一个已知的、即将失效的凭证。

> **例外：若旧凭证存在实际公开泄露风险，优先撤销。**
> 此时服务可能中断，需要你明确接受这个中断 —— 安全优先于可用性。
> 本项目当前判定为**中等、非公开泄露**（见上文扩散范围），因此走正常顺序。

**关于第 ⑤ 步之后**：旧值会自动失效，那 6 个会话记录里留存的是旧 key，
撤销后不再可用。**不需要**删除会话记录，也**不需要**重写 Git 历史。

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

## 五、自动化脚本的自身安全（2026-09-16 修复）

自动安全审查在本次新增的脚本里发现三条真实缺陷，均已修复并复测：

| # | 缺陷 | 修复 |
| --- | --- | --- |
| 1 | `store-credential.sh` 用 `-w "$KEY"` 把密钥放进**进程参数**（同用户进程可通过进程列表看到），而注释还声称「不经过命令行参数」—— **错误的安全声明** | 实测 macOS `security` **不支持**从 stdin 读密码（`-w -` 会把字面量 `-` 存进去），因此改为把 `-w` 放在参数末位不带值，交给 `security` 自身提示输入：密钥只存在于它自己的内存中，既不进 argv 也不进本脚本的变量。代价是需输入两次（每次轮换才做一次） |
| 2 | `check-credential.sh` 用 `curl -H "Authorization: Bearer $KEY"` 发请求，同样把密钥放进 argv | 改为 `curl -K -`：认证头经 **stdin** 交给 curl。`printf` 是 shell 内建（已实测确认），因此密钥不进入任何进程的参数 |
| 3 | 响应体写入固定的 `/tmp/.credcheck.body` —— 可预测路径可被符号链接攻击，多实例还会互相覆盖 | 改用 `mktemp` + `chmod 600` + `trap ... EXIT INT TERM` 清理 |

修复过程中又发现一个我自己引入的 bug：把 JSON 请求体直接拼进 curl 配置的
`data = "..."` 会因请求体自带引号而破坏解析 ——
表现为「认证明明通过却返回 400」。已改为请求体走临时文件 + `-d @file`。
复测：无效凭证 → 401 / 退出码 1，有效凭证 → 200，无临时文件残留。

**一处未按建议修复的地方**：审查建议「省略 `-w` 让它交互提示」——
实测确认可行，已采纳；但它同时建议的「用 heredoc 经 stdin 传密码」经实测**不可用**，
`security` 没有这条路径。故采用前者。

## 六、无人值守的状态区分（2026-09-17 实测）

四种状态**互不等价**，不能把其中一种测通当作全部可用：

| 状态 | 实测结果 | 影响 |
| --- | --- | --- |
| **1Password 锁定** | ✅ 无影响 | 凭证路径与提交签名都已不依赖 1Password |
| **钥匙串锁定** | ⚠️ **会挂起约 108 秒** | 见下，已用看门狗缓解 |
| **macOS 屏幕锁定** | ⚠️ **未验证** | 不能制造锁屏（会影响你的开发），未测 |
| **Mac 睡眠/重启** | ⚠️ **未验证**，且**预期不可用** | 登录钥匙串随睡眠/重启锁定，无人值守无法自行解锁 |

### 钥匙串锁定：一个原本会表现为「卡住」的缺陷

实测（独立测试钥匙串，不影响登录钥匙串）：

- 解锁时读取：毫秒级
- **锁定时读取：挂起 108 秒**等待 GUI 弹窗，然后返回 128
- `security show-keychain-info` 同样挂起（17 秒），**不能**用作前置探测

无人值守下没有人能点那个弹窗，于是每次取凭证都会阻塞近两分钟 ——
这比直接失败更糟：表现为「卡住」而不是「报错」。

**已修复**：`read-credential.sh` 加了纯 POSIX 看门狗（不依赖 macOS 上没有的
`timeout(1)` 或 perl），默认 5 秒上限，超时即杀掉子进程并明确报告「钥匙串很可能已锁定」
以及解锁命令。用桩程序模拟 `security` 挂起 30 秒验证：2 秒内失败，不再挂起。

修复过程中还发现一个诊断 bug：`if ! cmd; then rc=$?` 里的 `$?` 是**取反运算符**的状态
（恒为 0），超时会被误报成「没有条目」—— 把「钥匙串锁了」说成「没配过」。
已改为 `if cmd; then :; else rc=$?; fi`。

### 对「完全无人值守」的诚实结论

**不能声称已实现完全无人值守。** 准确的表述是：

- 在**钥匙串保持解锁**的前提下（登录后未睡眠），开发与提交可以无人值守运行
- **睡眠或重启后无法自动恢复** —— 需要有人登录解锁钥匙串
- 屏幕锁定状态**未验证**

## 七、待办

- [ ] 你：在 DeepSeek 控制台**先建新 key，再删旧 key**
- [ ] 你：`sh scripts/automation/store-credential.sh` 存入新 key（隐藏输入，不经聊天）
- [ ] 你：`sh scripts/automation/switch-to-keychain.sh --check` 体检后执行切换
- [x] `check-secrets.mjs` 已接入提交前校验
- [x] 自动化提交路径的敏感路径黑名单已实现并实测
- [x] Stop hook 已改为失败时不回退到个人身份
