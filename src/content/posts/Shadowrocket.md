---
title: Shadowrocket 防杀说明
published: 2026-07-21
description: 'macOS 上防止 Shadowrocket 被系统自动终止的配置方法'
image: ''
tags: [Shadowrocket, macOS, VPN]
category: 'Note'
draft: false
lang: ''
---

# 前言

笔者用 Shadowrocket 在 macOS 上翻墙，一直挺稳定的——直到某天发现 VPN 莫名其妙就断了，一看进程，没了。

被 macOS 杀掉了。

是的，macOS 会自作主张把你的 app 杀掉，理由是"我觉得你不需要了"。

**那不行，我得让它活着。**

# macOS 为什么要杀 Shadowrocket

翻了一下 Shadowrocket 的 `Info.plist`，发现它自己开了两个"求杀"开关：

- `NSSupportsAutomaticTermination = true` — 跟系统说"我不活跃的时候你可以干掉我"
- `NSSupportsSuddenTermination = true` — 跟系统说"你不用通知我，直接杀"

窗口一关、一切到别的桌面，macOS 就觉得你不需要了，直接终止进程。VPN 就断了。

> 这两个标志本来是给那种随时可以关掉的工具型 app 用的（比如计算器），Shadowrocket 开这个纯粹是给自己找不痛快。

# 解决方案（三层防护）

笔者搞了三层防护，一层套一层，确保它死不掉：

## 第一层：禁止自动终止（根本原因修复）

直接把这两个开关关掉：

```bash
defaults write com.liguangming.Shadowrocket NSSupportsAutomaticTermination -bool false
defaults write com.liguangming.Shadowrocket NSSupportsSuddenTermination -bool false
```

通过 user defaults 覆盖掉 Info.plist 里的设置，macOS 就不会再自作主张杀 Shadowrocket 了。

> 改完之后需要重启 Shadowrocket 才会生效。如果以后重新安装了 Shadowrocket，这两条命令也要重新跑一次。

验证一下是否生效：

```bash
defaults read com.liguangming.Shadowrocket NSSupportsAutomaticTermination
defaults read com.liguangming.Shadowrocket NSSupportsSuddenTermination
```

如果都返回 `0`，说明关掉了。

## 第二层：掉线自动恢复（watchdog）

万一层一没挡住（比如系统更新重置了什么），还有一个 watchdog 盯着。

脚本位置：`~/.local/bin/shadowrocket-watchdog.sh`

每 5 秒检查一次 Shadowrocket 主进程还在不在，不在了就自动重新打开。遇到 App Store 更新、可执行文件暂时缺失的情况，会等 30 秒再重试，不会傻傻地一直撞墙。

日志写在 `/tmp/shadowrocket-watchdog.log`，想看看它有没有在干活：

```bash
tail -f /tmp/shadowrocket-watchdog.log
```

## 第三层：开机自启

watchdog 自己也需要有人看着——万一 watchdog 崩了呢？

所以用 LaunchAgent 让它开机自启：

- 位置：`~/Library/LaunchAgents/com.shadowrocket.watchdog.plist`
- `RunAtLoad` — 开机自动启动 watchdog
- `KeepAlive` — watchdog 挂了自动拉起来

> 三层分别是：禁止被杀 → 杀了也能活 → 看守的人也不会死。环环相扣，稳得很。

# 常用命令速查

```bash

# watchdog 有没有在跑？

tail -f /tmp/shadowrocket-watchdog.log

# Shadowrocket 还活着吗？

ps aux | grep -i shadowrocket | grep -v grep

# launchd 认不认识这个 watchdog？

launchctl list | grep shadowrocket

# 卸载 watchdog

launchctl unload ~/Library/LaunchAgents/com.shadowrocket.watchdog.plist

# 加载 watchdog

launchctl load ~/Library/LaunchAgents/com.shadowrocket.watchdog.plist
```

# 注意事项

- 改完 `defaults` 记得重启 Shadowrocket
- 重装 Shadowrocket 之后，`defaults write` 那两条要重新执行
- watchdog 脚本和 LaunchAgent 是独立的，重装不会覆盖，不用担心

**至此，Shadowrocket 应该不会再莫名其妙消失了。**
