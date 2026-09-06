import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../working.ts", import.meta.url), "utf8");

test("working HUD uses one stable host widget and keeps the full surface", () => {
  assert.match(source, /const MESSAGE_REFRESH_MS = 33;/);
  assert.match(source, /const WORKING_WIDGET_KEY = "cyber-working-hud";/);
  assert.match(source, /setWidget\(/);
  assert.match(source, /\{ placement: "aboveEditor" \}/);
  assert.match(source, /uiCtx\.ui\.setWidget\(/);
  assert.match(source, /setWorkingVisible\(false\)/);
  assert.match(source, /setWorkingIndicator\(\{ frames: \[\] \}\)/);
  assert.doesNotMatch(source, /setWorkingIndicator\(\{[\s\S]*intervalMs/);
  assert.doesNotMatch(source, /\bsetInterval\b|\bclearInterval\b/);
  assert.match(source, /const next = setTimeout\(\(\) => \{/);
  assert.match(source, /const elapsedMs = now - prompt\.startedAt;/);
  assert.match(source, /collectRunningSegments\(/);
  assert.match(source, /return `\$\{pulseFrame\(elapsedMs\)\} \$\{hud\}`;/);
  assert.doesNotMatch(source, /tuiMode|TUI_MODE_PROBE_KEY/);
  assert.doesNotMatch(source, /setWorkingMessage\(ctx,/);
  assert.match(source, /scheduleMessageFrame\(ctx, sessionToken\);/);

  const updateStart = source.indexOf("function updateWorkingMessage");
  const publishStart = source.indexOf("function publishWorkingMessage");
  const cacheCheck = source.indexOf("message === lastMessage", publishStart);
  const widgetPublish = source.indexOf('const published = runTuiUi(ctx, "publish working HUD"', publishStart);
  assert.ok(updateStart >= 0, "working message updater should exist");
  assert.ok(publishStart >= 0, "working widget publisher should exist");
  assert.ok(cacheCheck >= 0 && cacheCheck < widgetPublish, "duplicate frames must be filtered before widget updates");
});

test("agent_end pauses and agent_settled finalizes the prompt", () => {
  const agentEndStart = source.indexOf('pi.on("agent_end"');
  const settledStart = source.indexOf('pi.on("agent_settled"');
  assert.ok(agentEndStart >= 0, "agent_end handler should exist");
  assert.ok(settledStart > agentEndStart, "agent_settled handler should follow agent_end");

  const agentEndBlock = source.slice(agentEndStart, settledStart);
  const settledBlock = source.slice(settledStart);
  assert.doesNotMatch(agentEndBlock, /finishPrompt/);
  assert.match(settledBlock, /finishPrompt\(ctx\)/);
  assert.match(source, /pi\.on\("session_tree"[\s\S]*invalidateSession\(\);[\s\S]*publishWorkingMessage\(ctx, undefined, true\)/);
});
