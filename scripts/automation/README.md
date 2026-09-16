# 无人值守提交身份

## 为什么需要它

本仓库的提交签名依赖 1Password（`gpg.ssh.program = op-ssh-sign`）。
1Password 锁定时签名失败，**提交直接中断**：

```text
error: 1Password: failed to fill whole buffer
fatal: failed to write commit object
```

无人值守任务不能依赖一个需要人解锁的进程，但也不能因此取消签名
或冒用个人身份。所以拆成两条互不干扰的路径：

| 场景 | 身份 | 签名器 | 需要 1Password |
| --- | --- | --- | --- |
| 你手动提交 | `Frees Ling <139055876+Frees-Ling@users.noreply.github.com>` | `op-ssh-sign` | 是 |
| 自动化提交 | `Frees Blog Automation <automation@frees-ling.dev>` | `ssh-keygen` | **否** |

两者的配置互不覆盖：**全局 `~/.gitconfig` 与 `~/.claude/settings.json` 未被修改**，
本仓库的 `.git/config` 也未被修改。自动化身份只通过命令行参数注入。

## 密钥

- 私钥：`~/.ssh/frees_blog_automation_ed25519`（无口令）
- 公钥：`~/.ssh/frees_blog_automation_ed25519.pub`

这把密钥**只用于本地提交签名**：

- 未加入 GitHub（不是 deploy key），不能读写任何仓库；
- 未加入 `~/.ssh/authorized_keys`，不能登录任何主机；
- 不参与 GitHub 的 SSH 身份验证 —— 那条路径用的是 `~/.ssh/id_ed25519`，
  **本来就不经过 1Password**。

无口令是有意的：无人值守意味着没有人在场输入口令。它的权限被限制在
「为本地提交签名」，即便泄露也不能用于访问任何远端。

## 用法

```bash
# 提交（替代 git commit）
./scripts/automation/commit.sh -m "提交信息"
./scripts/automation/commit.sh -F -   # 从 stdin 读

# 只输出环境变量与参数，不执行（用于调试）
./scripts/automation/commit.sh --print-env
```

`sh scripts/automation/git-env.sh` 是底层实现，可被其他脚本 source，
用来给任意 git 命令套上自动化身份：

```bash
. scripts/automation/git-env.sh
git log --format='%h %an <%ae>' -1
```

## 验证

```bash
# 身份是否为自动化身份
git log --format='%h %an <%ae>' -1

# 签名是否有效（用自动化公钥校验）
tmp=$(mktemp -d)
printf '%s %s\n' "automation@frees-ling.dev" "$(awk '{print $1" "$2}' ~/.ssh/frees_blog_automation_ed25519.pub)" > "$tmp/allowed"
git -c gpg.ssh.allowedSignersFile="$tmp/allowed" verify-commit HEAD
```

## 一个踩过的坑

`gpg.format=ssh` 时 `user.signingkey` **必须是私钥路径**，不能是公钥字符串
（`ssh-ed25519 AAAA...`）。传公钥时 ssh-keygen 会去 SSH agent 找对应私钥，
找不到就报：

```text
error: Couldn't find key in agent?
fatal: failed to write commit object
```

传私钥路径时 ssh-keygen 直接读文件，不依赖 agent 是否在运行、里面有没有身份。

## 边界

- **不改变 push 策略**：当前规则仍是维护者审核后手动推送（ADR-010）。
  自动化身份解决的是「提交」，不是「发布」。
- 若将来需要无人值守推送，优先评估**单仓库 Deploy Key** 或权限受限的 GitHub App，
  而不是把个人密钥交给自动化。步骤见 `docs/execution/DECISIONS.md` 的 ADR-016。
