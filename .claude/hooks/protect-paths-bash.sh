#!/bin/bash
# PreToolUse hook（Bash）：阻止**通过 shell 写入**只读归档目录。
#
# ── 为什么需要这个独立钩子 ──
#
# 2026-09-17 实测发现的缺口：归档保护原本只有两层，而两层都不覆盖 Bash：
#   · .claude/settings.json 的 `Edit(/archives/**)` —— 只管文件编辑工具
#   · protect-paths.sh（matcher: Edit|Write）—— 只对 Edit/Write 触发
# 于是 `echo x > archives/README.md` 这类 Bash 写入不被任何一层拦截。
#
# 归因说明：这条缺口是在核查一次误报时发现的。那次误报认为
# 「移除 Write(/archives/**) 削弱了保护」，但 Claude Code 明确表示该规则
# 「不被任何文件权限检查匹配，只有 Edit(path) 规则会被匹配」——
# 它是空操作。真正的缺口不是少了那两条规则，而是 Bash 这条路径从来没被覆盖。
#
# ── 为什么不能简单地「见到 archives 就拦」 ──
#
# 大量正当操作会提到归档路径且都是只读的：
#   git log -- archives/        cat archives/README.md
#   grep -rn foo archives/      ls public/history/
# 全部拦掉会让归档彻底不可查阅。因此这里要求**同时**满足两个条件：
#   ① 出现写操作指示符（重定向或会改文件的命令）
#   ② 目标规范化后确实位于受保护目录内
#
# 约定：退出码 2 = 阻止，stderr 作为反馈返回。
# 刻意不使用 set -e。

INPUT=$(cat)

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[ "$TOOL_NAME" = 'Bash' ] || exit 0

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$CMD" ] || exit 0

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-$PWD}

# ── ① 是否出现写操作指示符 ──
#
# 只列真正会改动文件系统的东西。刻意不把 `git` 算进来 ——
# `git checkout -- archives/x` 之类由 git 自己的规则与 ADR-011 管，
# 在这里做正则判断误报率太高。
WRITE_HINT=0
case "$CMD" in
  *'>'*) WRITE_HINT=1 ;;                        # 重定向（> 与 >>）
esac
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])(rm|rmdir|mv|cp|tee|truncate|dd|install|touch|mkdir|ln|chmod|chown|patch|sed[[:space:]]+-i|perl[[:space:]]+-i)([[:space:]]|$)'; then
  WRITE_HINT=1
fi
[ "$WRITE_HINT" -eq 1 ] || exit 0

# ── ② 命令里是否提到受保护目录 ──
printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_])(archives|public/history)([^[:alnum:]_]|$)' || exit 0

# ── ③ 提取候选路径并规范化，确认是否真的落在保护范围内 ──
#
# 不做「见到关键词就拦」：命令里出现 archives 但目标是别处的情况很常见
# （例如 `rm -rf /tmp/x && echo done > archives-notes.md` 里的 archives-notes.md 并不受保护）。
# 因此把命令里的词逐个交给与 protect-paths.sh 相同的规范化逻辑判断。
CANDIDATES=$(printf '%s' "$CMD" | tr ' \t\n' '\n\n\n' | grep -E 'archives|history' || true)
[ -n "$CANDIDATES" ] || exit 0

while IFS= read -r CAND; do
  [ -n "$CAND" ] || continue
  # 去掉包裹的引号与重定向符号
  CAND=$(printf '%s' "$CAND" | sed "s/^['\"]//; s/['\"]$//; s/^>>*//; s/^<//")
  [ -n "$CAND" ] || continue

  BLOCKED_REL=$(node -e '
const path = require("path");
const fs = require("fs");
const [projectDir, filePath] = process.argv.slice(1);
const realOrSelf = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
const lexical = path.resolve(projectDir, filePath);
let abs = lexical, dir = abs;
const rest = [];
while (!fs.existsSync(dir)) {
  rest.unshift(path.basename(dir));
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
abs = path.join(realOrSelf(dir), ...rest);
const project = realOrSelf(projectDir);
const caseFold = (process.platform === "darwin" || process.platform === "win32")
  ? (s) => s.toLowerCase() : (s) => s;
const within = (candidate, target) => {
  const c = caseFold(candidate), t = caseFold(target);
  return c === t || c.startsWith(t + path.sep);
};
for (const rel of ["archives", "public/history"]) {
  const lexicalTarget = path.resolve(projectDir, rel);
  const realTarget = realOrSelf(path.join(project, rel));
  if (within(lexical, lexicalTarget) || within(abs, realTarget)) {
    process.stdout.write(rel); process.exit(0);
  }
}
process.stdout.write("");
' "$PROJECT_DIR" "$CAND" 2>/dev/null)

  if [ -n "$BLOCKED_REL" ]; then
    printf 'Blocked: 命令试图写入只读归档目录 %s/（目标: %s）。\n' "$BLOCKED_REL" "$CAND" >&2
    printf 'archives/ 与 public/history/ 是只读历史归档，见 archives/README.md。\n' >&2
    exit 2
  fi
done <<EOF
$CANDIDATES
EOF

exit 0
