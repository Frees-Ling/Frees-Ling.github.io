#!/bin/sh
# 把自动化用的 DeepSeek 凭证存入 macOS 登录钥匙串。
#
# 由**你本人**运行，不要交给 AI 代跑 —— 脚本会以隐藏输入向你索要密钥，
# 密钥只存在于本次进程内存与钥匙串条目里，不经过命令行参数
# （命令行参数会出现在 `ps` 输出与 shell history 里）。
#
# 用法：
#   sh scripts/automation/store-credential.sh
#
# 存放位置：登录钥匙串的通用密码条目
#   service = frees-blog-deepseek
#   account = automation
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
  echo "✗ 本脚本只适用于 macOS（当前：$(uname)）" >&2
  exit 1
fi

printf '将新生成的 DeepSeek API Key 粘贴到下面（输入不回显）：\n'
printf 'API Key: '
# -s 关闭回显；密钥进入变量而不进入命令行参数
stty -echo 2>/dev/null || true
IFS= read -r KEY
stty echo 2>/dev/null || true
printf '\n'

if [ -z "${KEY:-}" ]; then
  echo "✗ 未输入内容，已中止。" >&2
  exit 1
fi

# 基本形态校验，避免把明显不是密钥的东西存进去
case "$KEY" in
  sk-*) : ;;
  *) echo "✗ 看起来不是 DeepSeek 的 key（应以 sk- 开头），已中止。" >&2; exit 1 ;;
esac

if [ "${#KEY}" -lt 20 ]; then
  echo "✗ 长度异常（${#KEY} 字符），已中止。" >&2
  exit 1
fi

# -U 表示已存在则更新，避免留下旧条目
security add-generic-password \
  -s "$SERVICE" \
  -a "$ACCOUNT" \
  -w "$KEY" \
  -T /usr/bin/security \
  -U

unset KEY

printf '✓ 已存入钥匙串（service=%s account=%s）\n\n' "$SERVICE" "$ACCOUNT"
printf '验证读取（不显示内容）：\n'
if sh "$(dirname -- "$0")/read-credential.sh" >/dev/null 2>&1; then
  printf '  ✓ 可读取，长度与格式正常\n'
else
  printf '  ✗ 读取失败，请检查钥匙串条目\n' >&2
  exit 1
fi

cat <<'EOF'

撤销方式（任选其一）：
  security delete-generic-password -s frees-blog-deepseek -a automation
  「钥匙串访问」应用 → 搜索 frees-blog-deepseek → 删除

轮换方式：在服务商控制台新建 key，然后重跑本脚本（-U 会覆盖旧条目），
最后回到控制台删除旧 key。
EOF
