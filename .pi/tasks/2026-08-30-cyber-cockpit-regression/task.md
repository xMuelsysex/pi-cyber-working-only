# 修复 cockpit 0.19 工作消息槽位回归

日期：2026-08-30

## 目标与决策

- 目标：恢复 pi-cyber-working-only 与 pi-maestro-flow/pi-cockpit 更新后的独占 working message 槽位。
- 根因：pi-cockpit 0.19.0 将 `refreshAmbient` 的写入从直接 `ctx.ui.setWorkingMessage(workingMessage(...))` 重构为 `ambientSurfaces.setWorkingMessage(...)`；现有守卫只匹配旧调用，激活时静默跳过源码补丁。
- 决策：扩展 `ensureCockpitPatched()` 的兼容匹配，保留旧版本直接调用补丁，同时支持 0.19 的 ambient surface 调用；继续由 `ambientWorkingMessage: false` 控制 cockpit 是否写入，保持幂等和 fail-open。

## 计划

1. 阅读当前 cockpit 0.19 的 working message、配置和类型实现。
2. 修改 maestro-guard.ts 的版本兼容补丁逻辑，保持现有配置自愈。
3. 使用临时 `PI_CODING_AGENT_DIR` + Node/TypeScript loader 验证 pristine cockpit 源码的激活补丁、配置保留和幂等行为。
4. 检查 git diff 与实际安装位置，记录验证结果。

## 验证记录

- 已通过：旧直接调用和 0.19 ambient surface 调用均能被包入 `config.ambientWorkingMessage` 守卫。
- 已通过：临时目录激活后写入 `ambientWorkingMessage: false`，保留 `enabled` 与自定义字段；重复激活保持源码不变。
- 已通过：修补后的 cockpit `index.ts`、`types.ts`、`config.ts` 可由 Node TypeScript parser 解析。
- 已通过：`npm test`，2 个 guard 测试全部通过。
- 已通过：在两个仓库目录执行 `git diff --check`。
- 已通过：当前安装树 `pi-cockpit 0.19.0` 已应用 guard，配置仍为 `ambientWorkingMessage: false`。

## 结论

守卫已兼容 cockpit 0.19 的新写入路径；当前安装树已恢复保护。当前 Pi 进程需要 reload 或重启后加载更新后的插件代码。
