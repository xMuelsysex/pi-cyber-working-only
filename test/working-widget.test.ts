import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCyberWorking } from "../working.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => void;

test("places the complete HUD in the native status slot", { concurrency: false }, async () => {
  const handlers = new Map<string, Handler[]>();
  let workingMessage: string | undefined;
  let workingMessageUpdates = 0;
  let workingMessageFailures = 0;
  const visibility: boolean[] = [];
  const indicators: unknown[] = [];
  const pendingText = "Queued | next response";
  const agentDock = "Agent | working";
  const todoDock = "Todo | 1 running";
  const renderOrder = (): string[] => [
    "Assistant output",
    pendingText,
    ...(workingMessage ? [workingMessage] : []),
    agentDock,
    todoDock,
    "Input >",
  ];

  const ui = {
    setWorkingMessage(message?: string): void {
      if (workingMessageFailures > 0) {
        workingMessageFailures -= 1;
        throw new Error("transient native working message failure");
      }
      workingMessage = message;
      workingMessageUpdates += 1;
    },
    setWorkingVisible(visible: boolean): void {
      visibility.push(visible);
    },
    setWorkingIndicator(indicator?: unknown): void {
      indicators.push(indicator);
    },
  };

  const context = {
    mode: "tui" as const,
    hasUI: true,
    ui,
  } as unknown as ExtensionContext;
  const pi = {
    on(event: string, handler: Handler): void {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
  } as unknown as ExtensionAPI;
  registerCyberWorking(pi);

  const emit = (event: string, payload: unknown = {}): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload, context);
  };

  emit("session_start", { reason: "new" });
  assert.equal(workingMessage, undefined);
  assert.deepEqual(visibility.at(-1), true);
  assert.equal(indicators.length, 0, "the indicator is configured only for an active prompt");

  emit("agent_start");
  assert.match(workingMessage ?? "", /0s|↑|↓|t\/s/, "the native slot keeps the complete HUD");
  assert.deepEqual(indicators.at(-1), { frames: [""], intervalMs: 75 });
  const firstUpdateCount = workingMessageUpdates;

  let reportedUiErrors = 0;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("[pi-cyber-working]")) {
      reportedUiErrors += 1;
      return;
    }
    originalConsoleError(...args);
  };
  workingMessageFailures = 1;
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(workingMessageUpdates > firstUpdateCount, "a transient native update failure must be retried");
  assert.equal(reportedUiErrors, 1, "a UI failure must remain diagnosable");

  const lines = renderOrder();
  assert.equal(lines.filter((line) => line === workingMessage).length, 1, "HUD must occupy one rendered row");
  assert.equal(lines.filter((line) => line === agentDock).length, 1, "Agent dock must remain visible");
  assert.equal(lines.filter((line) => line === todoDock).length, 1, "Todo dock must remain visible");
  assert.ok(
    lines.indexOf(workingMessage ?? "") > lines.indexOf(pendingText),
    "HUD must be below pending output text",
  );
  assert.ok(
    lines.indexOf(workingMessage ?? "") < lines.indexOf(agentDock),
    "HUD must precede the navigation docks rather than sit at the bottom",
  );
  assert.ok(lines.indexOf(workingMessage ?? "") < lines.indexOf("Input >"));

  emit("agent_end");
  emit("agent_settled");
  assert.match(workingMessage ?? "", /done/);

  workingMessage = "another owner's native status";
  const updatesBeforeShutdown = workingMessageUpdates;
  emit("session_shutdown");
  assert.equal(workingMessage, "another owner's native status", "teardown must not overwrite another owner's message");
  assert.equal(workingMessageUpdates, updatesBeforeShutdown);
  assert.deepEqual(visibility.at(-1), true);

  emit("session_start", { reason: "reload" });
  emit("agent_start");
  const reloadLines = renderOrder();
  assert.equal(reloadLines.filter((line) => line === workingMessage).length, 1);
  assert.equal(reloadLines.filter((line) => line === agentDock).length, 1);
  assert.equal(reloadLines.filter((line) => line === todoDock).length, 1);
  emit("session_shutdown");
});

test("stops cleanup retries for an invalidated host context", { concurrency: false }, async () => {
  const handlers = new Map<string, Handler[]>();
  let workingMessage: string | undefined;
  const ui = {
    setWorkingMessage: (message?: string) => {
      workingMessage = message;
    },
    setWorkingVisible: (_visible: boolean) => {},
    setWorkingIndicator: (_indicator?: unknown) => {},
  };
  const activeContext = { mode: "tui" as const, hasUI: true, ui } as unknown as ExtensionContext;
  const pi = {
    on(event: string, handler: Handler): void {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
  } as unknown as ExtensionAPI;
  registerCyberWorking(pi);

  const emit = (event: string, payload: unknown = {}, context = activeContext): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload, context);
  };

  emit("session_start");
  emit("agent_start");
  assert.ok(workingMessage);

  let modeReads = 0;
  const invalidatedContext = {
    get mode(): never {
      modeReads += 1;
      throw new Error("context invalidated");
    },
    hasUI: true,
    ui,
  } as unknown as ExtensionContext;
  let reportedErrors = 0;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("[pi-cyber-working]")) {
      reportedErrors += 1;
      return;
    }
    originalConsoleError(...args);
  };
  try {
    emit("session_shutdown", {}, invalidatedContext);
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(modeReads, 0, "teardown should restore through the owned lease context");
  assert.equal(reportedErrors, 0, "an invalid event context must not affect lease cleanup");
});

test("releases only the native lease without clobbering surface state", { concurrency: false }, () => {
  const handlers = new Map<string, Handler[]>();
  let visible = true;
  let workingMessage: string | undefined;
  let workingMessageUpdates = 0;
  let indicatorCalls = 0;
  const ui = {
    setWorkingMessage: (message?: string) => {
      workingMessage = message;
      workingMessageUpdates += 1;
    },
    setWorkingVisible: (nextVisible: boolean) => {
      visible = nextVisible;
    },
    setWorkingIndicator: () => {
      indicatorCalls += 1;
    },
  };
  const context = { mode: "tui" as const, hasUI: true, ui } as unknown as ExtensionContext;
  const pi = {
    on(event: string, handler: Handler): void {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
  } as unknown as ExtensionAPI;
  registerCyberWorking(pi);
  const emit = (event: string, payload: unknown = {}): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload, context);
  };

  emit("session_start");
  workingMessage = "another owner's native status";
  const updatesBeforeShutdown = workingMessageUpdates;
  emit("session_shutdown");

  assert.equal(visible, true, "teardown must restore visibility after releasing the lease");
  assert.equal(workingMessage, "another owner's native status");
  assert.equal(workingMessageUpdates, updatesBeforeShutdown, "releasing the lease must not overwrite the message");
  assert.equal(indicatorCalls, 0, "releasing the lease must not overwrite the native indicator");
});
