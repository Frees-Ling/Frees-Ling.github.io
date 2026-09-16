#!/bin/sh
# 把 Claude Code 的凭证来源从「settings.json 明文」切换到「钥匙串」。
#
# 在你于 DeepSeek 控制台轮换密钥、并用 store-credential.sh 存入新 key **之后**运行。
#
#   sh scripts/automation/switch-to-keychain.sh --check    # 只体检，不改动
#   sh scripts/automation/switch-to-keychain.sh            # 实际执行
#
# 测试时可覆盖 settings 路径（不要覆盖 HOME —— security 会去那个 HOME 找钥匙串）：
#   CLAUDE_SETTINGS_PATH=/tmp/test-settings.json sh scripts/automation/switch-to-keychain.sh
#
# 做三件事：
#   ① 备份 ~/.claude/settings.json（带时间戳，权限 600）
#   ② 从 env 中删除 ANTHROPIC_AUTH_TOKEN
#   ③ 写入 apiKeyHelper 指向 api-key-helper.sh
#
# **不会**动 BASE_URL、模型配置或任何其他键。
#
# ── 为什么必须先删明文 ──
#
# 2026-09-16 实测：settings.json 的 env.ANTHROPIC_AUTH_TOKEN **覆盖**进程环境变量。
# 只要它还留在文件里，请求就始终带着它发出的 Authorization 头，
# 钥匙串里的新 key 永远不会被用到 —— 切换会「看起来成功但实际没生效」。

set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HELPER="$DIR/api-key-helper.sh"
SETTINGS="${CLAUDE_SETTINGS_PATH:-$HOME/.claude/settings.json}"
MODE="${1:-apply}"

[ -f "$SETTINGS" ] || { printf '✗ 找不到 %s\n' "$SETTINGS" >&2; exit 1; }
[ -f "$HELPER" ] || { printf '✗ 找不到 %s\n' "$HELPER" >&2; exit 1; }
[ -x "$HELPER" ] || chmod +x "$HELPER"

printf '体检：\n'
# ① 钥匙串是否已有条目
if sh "$DIR/read-credential.sh" --check 2>/dev/null; then
  :
else
  printf '\n✗ 钥匙串里还没有凭证，先运行：\n    sh scripts/automation/store-credential.sh\n' >&2
  exit 1
fi

# ② 当前状态
python3 - "$SETTINGS" "$HELPER" "$MODE" <<'PY'
import json, pathlib, sys, datetime, shutil

settings = pathlib.Path(sys.argv[1])
helper = sys.argv[2]
mode = sys.argv[3]

d = json.loads(settings.read_text())
env = d.setdefault('env', {})
has_plain = 'ANTHROPIC_AUTH_TOKEN' in env
has_helper = d.get('apiKeyHelper')

print(f'  settings      : {settings}')
print(f'  明文 token    : {"存在（需移除）" if has_plain else "已不存在"}')
print(f'  apiKeyHelper  : {has_helper or "未配置"}')
print(f'  BASE_URL      : {env.get("ANTHROPIC_BASE_URL", "(未设置)")}')

if not has_plain and has_helper == helper:
    print('\n✓ 已经是目标状态，无需改动。')
    raise SystemExit(0)

if mode == '--check':
    print('\n（--check 模式，未做任何改动）')
    raise SystemExit(0)

# 备份
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = settings.with_suffix(f'.json.bak-{stamp}')
shutil.copy2(settings, backup)
backup.chmod(0o600)
print(f'\n  备份          : {backup}')

env.pop('ANTHROPIC_AUTH_TOKEN', None)
d['apiKeyHelper'] = helper
settings.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
settings.chmod(0o600)

print('  已移除 env.ANTHROPIC_AUTH_TOKEN')
print(f'  已设置 apiKeyHelper = {helper}')
print('\n✓ 切换完成。请重启 Claude Code 使配置生效。')
PY
