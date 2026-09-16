#!/bin/sh
# 无人值守启动 Claude Code：从钥匙串注入 ANTHROPIC_AUTH_TOKEN。
#
#   sh scripts/automation/run-claude.sh [传给 claude 的参数...]
#
# ── 为什么不用 apiKeyHelper ──
#
# 2026-09-16 用本地回环探针实测（12 次真实请求）确认：
#   · apiKeyHelper 的输出只填 `X-Api-Key` 头
#   · ANTHROPIC_AUTH_TOKEN 填的是 `Authorization: Bearer` 头
# 两者是**彼此独立**的机制，同时存在时各填各的头。
#
# 而 DeepSeek 的 Anthropic 兼容端点读的是 `Authorization: Bearer`
# （官方接入方式就是设 ANTHROPIC_AUTH_TOKEN）。所以 apiKeyHelper
# **不适配 DeepSeek** —— 它填的头会被忽略，请求仍然带着旧 token 发出去。
#
# 因此采用启动时环境变量注入。
#
# ── 边界 ──
#
# 密钥只存在于本进程及其子进程的环境里，不写进任何配置文件、
# 不进入命令行参数、不落盘。claude 退出即消失。
# 若同时存在 ~/.claude/settings.json 的 env.ANTHROPIC_AUTH_TOKEN，
# 进程环境优先（Claude Code 不覆盖已存在的环境变量），
# 但切换完成后应当把那个明文值删掉，否则它仍留在磁盘上。

set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -n "${FREES_SKIP_KEYCHAIN:-}" ]; then
  printf '→ 跳过钥匙串（FREES_SKIP_KEYCHAIN 已设置），沿用现有环境\n' >&2
else
  KEY=$(sh "$DIR/read-credential.sh" 2>/dev/null) || {
    printf '✗ 无法从钥匙串取得凭证，已中止。\n' >&2
    printf '  先运行：sh scripts/automation/store-credential.sh\n' >&2
    exit 1
  }
  ANTHROPIC_AUTH_TOKEN="$KEY"
  export ANTHROPIC_AUTH_TOKEN
  unset KEY
fi

# 端点必须与凭证匹配。DeepSeek 兼容端点要求 Authorization: Bearer，
# 这里显式设一次，避免继承到别的 BASE_URL 却用着 DeepSeek 的 key。
if [ -z "${ANTHROPIC_BASE_URL:-}" ]; then
  ANTHROPIC_BASE_URL='https://api.deepseek.com/anthropic'
  export ANTHROPIC_BASE_URL
fi

# exec 让 claude 取代本进程：不留下一个持有密钥的父进程
exec claude "$@"
