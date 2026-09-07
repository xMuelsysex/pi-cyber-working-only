import assert from "node:assert/strict";
import test from "node:test";
import { TuiMainScreen } from "@earendil-works/pi-tui";

type TerminalOutput = {
  columns: number;
  rows: number;
  kittyProtocolActive: boolean;
  writes: string[];
  start(): void;
  stop(): void;
  drainInput(): Promise<void>;
  write(data: string): void;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
  setTitle(title: string): void;
  setProgress(active: boolean): void;
};

function assertOrder(output: string, labels: string[]): void {
  let previous = -1;
  for (const label of labels) {
    const position = output.indexOf(label);
    assert.ok(position > previous, `${label} should follow the preceding surface`);
    previous = position;
  }
}

test("regular TUI places native working status below pending text and before navigation docks", () => {
  const terminal: TerminalOutput = {
    columns: 48,
    rows: 8,
    kittyProtocolActive: false,
    writes: [],
    start() {},
    stop() {},
    drainInput: async () => {},
    write(data) {
      this.writes.push(data);
    },
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  };
  const transcript = {
    render: () => ["Assistant output"],
    invalidate() {},
  };
  const pending = {
    render: () => ["Queued | next response"],
    invalidate() {},
  };
  const working = {
    lines: ["HUD | 0s | ↑ 0 ↓ 0 | t/s 0"],
    render() {
      return this.lines;
    },
    invalidate() {},
  };
  const agentDock = {
    render: () => ["Agent | working"],
    invalidate() {},
  };
  const todoDock = {
    render: () => ["Todo | 1 running"],
    invalidate() {},
  };
  const editor = {
    render: () => ["Input >"],
    invalidate() {},
  };
  const tui = new TuiMainScreen(terminal, false, process.cwd());
  tui.addChild(transcript);
  tui.addChild(pending);
  tui.addChild(working);
  tui.addChild(agentDock);
  tui.addChild(todoDock);
  tui.addChild(editor);

  tui.renderNow();
  const firstRender = terminal.writes.join("");
  assertOrder(firstRender, [
    "Assistant output",
    "Queued | next response",
    "HUD | 0s | ↑ 0 ↓ 0 | t/s 0",
    "Agent | working",
    "Todo | 1 running",
    "Input >",
  ]);
  assert.equal(firstRender.match(/HUD \| 0s/g)?.length, 1);
  assert.equal(firstRender.match(/Agent \| working/g)?.length, 1);
  assert.equal(firstRender.match(/Todo \| 1 running/g)?.length, 1);

  terminal.writes.length = 0;
  working.lines = ["HUD | 1s | ↑ 12 ↓ 7 | t/s 19"];
  tui.renderNow();
  const update = terminal.writes.join("");
  assert.match(update, /HUD \| 1s \| ↑ 12 ↓ 7 \| t\/s 19/);
  assert.doesNotMatch(update, /\x1b\[2J\x1b\[H\x1b\[3J/);
  assert.equal(tui.fullRedraws, 1);

  terminal.columns = 40;
  tui.renderNow();
  assert.equal(tui.fullRedraws, 2, "a resize redraws the single composed surface");
});
