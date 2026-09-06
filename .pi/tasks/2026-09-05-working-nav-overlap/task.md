# 修复重叠工作导航栏

## 目标与决策

- 目标：修复 regular TUI 中 Cyber 工作 HUD 与 Cockpit Agent/Todo 导航栏重绘时的历史帧重叠，同时保留完整的耗时、Token、TPS、回合和取消提示。
- 当前证据：regular `TuiMainScreen` 的 host working slot 与固定 Agent/Todo dock 属于不同布局面；Cyber 通过 `setWorkingMessage` 高频更新隐藏行时会触发旧帧回放，造成导航栏重叠。
- 决策：工作 HUD 改为宿主正式 `ctx.ui.setWidget("cyber-working-hud", lines, { placement: "aboveEditor" })` 表面，并以同一个 key 原地替换内容；保留 regular/fullscreen 的完整耗时、Token、TPS、回合和取消提示。移除跨包 Cockpit 源码/config 注入，禁止依赖外部补丁。
- 决策：native working surface 通过版本化全局 lease registry 管理；HUD 更新持续确认当前 lease，只在仍持有同一 lease 时恢复可见性，释放时不覆盖其他扩展的 working message 或 indicator。

## 计划

1. 检查 Cyber、Cockpit 和 TUI 的工作面、dock 布局与隐藏 viewport 更新路径。
2. 将 HUD 接入宿主稳定 widget API，移除 Cockpit guard 和所有跨包源码写入。
3. 更新 fake-TUI 布局回归检查，验证 HUD、Agent、Todo 同时存在且 HUD 不重复。
4. 修复 UI 暂态失败重试、声明宿主 API 最低版本，并整理 CI/sync 边界。
5. 记录验证命令、输出摘要与剩余环境风险，并更新 journal。

## 验证记录

- 通过：`npm run test -- --test-concurrency=1`，14/14 通过；公开 `@earendil-works/pi-tui` 入口在干净安装后可用。
- 通过：真实 `TuiMainScreen` regular 集成回归：HUD、Agent、Todo 各占一行；动态 HUD 更新不触发清屏全重绘；终端 resize 只触发一次预期重绘。
- 通过：`npm run typecheck`。
- 通过：干净离线 `npm ci --ignore-scripts`，受跟踪 lockfile 可安装全部依赖。
- 通过：`git diff --check`、TypeScript/JavaScript 语法检查、workflow YAML 解析和 workflow shell snippet ShellCheck。
- 通过：多冲突 `git merge-file` 回归、冲突发布阻断、分支复用和自动合并条件回归均通过。
- 通过：UI 更新失败按 100ms 受控重试；失效 ExtensionContext 停止重试并保留错误诊断；teardown 清理仅在宿主确认成功后释放注册状态。
- 通过：P1.1 lease 回归验证，确认重复 Cyber 实例不能互相恢复 native surface，teardown 只恢复 visibility，并保留原生 message/indicator；`test/working-widget.test.ts` 3/3 通过，`npm run typecheck` 与 `git diff --check` 通过。
- 通过：按主人确认清理 `node_modules/`、`.workflow/`、`.pi/self-evolve.json` 及与插件运行/回归无关的上游同步维护链（`.github/workflows/upstream-sync.yml`、`.upstream/`、`scripts/`、上游同步任务和测试）；插件 CI、源码、测试、构建配置和当前修复记录保留。

## 结论

regular 与 fullscreen 保留完整实时 Cyber HUD；唯一 `cyber-working-hud` widget key 负责内容更新，native working surface 由版本化 lease 独占并在 teardown 仅恢复 visibility，Agent/Todo dock 不参与 Cyber 更新。lease 释放不会清空其他扩展写入的 working message 或 indicator。跨包 Cockpit guard 已删除，宿主最低版本通过 `peerDependencies >=0.84.4` 声明；插件 CI 仅检查现存插件源码和测试入口，上游同步自动化维护链已按范围移除。UI context 失效会停止重试并保留诊断，普通暂态更新和 teardown 清理按 100ms 受控重试。
