# 项目记忆

- 2026-08-30：pi-cockpit 0.19.0 将 working message 写入从直接 `ctx.ui.setWorkingMessage(...)` 重构为 `ambientSurfaces.setWorkingMessage(...)`，导致旧版本守卫匹配失败。`maestro-guard.ts` 现同时匹配两种调用路径；临时 fixture 测试、源码解析检查和当前安装树修复均通过。
- 2026-08-09：cyber 内置 cockpit 双守卫（maestro-guard.ts）。① `ensureCockpitDeferred`：强制 cockpit.json `ambientWorkingMessage: false`（保留其他字段）。② `ensureCockpitPatched`：cockpit ≥0.12 官方删除了该配置项，激活时自动给 `~/.pi/agent/npm/node_modules/pi-cockpit/src/` 的 index.ts/types.ts/config.ts 注入 `cyber-guard` 守卫（幂等），升级后自动自愈。两函数在 activate + session_start 调用。
- 2026-08-09：cockpit 0.13.0 移除 `ambientWorkingMessage` 配置（0.11 有），`refreshAmbient` 无条件写 working message，旧配置守卫失效导致 cyber 被抢占复发。已修复：源码注入 if 守卫 + 恢复类型/merge 支持。
