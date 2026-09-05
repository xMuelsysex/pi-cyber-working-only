import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../working.ts", import.meta.url), "utf8");

test("working HUD owns one visual clock", () => {
  assert.match(source, /const MESSAGE_REFRESH_MS = 33;/);
  assert.match(source, /type TuiMode = "regular" \| "fullscreen";/);
  assert.match(source, /tui\.mode === "fullscreen"/);
  assert.match(source, /if \(tuiMode === "regular"\)/);
  assert.match(source, /if \(tuiMode === "fullscreen"\) scheduleMessageFrame/);
  assert.match(source, /setWorkingIndicator\(\{ frames: \[\] \}\)/);
  assert.doesNotMatch(source, /setWorkingIndicator\(\{[\s\S]*intervalMs/);
  assert.doesNotMatch(source, /\bsetInterval\b|\bclearInterval\b/);
  assert.match(source, /const next = setTimeout\(\(\) => \{/);
  assert.match(source, /return `\$\{pulseFrame\(elapsedMs\)\} \$\{hud\}`;/);

  const updateStart = source.indexOf("function updateWorkingMessage");
  const cacheCheck = source.indexOf("message === lastMessage", updateStart);
  const messageWrite = source.indexOf("setWorkingMessage(ctx, message)", updateStart);
  assert.ok(updateStart >= 0, "working message updater should exist");
  assert.ok(cacheCheck >= 0 && cacheCheck < messageWrite, "duplicate frames must be filtered before UI writes");
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
  assert.match(source, /pi\.on\("session_tree"[\s\S]*invalidateSession\(\);[\s\S]*setWorkingMessage\(ctx\);/);
});
