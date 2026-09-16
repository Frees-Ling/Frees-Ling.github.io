#!/bin/bash
# 自主开发循环的查看 / 暂停 / 恢复 / 停止。
#
#   sh scripts/auto-dev/ctl.sh status    # 当前状态、锁、退避、最近几轮
#   sh scripts/auto-dev/ctl.sh log [n]   # 看最近 n 轮原始输出的尾部
#   sh scripts/auto-dev/ctl.sh pause     # 暂停（不卸载，只是让每轮直接跳过）
#   sh scripts/auto-dev/ctl.sh resume
#   sh scripts/auto-dev/ctl.sh stop      # 卸载 launchd 任务
#   sh scripts/auto-dev/ctl.sh install   # 安装并启用 launchd 任务
#
# 暂停与停止的区别：pause 保留调度（每 15 分钟仍会启动，但立刻退出），
# stop 彻底卸载。想临时让路用 pause，想彻底关掉用 stop。

set -uo pipefail

REPO=$(cd "$(dirname -- "$0")/../.." && pwd)
STATE_DIR="$REPO/.git/auto-dev"
PAUSE_FLAG="$STATE_DIR/paused"
LOCK="$STATE_DIR/run.lock"
BACKOFF_FILE="$STATE_DIR/backoff"
LOG_DIR="$STATE_DIR/logs"
LABEL='dev.frees.auto-dev'
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

case "${1:-status}" in
  status)
    echo "── 调度器 ──"
    if launchctl list 2>/dev/null | grep -q "$LABEL"; then
      echo "  已加载: 是"
      launchctl list "$LABEL" 2>/dev/null | grep -E '"(LastExitStatus|PID)"' | sed 's/^/  /'
    else
      echo "  已加载: 否（未安装或已 stop）"
    fi
    [ -f "$PLIST" ] && echo "  plist: $PLIST" || echo "  plist: 未安装"

    echo "── 运行状态 ──"
    [ -f "$PAUSE_FLAG" ] && echo "  暂停: 是（resume 恢复）" || echo "  暂停: 否"
    if [ -d "$LOCK" ]; then
      LOCK_PID=$(cat "$LOCK/pid" 2>/dev/null || echo '?')
      echo "  锁: 持有中 (PID ${LOCK_PID})"
    else
      echo "  锁: 空闲"
    fi
    if [ -f "$BACKOFF_FILE" ]; then
      read -r UNTIL FAILS <"$BACKOFF_FILE" 2>/dev/null
      echo "  退避: 连续失败 ${FAILS:-?} 次，至 $(date -r "${UNTIL:-0}" '+%H:%M:%S' 2>/dev/null || echo '?')"
    else
      echo "  退避: 无"
    fi

    echo "── 最近轮次 ──"
    tail -5 "$LOG_DIR/runner.log" 2>/dev/null | sed 's/^/  /' || echo "  （暂无记录）"
    ;;

  log)
    N="${2:-1}"
    F=$(ls -t "$LOG_DIR"/round-*.log 2>/dev/null | head -1)
    [ -n "$F" ] || { echo "没有轮次日志"; exit 0; }
    echo "── $(basename "$F") 尾部 ──"
    # 只显示尾部若干行，避免把整段对话打出来
    tail -n "$((N * 20))" "$F"
    ;;

  pause)
    mkdir -p "$STATE_DIR"; : >"$PAUSE_FLAG"
    echo "已暂停。调度仍会在每 15 分钟唤醒，但会立即退出。"
    ;;

  resume)
    rm -f "$PAUSE_FLAG"
    echo "已恢复。"
    ;;

  stop)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
    echo "已停止并从 launchd 卸载（plist 保留在 ${PLIST}，可用 install 重新启用）。"
    ;;

  install)
    [ -f "$PLIST" ] || { echo "找不到 $PLIST —— 请先创建 plist"; exit 1; }
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
    launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
    echo "已安装并启用。用 status 查看。"
    ;;

  *)
    echo "用法: $0 {status|log [n]|pause|resume|stop|install}" >&2
    exit 1
    ;;
esac
