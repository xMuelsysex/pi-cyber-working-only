# 修复工作栏错位

## 目标与决策

- 目标：修复主人反馈的工作栏仍然错位问题，保留完整 HUD、Agent/Todo 导航栏和 regular/fullscreen 行为。
- 当前证据：项目源码通过 `ctx.ui.setWorkingMessage` 使用宿主 native working status；实际宿主为 `@earendil-works/pi-coding-agent` 0.85.1，`chat-viewport.ts` 将 pending、status、above-editor widgets、editor 组合，`WorkingStatusIndicator` 继承 `Loader`。
- 待决策：基于最小可复现渲染输出确定错位根因后，修改共享布局/组件边界，不用删除或隐藏工作栏规避问题。

## 计划

1. 复现当前 regular/fullscreen 工作栏的实际行数和顺序，检查宿主与插件 API 的边界。
2. 在根因位置做最小修复，补针对性回归断言。
3. 运行目标测试、类型检查、diff 检查，并更新留痕。

## 验证记录

- 截图确认实际行序为 `Todo/Agent → 工作栏`；宿主 `0.85.1` 的 `CustomEditor` 默认编辑器启用 `embedWorkingStatus: true`，因此 working indicator 被画在编辑器顶边，而不是 `statusContainer`。
- `working.ts` 改为通过公开 `ctx.ui.setEditorComponent` 创建 `CustomEditor`，采用默认非嵌入模式；native `setWorkingMessage`、完整 HUD、Agent/Todo dock 和 lifecycle 重试逻辑保留。
- 目标回归：`node --experimental-strip-types --import ./test/register-ts-extension-loader.mjs --test test/working-widget.test.ts test/working-architecture.test.ts test/tui-working-layout.integration.test.ts`，6/6 通过。
- 类型检查：`node /home/muelsyse/.npm-global/lib/node_modules/typescript/bin/tsc --noEmit --typeRoots /home/muelsyse/.npm-global/lib/node_modules/pi-web-access/node_modules/@types`，通过。
- 静态检查：`git diff --check`，通过。

## 结论

- 工作栏回到宿主 native `statusContainer`，行序为对话/待处理文本之后、Agent/Todo dock 之前、输入编辑器之前；修复没有隐藏、删除或缩减任何 HUD 或导航元素。
