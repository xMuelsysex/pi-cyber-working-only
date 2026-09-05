# 修复重叠工作导航栏

## 目标与决策

- 目标：修复截图中 cyber 工作消息与 cockpit 动态 Agent/Todo 工作导航栏在 regular TUI 中重叠、历史帧堆叠的问题。
- 当前证据：`cockpit.json` 已设置 `ambientWorkingMessage: false`；截图中的 `● Reasoning/Rendering/...` 是 cyber 写入的 host working slot，regular `TuiMainScreen` 将该行放在文档内容与固定 Agent/Todo dock 之间。动态改写隐藏行会触发重绘并把旧帧 replay 到 scrollback，形成重叠历史工作栏。
- 决策：通过 host 的零行 widget 工厂读取实际 `tui.mode`；regular 模式只写入启动时的一帧工作消息，不启动消息时钟，避免动态隐藏行重绘；fullscreen 模式继续使用单一 33ms 消息时钟。移除本轮误判的 ownership replay，不改变 Cockpit Agent/Todo 所有权。

## 计划

1. 检查 cyber、cockpit 和 teammate 的动态表面注册/所有权路径，确认可复现根因。
2. 修改最少文件，使工作栏只由单一动态表面负责，避免重叠刷新。
3. 增加或更新针对性回归检查，运行目标测试、类型检查和 diff 检查。
4. 将验证命令、输出摘要与剩余环境风险写入本记录，并更新 journal。

## 验证记录

- 通过：`node --experimental-strip-types --import ./test/register-ts-extension-loader.mjs --test test/*.test.ts`，11/11 通过。
- 通过：`npm run typecheck`。
- 通过：`node --experimental-strip-types --check working.ts`、`index.ts`、`maestro-guard.ts`。
- 通过：`git diff --check`。
- 新增运行时回归：regular TUI 80ms 内工作消息写入次数保持不变；fullscreen TUI 仍持续刷新 HUD。

## 结论

regular TUI 的工作行现在只在 prompt 开始时写入一次静态工作动词，不再显示会过期的 `0s`/Token/TPS 快照；Cockpit 的 Agent/Todo 导航栏不会再被 Cyber 的 33ms 动态更新反复推入 scrollback。fullscreen 保留实时 Cyber HUD。当前工作树仍包含此前未提交的 `.pi/`、依赖和测试基础设施改动，未触碰或清理。
