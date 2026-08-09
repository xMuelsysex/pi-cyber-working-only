# 补丁：cyber 内置 cockpit 自愈守卫

日期：2026-08-09

## 目标与决策

- 目标：让 pi-cyber-working-only 在存在 pi-maestro-flow 的环境下持续生效，不依赖外部手动配置 `~/.pi/agent/cockpit.json`。
- 根因：pi-cockpit（pi-maestro-flow 伴随包）默认（`DEFAULT_CONFIG.ambientWorkingMessage: true`）周期性写 working message，抢占 cyber 的显示槽位；此前靠外部 cockpit.json 配置压住，重装/换环境会丢失。
- 决策：在 cyber 插件内置自愈守卫 `maestro-guard.ts`——激活时 + 每次 `session_start` 时检查 `getAgentDir()/cockpit.json`，确保 `ambientWorkingMessage === false`。只改这一个字段，保留用户其他配置；文件不存在或 JSON 损坏时不越权处理。
- 方案取舍：不改 cockpit 源码（升级覆盖）、不做高频重写兜底（已有 16ms 定时器），守卫是零配置、幂等、fail-open 的最小有效改动。

## 计划

1. 新增 `maestro-guard.ts`：`ensureCockpitDeferred()`。
2. `index.ts`：导入守卫，在 activate 与 `session_start` 事件中调用。
3. 同步两个 clone（工作目录 + `~/.pi/agent/git/github.com/xMuelsysex/pi-cyber-working-only`）。
4. 用 `PI_AGENT_DIR` 注入临时目录 + jiti loader 验证。

## 验证记录

- 幂等：cockpit.json 已为 false 时不写入（idempotent: true）。
- 修复分支：true → false，保留 enabled/sidebar/自定义键。
- 边界：文件不存在时不创建；损坏 JSON 不动。
- 集成：jiti 加载 index.ts，activate 后立即修复；模拟外部改回 true，`session_start` 再次修复；11 个事件 handler 全部注册。
- 真实环境：`~/.pi/agent/cockpit.json` 当前已是 `ambientWorkingMessage: false`，守卫幂等无副作用。

## 结论

补丁完成并已同步到加载位置。pi 下次启动（或 reload）后生效；即使 cockpit.json 被覆盖/删除，cyber 每次激活与 session_start 都会自愈。未 commit（用户未要求）。
