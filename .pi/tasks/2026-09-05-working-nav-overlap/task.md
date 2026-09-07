# 修复重叠工作导航栏

## 目标与决策

- 目标：修复 regular TUI 中 Cyber 工作 HUD 与 Cockpit Agent/Todo 导航栏重绘时的历史帧重叠，同时保留完整的耗时、Token、TPS、回合和取消提示。
- 当前证据：regular `TuiMainScreen` 的 dock 顺序为 pending text → native working status → Agent/Todo dock → editor；此前 Cyber 的 `aboveEditor` widget 位于输入栏上方，位置错误且与 native working surface 形成重复工作面。native `WorkingStatusIndicator`/`Loader.setMessage` 在固定 status container 内原地更新。
- 决策：工作 HUD 使用宿主正式 native working status slot（`ctx.ui.setWorkingMessage`），该 slot 位于 pending text 之后、Agent/Todo dock 与 editor 之前；保留 regular/fullscreen 的完整耗时、Token、TPS、回合和取消提示。移除 `aboveEditor` widget 与跨包 Cockpit 源码/config 注入，禁止依赖外部补丁。
- 决策：native working surface 通过版本化全局 lease registry 管理；HUD 更新持续确认当前 lease，只在仍持有同一 lease 时恢复可见性，释放时不覆盖其他扩展的 working message 或 indicator。

## 计划

1. 检查 Cyber、Cockpit 和 TUI 的工作面、dock 布局与隐藏 viewport 更新路径。
2. 将 HUD 接入宿主 native working status API，移除 Cockpit guard 和所有跨包源码写入。
3. 更新 fake-TUI 布局回归检查，验证 HUD、Agent、Todo 同时存在且 HUD 不重复。
4. 修复 UI 暂态失败重试、声明宿主 API 最低版本，并整理 CI/sync 边界。
5. 记录验证命令、输出摘要与剩余环境风险，并更新 journal。

## 验证记录

- 通过：真实 `TuiMainScreen` regular 集成回归：pending text、native working status、Agent、Todo 和 editor 按宿主顺序排列；动态 HUD 更新不触发清屏全重绘；终端 resize 只触发一次预期重绘。
- 通过：生命周期回归覆盖 session shutdown → reload → agent_start，重新接管后 HUD、Agent、Todo 各只出现一次；失效 ExtensionContext 不被 teardown 访问。
- 通过：逐文件测试 6/6（布局 1/1、架构 2/2、生命周期 3/3）；`npm run typecheck`；`git diff --check`。`npm test` 包装器曾显示额外 1 个失败摘要，但测试 glob 实际只有上述 6 个用例，逐文件退出码均为 0。
- 通过：干净安装后公开 `@earendil-works/pi-tui` 入口可用；安装验证完成后已按主人授权删除 `node_modules/`。
- 通过：P1.1 lease 回归验证，teardown 只恢复 visibility，并保留原生 message/indicator；重复 Cyber lease 不会互相释放 native surface。
- 通过：按主人确认清理与插件运行/回归无关的上游同步维护链；插件源码、测试、构建配置和当前修复记录保留。

## 结论

regular 与 fullscreen 保留完整实时 Cyber HUD；HUD 通过宿主 native working status slot 更新，位置固定在 pending text 之后、Agent/Todo dock 与 editor 之前，避免占用 `aboveEditor` 输入栏槽位。native working surface 由版本化 lease 独占并在 teardown 仅恢复 visibility，Agent/Todo dock 不参与 Cyber 更新；lease 释放不会清空其他扩展写入的 working message 或 indicator。跨包 Cockpit guard 已删除，宿主最低版本通过 `peerDependencies >=0.84.4` 声明；插件 CI 仅检查现存插件源码和测试入口，上游同步自动化维护链已按范围移除。UI context 失效会停止重试并保留诊断，普通暂态更新和 teardown 清理按 100ms 受控重试。
