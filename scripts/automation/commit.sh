#!/bin/sh
# 无人值守提交入口。用法与 git commit 一致：
#   ./scripts/automation/commit.sh -m "信息"
#   ./scripts/automation/commit.sh -F - < msg.txt
#   git add -A && ./scripts/automation/commit.sh -q -F - <<'EOF' ... EOF
#
# 与 `git commit` 的唯一区别：作者/提交者与签名器换成自动化身份，
# 因此**不需要 1Password 解锁**，也不会冒用个人签名。
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$DIR/git-env.sh"

if [ "${1:-}" = '--print-env' ]; then
  echo "GIT_AUTHOR_NAME=$GIT_AUTHOR_NAME"
  echo "GIT_AUTHOR_EMAIL=$GIT_AUTHOR_EMAIL"
  echo "signingkey=$GIT_AUTOMATION_SIGNINGKEY"
  echo "program=ssh-keygen"
  exit 0
fi

# 提交前跑密钥闸门。
#
# 放在这里而不是只放在 CI：密钥一旦进入历史，删除文件是没用的，
# 唯一低成本的时机是提交之前。自动化提交没人盯着，更需要这道闸门。
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || printf '')
SECRETS_CHECK="$REPO_ROOT/scripts/check-secrets.mjs"
if [ -n "$REPO_ROOT" ] && [ -f "$SECRETS_CHECK" ]; then
  if ! node "$SECRETS_CHECK" >&2; then
    echo "✗ 密钥检查未通过，已阻止提交。" >&2
    exit 1
  fi
fi

git_automation commit "$@"
