#!/bin/bash
# 法厄同自主开发循环 —— 单轮执行器。
#
# 由 launchd 每 15 分钟调用一次，也可以手动运行：
#   sh scripts/auto-dev/run.sh
#   sh scripts/auto-dev/run.sh --dry-run     # 只检查前置条件，不调用模型
#
# ── 这一轮做什么 ──
#
# 读任务队列 → 领一个可执行任务 → 交给 claude -p 做一轮 → 记录 → 退出。
# 刻意**不做循环**：一次调用只做一轮，循环由 launchd 的间隔驱动。
# 这样任何一轮崩了都不会带走后续轮次，也不会出现失控的长任务。
#
# ── 安全属性（对应任务要求第二节的八条）──
#
#  ① 单实例锁 —— mkdir 是原子的；锁内记录 PID 与启动时间，
#     陈旧锁（超过 STALE_SECS）自动回收，避免崩溃后永久卡死
#  ② 持久化状态 —— 进度写在 docs/execution/ 的文档里，不在内存里
#  ③ 轮次与开销上限 —— --max-budget-usd 限制单轮花费
#     注：本版本 claude CLI **没有** --max-turns（已实测），因此轮次上限
#     靠提示词约束 + 预算上限共同兜底，不能只靠其中一个
#  ④ 有限退避 —— 连续失败会写入退避状态，跳过后续若干轮
#  ⑤ 权限拒绝 → 记录阻塞并换任务，不重试同一操作
#  ⑥ 无任务可做时立即退出，不空转烧额度
#  ⑦ 日志可查；--status / --stop / --pause 见 scripts/auto-dev/ctl.sh
#  ⑧ 日志只记任务编号与状态，**不记录对话内容**，避免私人资料落盘
#
# ── 明确不做 ──
#
#  · 不使用 --dangerously-skip-permissions
#  · 不修改全局权限配置
#  · 不自动 push、不自动部署
#  · 不在交互式会话正在写仓库时抢占（见下面的会话互斥）

set -uo pipefail

REPO=$(cd "$(dirname -- "$0")/../.." && pwd)
STATE_DIR="$REPO/.git/auto-dev"
LOCK="$STATE_DIR/run.lock"
SESSION_LOCK="$STATE_DIR/session.lock"
BACKOFF_FILE="$STATE_DIR/backoff"
LOG_DIR="$STATE_DIR/logs"
RUN_LOG="$REPO/docs/execution/RUN_LOG.md"
QUEUE="$REPO/docs/execution/TASKS.md"

STALE_SECS=1800 # 30 分钟：单轮的正常上限，超过即认为持有者已死
MAX_BUDGET_USD="${AUTO_DEV_BUDGET:-0.50}"
DRY_RUN=0
[ "${1:-}" = '--dry-run' ] && DRY_RUN=1

mkdir -p "$STATE_DIR" "$LOG_DIR"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_DIR/runner.log"; }

# ── 前置：仓库存在 ──
[ -d "$REPO/.git" ] || { log "SKIP 不是 git 仓库"; exit 0; }
cd "$REPO" || exit 0

# ── ① 单实例锁 ──
if ! mkdir "$LOCK" 2>/dev/null; then
  MT=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null) || MT=""
  if [ -n "$MT" ] && [ $(( $(date +%s) - MT )) -gt "$STALE_SECS" ]; then
    log "WARN 回收陈旧锁（超过 ${STALE_SECS}s）"
    rm -f "$LOCK/pid" 2>/dev/null
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || { log "SKIP 锁竞争失败"; exit 0; }
  else
    log "SKIP 已有实例在运行"
    exit 0
  fi
fi
echo $$ >"$LOCK/pid"
trap 'rm -f "$LOCK/pid" 2>/dev/null; rmdir "$LOCK" 2>/dev/null' EXIT

# ── 暂停开关 ──
if [ -f "$STATE_DIR/paused" ]; then
  log "SKIP 已暂停"
  exit 0
fi

# ── 会话互斥：交互式会话正在写仓库时不抢占 ──
if [ -f "$SESSION_LOCK" ]; then
  ST=$(stat -f %m "$SESSION_LOCK" 2>/dev/null || stat -c %Y "$SESSION_LOCK" 2>/dev/null) || ST=""
  if [ -n "$ST" ] && [ $(( $(date +%s) - ST )) -lt 900 ]; then
    log "SKIP 交互式会话活跃（session.lock 新鲜）"
    exit 0
  fi
fi

# ── ④ 退避 ──
if [ -f "$BACKOFF_FILE" ]; then
  read -r UNTIL FAILS <"$BACKOFF_FILE" 2>/dev/null || { UNTIL=0; FAILS=0; }
  if [ "${UNTIL:-0}" -gt "$(date +%s)" ]; then
    log "SKIP 退避中（连续失败 ${FAILS} 次，至 $(date -u -r "${UNTIL}" +%H:%M:%SZ 2>/dev/null || echo "$UNTIL")）"
    exit 0
  fi
fi

# ── ⑥ 无任务则退出 ──
# 队列里没有任何 READY 或 BACKLOG 任务时直接退出，不调用模型。
# grep -c 无匹配时会**输出 0 并以 1 退出**，因此不能再接 `|| echo 0` ——
# 那会多输出一行，变量变成 "0\n0"，后面的 [ -eq ] 直接报整数错误。
READY=$(grep -cE '^- Status: (READY|ACTIVE)' "$QUEUE" 2>/dev/null || true)
PENDING=$(grep -cE '^- Status: BACKLOG' "$QUEUE" 2>/dev/null || true)
READY=${READY:-0}; PENDING=${PENDING:-0}
if [ "$READY" -eq 0 ] && [ "$PENDING" -eq 0 ]; then
  log "SKIP 队列为空"
  exit 0
fi

log "START ready=$READY backlog=$PENDING budget=$MAX_BUDGET_USD"

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY-RUN 前置条件均通过，不调用模型"
  echo "dry-run: 前置条件通过（ready=${READY} backlog=${PENDING}）"
  exit 0
fi

# ── 领一个任务并执行一轮 ──
#
# 提示词刻意写得窄：只做一件事，做完就退出。
# 不要求它「尽可能多做」—— 那会让单轮失控，也会让失败难以归因。
PROMPT=$(cat <<'EOF'
你是 Frees Blog 的自主开发循环的一轮。请严格执行以下步骤，不要扩展范围：

1. 读取 docs/execution/TASKS.md，找到第一个 Status 为 READY 或 ACTIVE 的任务。
   若没有 READY，取第一个 BACKLOG 任务，把它改成 ACTIVE。
2. 读取该任务的 Objective 与 Acceptance，以及 docs/execution/STATE.md。
3. **只做这一个任务**，实现到可以运行、可以测试的程度。
4. 运行相关测试与 npm run lint / format:check / check。
5. 测试通过后，把该任务的 Status 改为 DONE，并在 Evidence 下写入：
   实际改动、测试命令与结果、遗留问题。
6. 更新 docs/execution/STATE.md 的「Current task」与「Last known implementation state」。
7. 在 docs/execution/RUN_LOG.md 末尾追加一行：时间、任务编号、结果（DONE/BLOCKED/FAILED）、一句话说明。
8. 用 scripts/automation/commit.sh 创建一次本地提交。**不要 push。**
9. 如果这一步被权限拒绝或依赖缺失，把任务标为 BLOCKED 并写明原因，然后结束本轮 —— 不要重试同一操作。

硬性边界：
- 不要 push、不要部署、不要修改全局配置、不要使用 --dangerously-skip-permissions。
- 不要动 archives/ 与 public/history/。
- 不要读取或输出任何密钥明文。
- 一轮只做一个任务。做完就停。
EOF
)

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="$LOG_DIR/round-$STAMP.log"

claude -p "$PROMPT" \
  --permission-prompts none \
  --max-budget-usd "$MAX_BUDGET_USD" \
  --output-format text \
  >"$OUT" 2>&1
RC=$?

if [ "$RC" -eq 0 ]; then
  rm -f "$BACKOFF_FILE"
  log "OK 轮次完成 rc=0 日志=$(basename "$OUT")"
else
  FAILS=$(( ${FAILS:-0} + 1 ))
  # ④ 有限退避：1、2、4、8 轮，上限 8 轮（约 2 小时）
  SKIP=$(( 1 << (FAILS - 1) ))
  [ "$SKIP" -gt 8 ] && SKIP=8
  UNTIL=$(( $(date +%s) + SKIP * 900 ))
  printf '%s %s\n' "$UNTIL" "$FAILS" >"$BACKOFF_FILE"
  log "FAIL rc=$RC 连续失败=$FAILS 退避 $SKIP 轮 日志=$(basename "$OUT")"
fi

exit 0
