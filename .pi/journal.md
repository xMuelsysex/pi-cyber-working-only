# 项目记忆

- 2026-09-06：修正工作栏布局：`aboveEditor` 会把 HUD 固定在输入栏上方，已改用宿主 native working status slot；宿主 `TuiMainScreen` 的顺序为 pending text → working status → Agent/Todo dock → editor，完整 HUD 保留且不占输入栏 widget 槽位。布局 1/1、架构 2/2、生命周期 3/3 逐文件通过，覆盖 resize 与 session shutdown → reload → agent_start；`npm run typecheck` 和 `git diff --check` 通过。

- 2026-09-06：按主人限定范围完成 P1.1 native working surface ownership 修复：引入版本化全局 lease registry，所有 HUD 更新持续确认 lease，teardown 仅恢复 visibility 且不覆盖其他扩展的 working message/indicator；`test/working-widget.test.ts` 3/3 与 `npm run typecheck` 通过。按确认清理 `node_modules/`、`.workflow/`、`.pi/self-evolve.json` 及上游同步维护链；插件 CI、源码、测试、构建配置和修复记录保留。

- 2026-09-06（已废弃方案）：完成代码审查整改：HUD 曾改用公开声明的 `@earendil-works/pi-tui` 测试入口，UI 动态更新失败按 100ms 受控重试；清理仅在宿主确认成功后释放 widget 注册状态；CI 显式使用 lockfile 和串行测试，上游同步冲突按多冲突码阻断发布。后续布局已改为 native working status slot。

- 2026-09-06（已废弃方案）：完成工作导航栏重叠修复与代码审查整改：HUD 曾使用唯一 `cyber-working-hud` widget key 走宿主正式布局，保留 regular/fullscreen 完整状态；后续因位置要求改为 native working status slot。
- 2026-09-06：重叠根因最终通过宿主正式 widget API 修复：Cyber 使用唯一 `cyber-working-hud` key 在 `aboveEditor` 表面替换完整 HUD，原生 working-message slot 仅在 teardown 恢复；删除跨包 Cockpit guard，避免加载顺序和版本差异复发。
- 2026-09-06（已废弃方案）：曾尝试依赖 Cockpit viewport-stability 保留 regular 隐藏 scrollback 前缀；该方案恢复了部分 HUD，但仍把正确性建立在外部运行时 patch 上，已被正式 widget 方案替代。
- 2026-09-03：主人确认后通过 `gh api` 为 `xMuelsysex/pi-cyber-working-only` 开启 `allow_auto_merge=true` 并回读确认；仓库尚无 `PI_SYNC_TOKEN`，未复用权限过宽的当前 gh token，待专用最小权限 token 安全配置。
- 2026-09-03：上游 `pi-cyber-ui` 自动同步采用只读 verify → 白名单 artifact → 专用 token publish 三段边界；仅合并 `working.ts`，固定 npm 基线完整性与 GitHub Actions SHA，候选验证失败或三方冲突不启用 auto-merge，已有 PR 的验证退化会撤销旧请求。
- 2026-09-03：对照 pi-cyber-ui 0.1.34 后，working-only 工作栏改为单一 wall-clock 消息循环：`setWorkingIndicator({ frames: [] })` 只保留宿主工作面，脉冲与 HUD 统一由 33ms 自调度 `setWorkingMessage` 输出，并跳过相同帧；`agent_end` 只暂停、`agent_settled` 才收尾。这样可避免宿主 Loader 与扩展文本时钟争用同一工作行。
- 2026-08-30：pi-cockpit 0.19.0 将 working message 写入从直接 `ctx.ui.setWorkingMessage(...)` 重构为 `ambientSurfaces.setWorkingMessage(...)`，导致旧版本守卫匹配失败。`maestro-guard.ts` 现同时匹配两种调用路径；临时 fixture 测试、源码解析检查和当前安装树修复均通过。
- 2026-08-09：cyber 内置 cockpit 双守卫（maestro-guard.ts）。① `ensureCockpitDeferred`：强制 cockpit.json `ambientWorkingMessage: false`（保留其他字段）。② `ensureCockpitPatched`：cockpit ≥0.12 官方删除了该配置项，激活时自动给 `~/.pi/agent/npm/node_modules/pi-cockpit/src/` 的 index.ts/types.ts/config.ts 注入 `cyber-guard` 守卫（幂等），升级后自动自愈。两函数在 activate + session_start 调用。
- 2026-08-09：cockpit 0.13.0 移除 `ambientWorkingMessage` 配置（0.11 有），`refreshAmbient` 无条件写 working message，旧配置守卫失效导致 cyber 被抢占复发。已修复：源码注入 if 守卫 + 恢复类型/merge 支持。
