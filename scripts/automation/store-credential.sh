#!/bin/sh
# 把自动化用的 DeepSeek 凭证存入 macOS 登录钥匙串。
#
# 由**你本人**运行，不要交给 AI 代跑 —— 脚本会以隐藏输入向你索要密钥。
#
# 用法：
#   sh scripts/automation/store-credential.sh
#
# 存放位置：登录钥匙串的通用密码条目
#   service = frees-blog-deepseek
#   account = automation
#
# ── 密钥为什么不经过本脚本 ──
#
# 早先的版本是这样写的：本脚本先用 `stty -echo` + `read` 把密钥读进 shell 变量，
# 再 `security add-generic-password -w "$KEY"` 写入。那是错的 ——
# 命令行参数会出现在进程列表里，同用户的任何进程都能看到，
# 而脚本注释当时还声称「不经过命令行参数」，属于**错误的安全声明**。
#
# macOS 的 security 工具**不支持**从 stdin 读取要写入的密码
# （实测 `-w -` 会把字面量 `-` 当成密码存进去）。
# 因此改为把它自己的交互提示交给 security：`-w` 放在参数末尾且不带值，
# 它会直接向你索要两次并自行写入 —— 密钥只存在于 security 进程的内存里，
# 既不进 argv，也不进本脚本的变量。
#
# 代价是要输入两次（security 要求确认）。这是每次轮换才做一次的操作。
#
# ── 关于 -T /usr/bin/security ──
#
# 钥匙串条目的访问控制基于「哪个程序在请求」。默认情况下任何程序首次读取
# 都会弹窗询问，而无人值守时没有人能点那个弹窗 —— 读取会一直挂起。
#
# 因此这里用 -T /usr/bin/security 把 Apple 签名的 security 命令行工具
# 预先加入信任列表。**授权的范围与风险**：
#   · 被授权的是 /usr/bin/security 这一个程序，不是「所有程序」；
#   · 但任何以你的身份运行、且能调用 security 的进程都可以读到该条目 ——
#     这正是无人值守所必需的代价，无法两全；
#   · 该条目只存这一个开发用密钥，不含你的任何个人密码、恢复密钥或主密钥；
#   · 撤销：删除该钥匙串条目即可（见文件末尾）。
#
# 如果你更希望由自己逐次批准，把下面的 -T 去掉再运行；
# 代价是每次读取都会弹窗，无人值守将不可用。

set -eu

SERVICE='frees-blog-deepseek'
ACCOUNT='automation'

if [ "$(uname)" != 'Darwin' ]; then
  printf '✗ 本脚本只适用于 macOS（当前：%s）\n' "$(uname)" >&2
  exit 1
fi

# 必须是终端：security 的提示需要 tty，且我们不希望密钥从管道进来
if [ ! -t 0 ]; then
  printf '✗ 需要在终端里运行（当前 stdin 不是 tty）。\n' >&2
  exit 1
fi

cat <<EOF
即将把凭证写入钥匙串（service=$SERVICE, account=$ACCOUNT）。

security 会提示你输入两次（第二次是确认输入）。输入过程不回显。
如果该条目已存在，会被覆盖。

EOF

printf '按回车继续，Ctrl-C 取消... '
IFS= read -r _ || true
printf '\n'

# 关键：-w 放在最后且不带值 —— 由 security 自己提示并写入。
# 密钥不经过本脚本的变量，也不出现在 argv 里。
security add-generic-password \
  -s "$SERVICE" \
  -a "$ACCOUNT" \
  -T /usr/bin/security \
  -U \
  -w || {
  printf '\n✗ 写入失败或被取消。\n' >&2
  exit 1
}

printf '\n'

# 回读校验：确认条目存在、格式合理。
# 回读走的是变量（不是 argv），且只报告长度与前缀。
if ! KEY=$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null); then
  printf '✗ 写入后无法回读，请检查钥匙串。\n' >&2
  exit 1
fi

if [ -z "$KEY" ]; then
  printf '✗ 条目内容为空，已中止。\n' >&2
  exit 1
fi

case "$KEY" in
  sk-*) : ;;
  *)
    printf '✗ 看起来不是 DeepSeek 的 key（应以 sk- 开头）。\n' >&2
    printf '  已删除该条目，请重试。\n' >&2
    security delete-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1 || true
    exit 1
    ;;
esac

if [ "${#KEY}" -lt 20 ]; then
  printf '✗ 长度异常（%d 字符），已删除该条目。\n' "${#KEY}" >&2
  security delete-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1 || true
  unset KEY
  exit 1
fi

PREFIX=$(printf '%s' "$KEY" | cut -c1-4)
printf '✓ 已存入并回读校验通过：长度 %d，前缀 %s…（其余不显示）\n\n' "${#KEY}" "$PREFIX"
unset KEY

cat <<'EOF'
撤销方式（任选其一）：
  security delete-generic-password -s frees-blog-deepseek -a automation
  「钥匙串访问」应用 → 搜索 frees-blog-deepseek → 删除

轮换方式：在服务商控制台新建 key，然后重跑本脚本（-U 会覆盖旧条目），
最后回到控制台删除旧 key。
EOF
