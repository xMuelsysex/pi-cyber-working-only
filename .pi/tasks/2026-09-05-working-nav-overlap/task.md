# 修复重叠工作导航栏

## 目标与决策

- 目标：修复 regular TUI 中 Cyber 工作 HUD 与 Cockpit Agent/Todo 导航栏重绘时的历史帧重叠，同时保留完整的耗时、Token、TPS、回合和取消提示。
- 当前证据：`cockpit.json` 已设置 `ambientWorkingMessage: false`；Cyber 是 host working slot 的唯一写入者。regular `TuiMainScreen` 将该行放在文档内容与固定 Agent/Todo dock 之间，动态行更新必须由 viewport-stability 保留隐藏前缀，避免重放 scrollback。
- 决策：保留单一 33ms wall-clock 消息循环，regular 与 fullscreen 都输出完整 HUD；不再用 regular 静态分支或 TUI mode probe 砍掉状态信息。Cockpit 的 viewport-stability 补丁负责 regular 隐藏行的原地更新，Cockpit Agent/Todo 所有权保持不变。

## 计划

1. 检查 Cyber、Cockpit 和 TUI 的工作面、dock 布局与隐藏 viewport 更新路径。
2. 移除上一版 regular 静态降级，恢复完整 HUD，并保持脉冲与 HUD 由单一时钟输出。
3. 更新针对性回归检查，验证 regular/fullscreen 都持续刷新且生命周期收尾正确。
4. 记录验证命令、输出摘要与剩余环境风险，并更新 journal。

## 验证记录

- 通过：`node --experimental-strip-types --import ./test/register-ts-extension-loader.mjs --test test/*.test.ts`，11/11 通过。
- 通过：`node --experimental-strip-types --import ./test/register-ts-extension-loader.mjs --test test/working-architecture.test.ts`，2/2 通过。
- 通过：`npm run typecheck`。
- 通过：`node --check --experimental-strip-types working.ts`、三个测试文件；`git diff --check`。
- 通过：真实 Pi 0.85.1 TuiMainScreen + Cockpit viewport-stability 最小实验：隐藏 working 行连续更新时 full redraw 保持 1 次，工作消息仍可更新；可见 dock 更新正常。

## 结论

regular 与 fullscreen 现在都保留实时 Cyber HUD；工作栏由单一消息时钟驱动，regular 隐藏 viewport 由 Cockpit viewport-stability 保留旧前缀，避免重绘把旧状态推入 scrollback。当前工作树仍包含此前未提交的 package、依赖、同步流水线和测试基础设施改动，本次只改动工作栏源代码与对应回归断言。
