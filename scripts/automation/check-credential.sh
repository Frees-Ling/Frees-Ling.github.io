#!/bin/sh
# 验证自动化凭证是否真的可用 —— **不输出任何密钥内容**。
#
#   sh scripts/automation/check-credential.sh
#
# 做两件事：
#   ① 钥匙串可读性（长度与前缀，不含可用密钥）
#   ② 用该凭证向配置的端点发一次最小请求，只报告状态码与错误类型
#
# ── 密钥不经过 argv ──
#
# 早先的版本用 `curl -H "Authorization: Bearer $KEY"` 发送，那会把密钥
# 放进进程参数里，同用户的任何进程都能通过进程列表看到。
# 现在改为 `curl -K -`：把请求配置从 **stdin** 喂给 curl，
# 密钥既不进 argv，也不落盘。
#
# 响应体写进 mktemp 产生的文件（0600，退出时由 trap 清理）。
# 早先用的是固定的 /tmp/.credcheck.body —— 可预测的路径可被符号链接攻击，
# 且多个实例会互相覆盖。
#
# 刻意不打印：请求头、响应体原文、密钥本身。

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

# 两个临时文件，权限 0600，退出时清理（含被中断的情况）。
# 不用固定的 /tmp 路径：可预测的名字既可能被符号链接攻击，多实例也会互相覆盖。
BODY_TMP=$(mktemp -t credcheck.XXXXXX) || {
  printf '✗ 无法创建临时文件\n' >&2
  unset KEY
  exit 1
}
REQ_TMP=$(mktemp -t credcheck.XXXXXX) || {
  printf '✗ 无法创建临时文件\n' >&2
  rm -f "$BODY_TMP"
  unset KEY
  exit 1
}
chmod 600 "$BODY_TMP" "$REQ_TMP"
trap 'rm -f "$BODY_TMP" "$REQ_TMP"' EXIT INT TERM

printf '\n② 端点连通性与认证\n'
printf '   端点: %s\n' "$BASE_URL"

# 请求体写进临时文件，用 -d @file 传给 curl。
#
# 这里不能把 JSON 塞进 curl 配置的 data = "..." —— 请求体里本来就有引号，
# 直接拼进去会把配置解析弄坏（实测：认证明明通过却得到 400，
# 因为 curl 拿到的是一段被截断的 JSON）。
# 用文件就没有转义问题，且请求体不含机密，落盘无妨。
printf '%s' '{"model":"deepseek-chat","max_tokens":1,"messages":[{"role":"user","content":"."}]}' > "$REQ_TMP"

# 认证头经 stdin 交给 curl（-K -）。printf 是 shell 内建命令，
# 因此密钥不进入 argv，也不写入任何文件。
STATUS=$(
  printf 'header = "Authorization: Bearer %s"\nheader = "content-type: application/json"\nurl = "%s/v1/messages"\n' \
    "$KEY" "$BASE_URL" |
    curl -s -o "$BODY_TMP" -w '%{http_code}' --max-time 20 -K - -d "@$REQ_TMP" 2>/dev/null
) || {
  unset KEY
  printf '   ✗ 网络请求失败（凭证状态未知，不代表凭证无效）\n' >&2
  exit 2
}
unset KEY

printf '   HTTP 状态: %s\n' "$STATUS"

EXIT_CODE=0
case "$STATUS" in
  200|201)
    printf '   ✓ 认证成功，凭证可用\n'
    ;;
  400)
    # 400 说明认证已通过、只是请求体不被接受 —— 对本检查而言算通过
    printf '   ✓ 认证通过（400 = 请求体问题，与凭证无关）\n'
    ;;
  401|403)
    printf '   ✗ 认证被拒（凭证无效、已撤销或格式不对）\n' >&2
    EXIT_CODE=1
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
if [ -s "$BODY_TMP" ]; then
  ERR=$(sed -n 's/.*"type"[[:space:]]*:[[:space:]]*"\([a-z_]*\)".*/\1/p' "$BODY_TMP" | head -1)
  [ -n "$ERR" ] && printf '   错误类型: %s\n' "$ERR"
fi

printf '\n注：本脚本不打印密钥、请求头与响应正文；密钥不经过命令行参数。\n'
exit "$EXIT_CODE"
