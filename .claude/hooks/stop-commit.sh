#!/bin/bash
# Stop hook —— 每轮回复结束时兜底提交工作区改动（绝不 push）。
#
# 与 AGENTS.md 的「提交约定」配套：正常情况下由 Claude 主动写语义化信息并提交，
# 本脚本只负责兜底，避免改动长期滞留在工作区。
#
# 依据 https://code.claude.com/docs/en/hooks ：
#   * Stop 在主 agent 结束本轮回复时触发；用户中断不触发。
#   * Stop 不支持 matcher —— 在 settings.json 里写 matcher 会被静默忽略。
#   * 在 Stop 上 exit 2 = 阻止 Claude 停止并继续对话，会形成死循环。
#     其他非零退出码会在转录里留下 "hook error" 噪音。
#   * 因此本脚本所有分支一律 exit 0，且不向 stdout 写任何内容。
#   * Stop 的输入 JSON 中不含改动文件列表，必须自行检查工作区。
#
# 刻意不使用 set -e，否则条件判断为假时会意外以非零码退出。

set -uo pipefail

# 提交前必须全部通过的校验。若其中某个脚本不存在，提交同样会被跳过
# （宁可漏提交，也不把未校验的改动写进历史）。
CHECKS="format:check lint lint:md check check:tokens check:content"

# 残留锁超过这个秒数即认为持有者已死
LOCK_STALE_SECS=300

# Stop 的 stdin 必须读完，否则上游可能阻塞
INPUT=$(cat 2>/dev/null || printf '')

# ---------------- 定位仓库 ----------------
if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
fi

command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
GIT_DIR=$(git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
cd "$REPO_ROOT" 2>/dev/null || exit 0

# ---------------- 危险状态：一律不动 ----------------
for m in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD REVERT_HEAD \
         rebase-merge rebase-apply BISECT_LOG; do
  [ -e "$GIT_DIR/$m" ] && exit 0
done

# 存在未解决冲突时 git add -A 会把冲突标记一起提交
[ -n "$(git ls-files -u 2>/dev/null)" ] && exit 0

# detached HEAD 下提交会产生游离提交
git symbolic-ref -q HEAD >/dev/null || exit 0

# ---------------- 无改动则静默退出（绝大多数轮次走这里）----------------
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

# ---------------- 互斥锁：mkdir 本身是原子的 ----------------
LOCK="$GIT_DIR/claude-stop-commit.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  MT=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null) || MT=""
  if [ -n "$MT" ] && [ $(( $(date +%s) - MT )) -gt "$LOCK_STALE_SECS" ]; then
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0   # 另一个实例正在处理，交给它
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# ---------------- 提交前校验 ----------------
command -v npm >/dev/null 2>&1 || exit 0
for s in $CHECKS; do
  npm run "$s" --silent >/dev/null 2>&1 || exit 0
done

# ---------------- 提交 ----------------
git add -A 2>/dev/null || exit 0
git diff --cached --quiet 2>/dev/null && exit 0

COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
SHORTSTAT=$(git diff --cached --shortstat 2>/dev/null | sed 's/^ *//')

# 只做一次 add + commit：没有 push，没有 amend，没有 reset。
#
# 用自动化身份提交（scripts/automation/），不走 1Password ——
# 本 hook 恰恰在没有人在场时触发，而 op-ssh-sign 需要应用解锁：
# 锁定时会以 `error: 1Password: failed to fill whole buffer` 中断提交。
# 自动化身份是独立的（Frees Blog Automation），不冒用个人签名。
COMMIT_SH="$REPO_ROOT/scripts/automation/commit.sh"
if [ -f "$COMMIT_SH" ]; then
  sh "$COMMIT_SH" -q -F - >/dev/null 2>&1 <<EOF
chore: 自动提交 ${COUNT} 个文件

${SHORTSTAT}

由 Stop hook 兜底提交（本轮改动未经 Claude 主动提交）。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
else
  # 自动化入口缺失时退回默认 git 配置（可能因 1Password 锁定时失败，属预期）
  git commit -q -F - >/dev/null 2>&1 <<EOF
chore: 自动提交 ${COUNT} 个文件

${SHORTSTAT}

由 Stop hook 兜底提交（本轮改动未经 Claude 主动提交）。

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
fi

exit 0
