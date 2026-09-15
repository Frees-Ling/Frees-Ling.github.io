#!/bin/bash
# PreToolUse hook：阻止 Edit/Write 修改只读归档目录。
#
# 依据 archives/README.md —— archives/ 与 public/history/ 是只读历史归档。
# .claude/settings.json 中另有 Edit(...) 的 deny 规则，本脚本是第二道防线。
#
# 注意：路径必须先规范化再比较。纯字符串前缀匹配会被
# `./src/../archives/x.md` 这类写法绕过（已实测确认），因此这里交给 node
# 做词法规范化（消解 `.` 与 `..`）并解析符号链接。
# macOS 自带的是 BSD realpath，不支持 `-m`，故不使用它。
#
# 约定：退出码 2 = 阻止操作，stderr 内容作为反馈返回给 Claude。
# 刻意不使用 `set -e`，否则条件判断为假时会意外以非零码退出。

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-$PWD}

# 输出受保护的相对目录名（archives 或 public/history），未命中则输出空行。
# 无法规范化时输出 "?" 表示需要保守处理。
BLOCKED_REL=$(node -e '
const path = require("path");
const fs = require("fs");
const [projectDir, filePath] = process.argv.slice(1);

const realOrSelf = (p) => {
  try { return fs.realpathSync(p); } catch { return p; }
};

// 1) 词法规范化：解析为绝对路径并消解 "." 与 ".."
const lexical = path.resolve(projectDir, filePath);

// 2) 符号链接解析：向上找到最深的已存在祖先，对它做 realpath 后再拼回剩余部分，
//    这样尚未创建的新文件也能正确处理。
let abs = lexical;
let dir = abs;
const rest = [];
while (!fs.existsSync(dir)) {
  rest.unshift(path.basename(dir));
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
abs = path.join(realOrSelf(dir), ...rest);

// 3) 两侧都做符号链接解析后再比较，避免候选路径与比较目标基准不一致。
//    同时保留词法比较：即使 archives 本身被换成符号链接，写入该路径也应被拦截。
const project = realOrSelf(projectDir);

for (const rel of ["archives", "public/history"]) {
  const lexicalTarget = path.resolve(projectDir, rel);
  const realTarget = realOrSelf(path.join(project, rel));
  const inLexical =
    lexical === lexicalTarget || lexical.startsWith(lexicalTarget + path.sep);
  const inReal = abs === realTarget || abs.startsWith(realTarget + path.sep);
  if (inLexical || inReal) {
    process.stdout.write(rel);
    process.exit(0);
  }
}
process.stdout.write("");
' "$PROJECT_DIR" "$FILE_PATH" 2>/dev/null)
CANON_STATUS=$?

# node 执行失败：无法规范化路径，退回保守判断。
# 层一：含 ".." 一律拒绝（绕过必须借助 ".." 或符号链接）。
# 层二：对未解析的路径做词法前缀匹配 —— 挡不住符号链接，但优于全部放行。
if [ $CANON_STATUS -ne 0 ]; then
  case "$FILE_PATH" in
    *..*)
      printf 'Blocked: 无法规范化路径 %s（node 执行失败），保守拒绝。\n' "$FILE_PATH" >&2
      exit 2
      ;;
  esac
  for rel in archives public/history; do
    case "$FILE_PATH" in
      "$rel"|"$rel"/*|"$PROJECT_DIR/$rel"|"$PROJECT_DIR/$rel"/*)
        printf 'Blocked: %s 位于只读归档目录 %s/ 下（node 执行失败，退回词法匹配）。\n' \
          "$FILE_PATH" "$rel" >&2
        exit 2
        ;;
    esac
  done
  exit 0
fi

if [ -n "$BLOCKED_REL" ]; then
  printf 'Blocked: %s 位于只读归档目录 %s/ 下（见 archives/README.md），不可修改。\n' \
    "$FILE_PATH" "$BLOCKED_REL" >&2
  exit 2
fi

exit 0
