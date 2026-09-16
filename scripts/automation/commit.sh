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

git_automation commit "$@"
