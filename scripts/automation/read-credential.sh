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
#
# ── 为什么要看门狗 ──
#
# 2026-09-16 实测：钥匙串**锁定**时，`security find-generic-password`
# 不会立即失败，而是**挂起约 108 秒**等待一个 GUI 解锁弹窗才返回 128。
# `security show-keychain-info` 同样会挂起（17 秒），
# 因此「先探测是否锁定、再决定要不要读」这条路走不通。
#
# 无人值守时没有人能点那个弹窗，于是每次取凭证都会阻塞近两分钟 ——
# 这比直接失败更糟：它表现为「卡住」而不是「报错」，很难诊断。
#
# 所以这里给读取加一个看门狗：超过 READ_TIMEOUT 秒就杀掉子进程并快速返回。
# 失败是明确的，调用方能立刻知道该去解锁钥匙串。

set -eu

SERVICE='frees-blog-deepseek'
ACCOUNT='automation'
MODE="${1:-read}"

# 看门狗上限（秒）。钥匙串解锁时读取是毫秒级的，这个值只用来兜住「锁定」的情况。
READ_TIMEOUT="${CREDENTIAL_READ_TIMEOUT:-5}"

# 带超时地执行 security 读取。
# 纯 POSIX sh 实现，不依赖 macOS 上并不保证存在的 timeout(1) 或 perl。
read_key() {
  security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null &
  _pid=$!
  _waited=0
  while [ "$_waited" -lt $((READ_TIMEOUT * 10)) ]; do
    if ! kill -0 "$_pid" 2>/dev/null; then
      wait "$_pid"
      return $?
    fi
    sleep 0.1
    _waited=$((_waited + 1))
  done
  # 超时：杀掉并明确区分于「读取被拒」
  kill -9 "$_pid" 2>/dev/null || true
  wait "$_pid" 2>/dev/null || true
  return 124
}

# 条目存在性检查同样会挂起，所以也走看门狗
entry_exists() {
  security find-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1 &
  _pid=$!
  _waited=0
  while [ "$_waited" -lt $((READ_TIMEOUT * 10)) ]; do
    if ! kill -0 "$_pid" 2>/dev/null; then
      wait "$_pid"
      return $?
    fi
    sleep 0.1
    _waited=$((_waited + 1))
  done
  kill -9 "$_pid" 2>/dev/null || true
  wait "$_pid" 2>/dev/null || true
  return 124
}

# 注意：这里用 `if cmd; then :; else rc=$?; fi` 而不是 `if ! cmd; then rc=$?; fi`。
# 后者的 $? 是取反运算符的状态（恒为 0），超时会被误报成「没有条目」——
# 一个把「钥匙串锁了」说成「没配过」的错误提示，比没有提示更耽误事。
if entry_exists; then
  :
else
  rc=$?
  if [ "$rc" -eq 124 ]; then
    printf '✗ 读取钥匙串超时（%s 秒）—— 钥匙串很可能已锁定。\n' "$READ_TIMEOUT" >&2
    printf '  解锁：security unlock-keychain ~/Library/Keychains/login.keychain-db\n' >&2
  else
    printf '✗ 钥匙串中没有 %s / %s 条目\n' "$SERVICE" "$ACCOUNT" >&2
    printf '  存入：sh scripts/automation/store-credential.sh\n' >&2
  fi
  exit 1
fi

if KEY=$(read_key); then
  :
else
  rc=$?
  if [ "$rc" -eq 124 ]; then
    printf '✗ 读取钥匙串超时（%s 秒）—— 钥匙串很可能已锁定。\n' "$READ_TIMEOUT" >&2
    printf '  解锁：security unlock-keychain ~/Library/Keychains/login.keychain-db\n' >&2
  else
    printf '✗ 读取钥匙串条目失败（可能被访问控制拒绝）\n' >&2
  fi
  exit 1
fi

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
