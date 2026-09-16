#!/bin/sh
# Claude Code 的 apiKeyHelper：从 macOS 钥匙串取凭证，输出到 stdout。
#
# 在 ~/.claude/settings.json 里配置为：
#   "apiKeyHelper": "/绝对/路径/scripts/automation/api-key-helper.sh"
#
# ── 为什么这条路可行（2026-09-16 实测）──
#
# 用本地回环探针抓取真实请求头，确认：
#   · apiKeyHelper 的输出只填 `X-Api-Key`
#   · ANTHROPIC_AUTH_TOKEN 填 `Authorization: Bearer`
# 而 DeepSeek 的 Anthropic 兼容端点**两者都接受**：
#   有效 key + 任一方式 → 400（请求体问题，认证已通过）
#   无效 key + 任一方式 → 401
# 所以 apiKeyHelper 可以用于 DeepSeek。
#
# 这条路径的价值在于：**磁盘上零明文**。密钥只存在于钥匙串条目与本进程内存中，
# settings.json 里只有指向本脚本的路径。
#
# ── 契约 ──
#
# Claude Code 会在需要时执行本脚本并读取 stdout（仅第一行，需去掉尾部换行）。
# 失败时**必须非零退出并给出可读错误** —— 新版本会在 3 次尝试内显示脚本自身的
# 错误，而不是被一个笼统的 401 掩盖。
#
# 注意：脚本自身绝不把密钥写到 stderr、日志或任何文件。

set -eu

SERVICE='frees-blog-deepseek'
ACCOUNT='automation'

# 钥匙串条目不存在时给出可执行的指引，而不是静默失败
if ! security find-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1; then
  printf 'api-key-helper: 钥匙串中没有 %s/%s 条目。\n' "$SERVICE" "$ACCOUNT" >&2
  printf '  存入：sh scripts/automation/store-credential.sh\n' >&2
  exit 1
fi

KEY=$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null) || {
  printf 'api-key-helper: 读取钥匙串被拒绝（钥匙串可能已锁定）。\n' >&2
  printf '  解锁：security unlock-keychain ~/Library/Keychains/login.keychain-db\n' >&2
  exit 1
}

if [ -z "$KEY" ]; then
  printf 'api-key-helper: 钥匙串条目为空。\n' >&2
  exit 1
fi

# printf 不加换行，避免把 \n 混进凭证；Claude Code 会自行处理
printf '%s' "$KEY"
