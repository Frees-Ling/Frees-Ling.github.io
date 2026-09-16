#!/bin/sh
# 验证自动化凭证是否真的可用 —— **不输出任何密钥内容**。
#
#   sh scripts/automation/check-credential.sh
#
# 做两件事：
#   ① 钥匙串可读性（长度与前缀，不含可用密钥）
#   ② 用该凭证向配置的端点发一次最小请求，只报告状态码与错误类型
#
# 刻意不打印：请求头、响应体原文、密钥本身。
# 响应体可能回显请求信息，所以只提取 error.type 之类的字段。
#
# 退出码：0 = 通过；1 = 凭证不可用；2 = 网络问题（凭证状态未知）

set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

printf '① 钥匙串读取\n'
if ! sh "$DIR/read-credential.sh" --check; then
  exit 1
fi

KEY=$(sh "$DIR/read-credential.sh") || exit 1

BASE_URL="${ANTHROPIC_BASE_URL:-https://api.deepseek.com/anthropic}"
# 去掉可能的尾部斜杠，统一拼接
BASE_URL=$(printf '%s' "$BASE_URL" | sed 's:/*$::')

printf '\n② 端点连通性与认证\n'
printf '   端点: %s\n' "$BASE_URL"

# 只报告 HTTP 状态码，不报告响应体
STATUS=$(printf '%s' '{"model":"deepseek-chat","max_tokens":1,"messages":[{"role":"user","content":"."}]}' |
  curl -s -o /tmp/.credcheck.body -w '%{http_code}' \
    --max-time 20 \
    -H "Authorization: Bearer $KEY" \
    -H 'content-type: application/json' \
    -X POST "$BASE_URL/v1/messages" 2>/dev/null) || {
  unset KEY
  printf '   ✗ 网络请求失败（凭证状态未知，不代表凭证无效）\n' >&2
  rm -f /tmp/.credcheck.body
  exit 2
}
unset KEY

printf '   HTTP 状态: %s\n' "$STATUS"

case "$STATUS" in
  200|201)
    printf '   ✓ 认证成功，凭证可用\n'
    ;;
  401|403)
    printf '   ✗ 认证被拒（凭证无效、已撤销或格式不对）\n' >&2
    rm -f /tmp/.credcheck.body
    exit 1
    ;;
  404)
    printf '   ? 端点路径不存在 —— 可能该端点不用 /v1/messages，请核对 BASE_URL\n' >&2
    ;;
  429)
    printf '   ✓ 认证通过（被限流，与凭证无关）\n'
    ;;
  5*)
    printf '   ? 服务端错误 %s —— 凭证状态未知\n' "$STATUS" >&2
    ;;
  *)
    printf '   ? 未预期的状态码 %s\n' "$STATUS" >&2
    ;;
esac

# 只提取错误类型字段，不打印正文
if [ -s /tmp/.credcheck.body ]; then
  ERR=$(sed -n 's/.*"type"[[:space:]]*:[[:space:]]*"\([a-z_]*\)".*/\1/p' /tmp/.credcheck.body | head -1)
  [ -n "$ERR" ] && printf '   错误类型: %s\n' "$ERR"
fi
rm -f /tmp/.credcheck.body

printf '\n注：本脚本不打印密钥、请求头与响应正文。\n'
