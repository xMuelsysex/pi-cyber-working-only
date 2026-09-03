# 修复 cyber 工作栏双时钟与生命周期回归

## 目标与决策

- 目标：修复动态工作栏偶发停帧、下方动画继续运行导致整面 UI 不同步的问题，并吸收 pi-cyber-ui 0.1.34 的稳定架构。
- 根因：本地 `working.ts` 同时调用带 75ms 帧计时器的 `setWorkingIndicator`，并用独立 100ms 定时器刷新含文字动画的 `setWorkingMessage`；两个时钟共同写入工作面，Pi/cockpit 的刷新与占位竞争会造成停帧和视觉错位。
- 决策：保留宿主工作指示器但设置 `frames: []`，由唯一的 wall-clock `setWorkingMessage` 循环以 33ms 自调度同时绘制脉冲与 HUD；相同帧不重复写入；`agent_end` 只暂停刷新，`agent_settled` 才结束提示，补齐 `session_tree` 清理。
- 范围：只改 working-only 的 `working.ts` 与针对性架构测试；保留 cockpit 守卫、state/token 实现和工作区现有未提交改动，不迁移完整 pi-cyber-ui 的 editor/footer/tool gutter。

## 计划

1. 将脉冲帧并入工作消息，移除独立 Loader 动画时钟，改为可取消且按耗时补偿的 33ms 自调度刷新。
2. 让工作栏状态覆盖 `agent_end`/`agent_settled` 与 `session_tree`，避免重试、压缩或树切换时提前结束/遗留动画。
3. 增加单时钟与生命周期回归检查，运行项目测试、类型/语法检查和 diff 检查。
4. 记录实际验证输出与剩余环境风险。

## 验证记录

- 通过：`node --experimental-strip-types --test test/working-architecture.test.ts`，2/2 通过。
- 通过：临时 ESM stub 加载真实 `working.ts`，验证 `frames: []`、连续脉冲消息、`agent_end` 停止刷新、`agent_settled` 输出 `done`、shutdown 清理。
- 通过：`node --experimental-strip-types --check working.ts` 与 `node --experimental-strip-types --check test/working-architecture.test.ts`。
- 通过：`git diff --check -- working.ts test/working-architecture.test.ts`。
- 受环境阻塞：`npm test` 为 2 passed/1 failed；唯一失败是当前工作区缺少 peer 包 `@earendil-works/pi-coding-agent`，直接目标报 `ERR_MODULE_NOT_FOUND`。未安装依赖或跳过失败。

## 结论

工作栏现由单一消息时钟拥有所有动态单元，宿主 Loader 不再推进第二套帧；低层 `agent_end` 不会提前结束提示，只有 `agent_settled` 收尾。重新加载或重启 Pi 后生效；完整 npm 测试仍需在安装 `@earendil-works/pi-coding-agent` peer 依赖的环境复跑。
