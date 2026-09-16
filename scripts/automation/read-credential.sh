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

# 条目可由调用方指定（SEC-001 的 secret reference 需要按引用取不同条目）。
# 不传时保持原来的默认值 —— 已有调用方的行为一字不变。
SERVICE="${CREDENTIAL_SERVICE:-frees-blog-deepseek}"
ACCOUNT="${CREDENTIAL_ACCOUNT:-automation}"
MODE="${1:-read}"

# ── 退出码即状态 ──
#
# 原先「条目不存在」与「钥匙串锁定」都是 exit 1，只靠 stderr 文字区分。
# 调用方要分支就得去匹配人类可读的消息 —— 那种耦合迟早会因为改一句
# 提示语而静默失效，而这里失效的后果是把「钥匙串锁了」报成「没配过」，
# 正是指引人去错地方。现在状态由退出码承载，消息只负责给人看。
EX_MISSING=2    # 钥匙串里没有这个条目
EX_LOCKED=3     # 读取超时 —— 钥匙串很可能已锁定
EX_DENIED=4     # 条目在，但访问控制拒绝了本次读取
EX_EMPTY=5      # 条目存在，内容为空

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
# ── --state：只判断条目在不在，**到此为止，绝不读值** ──
#
# 这一段必须在读取之前。原先 --state 写在最后的 case 里，于是它虽然
# 不打印值，却**已经把值读进了这个进程** —— 注释说「不读值」而代码在读，
# 两者不一致本身就是缺陷：描述一个密钥的状态，不该需要把它取出来。
if [ "$MODE" = '--state' ]; then
  if entry_exists; then
    printf 'ok\n'
    exit 0
  else
    # 必须写在 else 分支里：`if ...; fi` 之后 $? 已经是 if 语句本身的状态
    # （没有 else 时为 0），超时会被读成 0 而报成「没有条目」。
    # 这与下面那段用的是同一个写法，原因见那段上面的注释 ——
    # 我在这里第一次写成了 if 之后取 $?，实测把「钥匙串锁定」报成了
    # 「没配过」，正好踩中它警告的那个错误。
    rc=$?
    [ "$rc" -eq 124 ] && exit $EX_LOCKED
    exit $EX_MISSING
  fi
fi

if entry_exists; then
  :
else
  rc=$?
  if [ "$rc" -eq 124 ]; then
    printf '✗ 读取钥匙串超时（%s 秒）—— 钥匙串很可能已锁定。\n' "$READ_TIMEOUT" >&2
    printf '  解锁：security unlock-keychain ~/Library/Keychains/login.keychain-db\n' >&2
    exit $EX_LOCKED
  else
    printf '✗ 钥匙串中没有 %s / %s 条目\n' "$SERVICE" "$ACCOUNT" >&2
    printf '  存入：sh scripts/automation/store-credential.sh\n' >&2
    exit $EX_MISSING
  fi
fi

if KEY=$(read_key); then
  :
else
  rc=$?
  if [ "$rc" -eq 124 ]; then
    printf '✗ 读取钥匙串超时（%s 秒）—— 钥匙串很可能已锁定。\n' "$READ_TIMEOUT" >&2
    printf '  解锁：security unlock-keychain ~/Library/Keychains/login.keychain-db\n' >&2
    exit $EX_LOCKED
  else
    printf '✗ 读取钥匙串条目失败（可能被访问控制拒绝）\n' >&2
    exit $EX_DENIED
  fi
fi

if [ -z "$KEY" ]; then
  printf '✗ 条目存在但内容为空\n' >&2
  exit $EX_EMPTY
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
