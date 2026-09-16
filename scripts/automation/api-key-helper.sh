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

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# 读取逻辑集中在 read-credential.sh：它带看门狗，能在钥匙串锁定时快速失败，
# 而不是挂起约两分钟等一个无人能点的 GUI 弹窗。这里只做一层薄封装。
#
# 不在本脚本里重复实现 —— 两处实现迟早会漂移，而其中一处会失去超时保护。
if ! KEY=$(sh "$DIR/read-credential.sh" 2>/dev/null); then
  # 把 read-credential.sh 的可读错误原样转出：新版本会在 3 次尝试内
  # 显示脚本自身的错误，而不是被一个笼统的 401 掩盖。
  sh "$DIR/read-credential.sh" --check >&2 2>&1 || true
  exit 1
fi

if [ -z "$KEY" ]; then
  printf 'api-key-helper: 读到的凭证为空。\n' >&2
  exit 1
fi

# printf 不加换行，避免把 \n 混进凭证；Claude Code 会自行处理
printf '%s' "$KEY"
unset KEY
