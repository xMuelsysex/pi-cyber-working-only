# 项目记忆

- 2026-08-09：cyber 内置 cockpit 自愈守卫（maestro-guard.ts）。pi-cockpit 默认 `ambientWorkingMessage: true` 会抢 working message 槽位；cyber 激活 + session_start 时强制 cockpit.json 该字段为 false，只改此字段保留其他配置，文件缺失/损坏不越权。已同步安装 clone（~/.pi/agent/git/github.com/xMuelsysex/pi-cyber-working-only）。
