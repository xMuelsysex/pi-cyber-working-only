# 修复工作栏被 OpenTUI 重新嵌入输入框

## 目标与决策

- 目标：工作栏固定在对话内容之后的第一个 native working status slot，位于 Agent/Todo 导航栏之前，不出现在输入框左上角。
- 根因：`settings.json` 同时加载 Cyber 与 `pi-open-tui`；`pi-open-tui` 在 Cyber 之后调用 `setEditorComponent`，安装 `OpenTuiEditor.embedWorkingStatus = true`，覆盖 Cyber 对宿主 editor 的非嵌入设置。
- 决策：Cyber 在发布工作消息前读取当前 editor factory；若被其他扩展替换，则包裹该 factory，将生成 editor 的 `embedWorkingStatus` 关闭后重新注册。保留原 editor 的视觉与输入行为，工作指示器回到宿主 native status container。

## 计划

1. 在 `working.ts` 统一检测并包裹被后续扩展替换的 editor factory，并确保工作指示器创建前完成该修复。
2. 在 `test/working-widget.test.ts` 增加 OpenTUI 类竞争 factory 的回归断言，确认 HUD 仍只占 native 行且自定义 editor 保留。
3. 运行目标测试、类型检查与 `git diff --check`；更新本记录与 `.pi/journal.md`。

## 验证记录

- `node --experimental-strip-types --experimental-loader /tmp/pi-cyber-package-loader.mjs --import ./test/register-ts-extension-loader.mjs --test test/working-widget.test.ts test/working-architecture.test.ts test/tui-working-layout.integration.test.ts`：6/6 通过；覆盖竞争 editor factory、native 行序、完整 HUD 与 lifecycle 清理。
- `node /home/muelsyse/.npm-global/lib/node_modules/typescript/lib/tsc.js --project /tmp/pi-cyber-tsconfig.json`：通过；使用宿主 `@earendil-works/pi-coding-agent` `0.84.4` declarations 检查变更源码。
- `git diff --check`：通过。
- 默认 `npm test` 与 `npm run typecheck` 受当前工作区缺少 `node_modules` 阻断；前者报 `ERR_MODULE_NOT_FOUND @earendil-works/pi-coding-agent`，后者报缺失 `@types/node`。已用临时 loader 和宿主 `0.84.4` 类型映射完成等价目标验证。
- `settings.json` 确认宿主加载 `/home/muelsyse/.pi/agent/git/github.com/xMuelsysex/pi-cyber-working-only`；该 checkout 原先仍是旧实现，已同步修复后的 `working.ts`，并用 loader 直接对宿主 checkout 跑目标回归，6/6 通过。
- 当前已运行的 Pi 进程仍持有旧模块实例，需要执行 `/reload` 或重启 Pi 后才会读取同步文件；这一步尚未在用户界面完成确认。

## 结论

- 源码与宿主实际加载 checkout 已同步，工作栏会在显示前重新夺回 editor ownership：包裹后来注册的 `OpenTuiEditor`，关闭其 `embedWorkingStatus`，保留 OpenTUI 编辑器样式与输入行为，并把 indicator 留在宿主 native working status container。
