#!/bin/sh
# 从 macOS 登录钥匙串读取自动化凭证。
#
# 默认**输出到 stdout**（供启动脚本用命令替换捕获）。
# 带 --check 时只报告状态，绝不输出内容 —— 用于验证与诊断。
#
#   sh read-credential.sh            # 输出密钥（调用方负责不要泄漏）
#   sh read-credential.sh --check    # 只报告是否可读 + 长度 + 前缀
#
# 注意：不要在交互式 shell 里直接裸跑无参数的版本 —— 密钥会显示在终端、
# 进入 scrollback，也可能被截图。要验证请用 --check。

set -eu

SERVICE='frees-blog-deepseek'
ACCOUNT='automation'
MODE="${1:-read}"

# 先看条目是否存在，避免把「不存在」和「读取失败」混为一谈
if ! security find-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1; then
  printf '✗ 钥匙串中没有 %s / %s 条目\n' "$SERVICE" "$ACCOUNT" >&2
  printf '  存入：sh scripts/automation/store-credential.sh\n' >&2
  exit 1
fi

# -w 只取密码本身，不输出条目的其他属性
KEY=$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null) || {
  printf '✗ 读取钥匙串条目失败（可能被访问控制拒绝）\n' >&2
  exit 1
}

if [ -z "$KEY" ]; then
  printf '✗ 条目存在但内容为空\n' >&2
  exit 1
fi

case "$MODE" in
  --check)
    # 只报告可核对但不敏感的属性：长度与前缀。不输出可用密钥。
    PREFIX=$(printf '%s' "$KEY" | cut -c1-4)
    printf '✓ 可读取：长度 %d，前缀 %s…（其余已省略）\n' "${#KEY}" "$PREFIX"
    unset KEY
    ;;
  read)
    printf '%s' "$KEY"
    unset KEY
    ;;
  *)
    printf '✗ 未知参数：%s（可用：--check）\n' "$MODE" >&2
    exit 1
    ;;
esac
