#!/bin/bash
# Stop hook —— 每轮回复结束时兜底提交工作区改动（绝不 push）。
#
# 依据 https://code.claude.com/docs/en/hooks ：
#   * Stop 在主 agent 结束本轮回复时触发；用户中断不触发。
#   * Stop 不支持 matcher —— 在 settings.json 里写 matcher 会被静默忽略。
#   * 在 Stop 上 exit 2 = 阻止 Claude 停止并继续对话，会形成死循环。
#     其他非零退出码会在转录里留下 "hook error" 噪音。
#   * 因此本脚本所有分支一律 exit 0，且不向 stdout 写任何内容。
#   * Stop 的输入 JSON 中不含改动文件列表，必须自行检查工作区。
#
# ── 为什么不再 `git add -A` ──
#
# 原先的做法是「把工作区里的一切都提交掉」。单 agent 时这没问题，
# 但同一台机器上可能同时跑着别的会话/别的 Agent（这个项目本身就有多个
# 长期任务在并行），而**它看不到那些改动的来源**：
#
#   * 可能提交了另一个 Agent 写到一半的代码 —— 而那部分没跑过任何校验
#   * 可能把一个 Agent 的改动裹进另一个 Agent 的提交信息里，
#     于是以后没人能从历史里看出哪个改动属于哪件事
#   * 未跟踪的文件尤其危险：它们从没被 review 过，`add -A` 却照单全收
#
# 所以现在**必须由任务先声明它拥有哪些文件**（见下面的声明文件格式），
# 并且只在「工作区里恰好只有这些改动」时才提交。多出任何别的改动
# 就跳过并报告 —— 宁可漏提交，也不替别人提交。
#
# 刻意不使用 set -e，否则条件判断为假时会意外以非零码退出。

set -uo pipefail

# 提交前必须全部通过的校验。若其中某个脚本不存在，提交同样会被跳过
# （宁可漏提交，也不把未校验的改动写进历史）。
CHECKS="format:check lint lint:md check check:tokens check:content check:secrets test"

# 残留锁超过这个秒数即认为持有者已死
LOCK_STALE_SECS=300

# Stop 的 stdin 必须读完，否则上游可能阻塞
INPUT=$(cat 2>/dev/null || printf '')

# ---------------- 定位仓库 ----------------
if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
fi

command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
GIT_DIR=$(git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
cd "$REPO_ROOT" 2>/dev/null || exit 0

# ---------------- 危险状态：一律不动 ----------------
for m in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD REVERT_HEAD \
         rebase-merge rebase-apply BISECT_LOG; do
  [ -e "$GIT_DIR/$m" ] && exit 0
done

# 存在未解决冲突时提交会把冲突标记一起带进去
[ -n "$(git ls-files -u 2>/dev/null)" ] && exit 0

# detached HEAD 下提交会产生游离提交
git symbolic-ref -q HEAD >/dev/null || exit 0

# ---------------- 无改动则静默退出（绝大多数轮次走这里）----------------
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

# ---------------- 互斥锁：mkdir 本身是原子的 ----------------
LOCK="$GIT_DIR/claude-stop-commit.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  MT=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null) || MT=""
  if [ -n "$MT" ] && [ $(( $(date +%s) - MT )) -gt "$LOCK_STALE_SECS" ]; then
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0   # 另一个实例正在处理，交给它
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# 出错时写这里 —— 在 git 目录内，不进工作区，不会被下次提交带走
NOTE="$GIT_DIR/claude-stop-commit.err"
note() {
  printf 'Stop hook: %s\n时间: %s\n\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$NOTE"
}

# ---------------- 任务声明 ----------------
#
# 格式（$GIT_DIR/claude-task-files）：
#
#     task: MEDIA-001
#     studio/media/library.mjs
#     studio/media/library.test.mjs
#
# 第一行以 `task:` 开头，给出任务标识（可省略）；其余非空、非 `#` 开头的行
# 是**本轮任务拥有的文件路径**（相对仓库根）。
#
# 放在 $GIT_DIR 而不是仓库里：它不该被提交，也不该出现在 `git status` 里
# 干扰判断。
DECL="$GIT_DIR/claude-task-files"

if [ ! -f "$DECL" ]; then
  note "工作区有改动，但没有任务声明文件，已跳过自动提交。
  本轮改动未经本脚本提交 —— 这是有意的：无法判断这些改动属于谁。
  若确实要兜底提交，请由任务写明它拥有的文件：
  ${DECL}（格式见 .claude/hooks/stop-commit.sh 的注释）。"
  exit 0
fi

TASK_LABEL=$(sed -n 's/^task:[[:space:]]*//p' "$DECL" 2>/dev/null | head -1)
DECLARED=$(sed -e '/^[[:space:]]*#/d' -e '/^task:/d' -e '/^[[:space:]]*$/d' "$DECL" 2>/dev/null)

if [ -z "$DECLARED" ]; then
  note "任务声明文件里没有列出任何文件，已跳过自动提交。
  声明文件：$DECL"
  exit 0
fi

# ---------------- 工作区的实际改动 ----------------
#
# 每行取「状态码之后」的部分；重命名形如 `old -> new`，两边都要算。
CHANGED=$(git status --porcelain 2>/dev/null | sed 's/^...//')
[ -z "$CHANGED" ] && exit 0

is_declared() {
  printf '%s\n' "$DECLARED" | grep -Fxq -- "$1"
}

UNDECLARED=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  case "$line" in
    *' -> '*)
      old=${line%% -> *}
      new=${line##* -> }
      is_declared "$old" || UNDECLARED="$UNDECLARED$old"$'\n'
      is_declared "$new" || UNDECLARED="$UNDECLARED$new"$'\n'
      ;;
    *)
      is_declared "$line" || UNDECLARED="$UNDECLARED$line"$'\n'
      ;;
  esac
done <<EOF
$CHANGED
EOF

if [ -n "$UNDECLARED" ]; then
  note "工作区里出现了任务「${TASK_LABEL:-未命名}」没有声明的改动，已跳过自动提交：
$(printf '%s' "$UNDECLARED" | sed 's/^/  /')
  这些改动可能来自另一个会话或另一个 Agent。本脚本不替它们提交 ——
  请各自声明后分别提交，或人工处理。"
  exit 0
fi

# ---------------- 提交前校验 ----------------
command -v npm >/dev/null 2>&1 || exit 0
for s in $CHECKS; do
  npm run "$s" --silent >/dev/null 2>&1 || exit 0
done

# ---------------- 提交 ----------------
#
# **只暂存声明过的文件**（`git add -- <paths>`），而不是 `git add -A`。
# 上面的检查已经保证工作区里只有声明过的改动，这里再收窄一次 ——
# 两次判断之间工作区仍可能被别的进程改动，而那条路径不该被 add -A 吃掉。
ADD_PATHS=""
while IFS= read -r want; do
  [ -z "$want" ] && continue
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      *' -> '*) old=${line%% -> *}; new=${line##* -> } ;;
      *) old=$line; new=$line ;;
    esac
    if [ "$old" = "$want" ] || [ "$new" = "$want" ]; then
      # 用 -- 终止选项解析：以 `-` 开头的路径不会被当成选项
      git add -- "$want" 2>/dev/null
      ADD_PATHS="$ADD_PATHS$want"$'\n'
      break
    fi
  done <<EOF2
$CHANGED
EOF2
done <<EOF3
$DECLARED
EOF3

git diff --cached --quiet 2>/dev/null && exit 0

COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
SHORTSTAT=$(git diff --cached --shortstat 2>/dev/null | sed 's/^ *//')

# 提交信息里带上任务标识 —— 否则以后没人能从历史里看出
# 这次自动提交属于哪件事
if [ -n "$TASK_LABEL" ]; then
  SUBJECT="chore(${TASK_LABEL}): 自动提交 ${COUNT} 个文件"
else
  SUBJECT="chore: 自动提交 ${COUNT} 个文件"
fi

# 只做一次 add + commit：没有 push，没有 amend，没有 reset。
#
# 用自动化身份提交（scripts/automation/），不走 1Password ——
# 本 hook 恰恰在没有人在场时触发，而 op-ssh-sign 需要应用解锁：
# 锁定时会以 `error: 1Password: failed to fill whole buffer` 中断提交。
# 自动化身份是独立的（Frees Blog Automation），不冒用个人签名。
#
# 失败时**不重试、不回退**。
#
# 这里曾经有一个「自动化入口失败就回退到默认 git 配置再试一次」的分支。
# 那是错的：默认配置 = 个人身份 + op-ssh-sign，一旦它成功，
# 提交就变成了**冒用个人签名**；而它失败时只会再产生一次 1Password 报错噪音。
# 正确的行为是把改动留在工作区并留下可诊断的错误 —— 工作区是安全的，
# 默默换一个身份签名不是。
COMMIT_SH="$REPO_ROOT/scripts/automation/commit.sh"

if [ ! -f "$COMMIT_SH" ]; then
  note "找不到自动化提交入口 ${COMMIT_SH}，改动已保留在工作区。"
  exit 0
fi

if ! sh "$COMMIT_SH" -q -F - >/dev/null 2>>"$NOTE" <<EOF
${SUBJECT}

${SHORTSTAT}

由 Stop hook 兜底提交（本轮改动未经 Claude 主动提交）。
仅包含任务「${TASK_LABEL:-未命名}」声明拥有的文件：
$(printf '%s' "$ADD_PATHS" | sed 's/^/  /')

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
then
  note "自动化提交失败，改动已保留在工作区。"
  exit 0
fi

# 提交成功才清掉声明 —— 失败时留着，便于下次或人工诊断
rm -f "$DECL" "$NOTE" 2>/dev/null

exit 0
