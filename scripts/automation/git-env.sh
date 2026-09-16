#!/bin/sh
# 给任意 git 命令套上「自动化身份 + 无 1Password 签名」。
#
# 用法（在 sh/bash 里）：
#   . scripts/automation/git-env.sh
#   git commit -m "..."
#
# 为什么用环境变量 + 命令行参数，而不是改配置文件：
#   改 .git/config 或 ~/.gitconfig 会同时影响你手动执行的 git 命令 ——
#   你手写的提交会突然变成自动化身份，个人签名也不再生效。
#   这里的方式只作用于**当前这次命令**，退出即失效。
#
# 注意：本文件必须被 source，不能直接执行（直接执行只会改子进程的环境）。

# ---------- 身份 ----------
GIT_AUTHOR_NAME='Frees Blog Automation'
GIT_AUTHOR_EMAIL='automation@frees-ling.dev'
GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL

# ---------- 签名 ----------
# 用系统自带的 ssh-keygen，而不是 1Password 的 op-ssh-sign：
# 后者需要应用处于解锁状态，无人值守时不可靠。
AUTOMATION_KEY="${HOME}/.ssh/frees_blog_automation_ed25519"
if [ ! -f "$AUTOMATION_KEY" ]; then
  echo "✗ 找不到自动化签名私钥：$AUTOMATION_KEY" >&2
  echo "  生成：ssh-keygen -t ed25519 -N '' -C 'frees-blog-automation (commit signing only)' -f $AUTOMATION_KEY" >&2
  return 1 2>/dev/null || exit 1
fi

# signingkey 必须是**私钥路径**，不能是公钥字符串。
#
# 实测：传公钥字符串（`ssh-ed25519 AAAA...`）会让 ssh-keygen 去 SSH agent 里找对应私钥，
# 而 agent 里通常没有它，于是报 `error: Couldn't find key in agent?`。
# 传私钥路径时 ssh-keygen 直接读文件，不经过 agent —— 这正是无人值守需要的。
#
# 顺带说明：也**不要**把它写成 `~/.ssh/id_ed25519`，那会签成个人身份。
GIT_AUTOMATION_SIGNINGKEY="$AUTOMATION_KEY"

# 供调用方把参数传给 git。用函数而不是别名，方便在脚本里组合。
git_automation() {
  git \
    -c gpg.format=ssh \
    -c gpg.ssh.program=ssh-keygen \
    -c user.signingkey="$GIT_AUTOMATION_SIGNINGKEY" \
    -c commit.gpgsign=true \
    "$@"
}
export GIT_AUTOMATION_SIGNINGKEY
