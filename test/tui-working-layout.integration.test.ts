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

test("regular TUI keeps the working widget and navigation docks on one surface", () => {
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
  const hud = {
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
  const tui = new TuiMainScreen(terminal, false, process.cwd());
  tui.addChild(hud);
  tui.addChild(agentDock);
  tui.addChild(todoDock);

  tui.renderNow();
  const firstRender = terminal.writes.join("");
  assert.equal(firstRender.match(/HUD \| 0s/g)?.length, 1);
  assert.equal(firstRender.match(/Agent \| working/g)?.length, 1);
  assert.equal(firstRender.match(/Todo \| 1 running/g)?.length, 1);

  terminal.writes.length = 0;
  hud.lines = ["HUD | 1s | ↑ 12 ↓ 7 | t/s 19"];
  tui.renderNow();
  const update = terminal.writes.join("");
  assert.match(update, /HUD \| 1s \| ↑ 12 ↓ 7 \| t\/s 19/);
  assert.doesNotMatch(update, /\x1b\[2J\x1b\[H\x1b\[3J/);
  assert.equal(tui.fullRedraws, 1);

  terminal.columns = 40;
  tui.renderNow();
  assert.equal(tui.fullRedraws, 2, "a resize redraws the single composed surface");
});
