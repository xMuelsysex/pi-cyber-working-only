import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCyberWorking } from "../working.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => void;

test("renders the complete HUD through one stable widget", { concurrency: false }, async () => {
  const handlers = new Map<string, Handler[]>();
  let widget: string[] | undefined;
  let widgetPlacement: string | undefined;
  let widgetUpdates = 0;
  let workingMessageCalls = 0;
  const widgetKeys: string[] = [];
  const visibility: boolean[] = [];
  const indicators: unknown[] = [];
  let widgetFailures = 0;
  const hostWidgets = new Map<string, string[]>();
  const agentDock = ["Agent | working"];
  const todoDock = ["Todo | 1 running"];
  const renderedLines = (): string[] => [
    ...hostWidgets.values(),
    ...agentDock,
    ...todoDock,
  ].flat();

  const ui = {
    setWidget(key: string, content: unknown, options?: { placement?: string }): void {
      assert.equal(key, "cyber-working-hud");
      widgetKeys.push(key);
      if (widgetFailures > 0) {
        widgetFailures -= 1;
        throw new Error("transient widget update failure");
      }
      widgetUpdates += 1;
      if (content === undefined) {
        hostWidgets.delete(key);
        widget = undefined;
        widgetPlacement = undefined;
        return;
      }
      widgetPlacement = options?.placement;
      widget = [...(content as string[])];
      hostWidgets.set(key, widget);
    },
    setWorkingMessage: () => {
      workingMessageCalls += 1;
    },
    setWorkingVisible: (visible: boolean) => {
      visibility.push(visible);
    },
    setWorkingIndicator: (indicator?: unknown) => {
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

  assert.ok(widget, "the working widget should be installed");
  assert.deepEqual(widget, []);
  assert.equal(widgetPlacement, "aboveEditor");
  assert.deepEqual(visibility.at(-1), false);
  assert.equal(indicators.length, 0, "claiming the native surface must not overwrite its indicator");
  assert.deepEqual(renderedLines(), ["Agent | working", "Todo | 1 running"]);

  emit("agent_start");
  const runningLine = widget?.[0] ?? "";
  assert.match(runningLine, /0s|↑|↓|t\/s/, "the regular widget keeps the complete HUD");
  assert.equal(widget?.length, 1);
  const firstUpdateCount = widgetUpdates;
  let reportedUiErrors = 0;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("[pi-cyber-working]")) {
      reportedUiErrors += 1;
      return;
    }
    originalConsoleError(...args);
  };
  widgetFailures = 1;
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(widgetUpdates > firstUpdateCount, "a transient widget failure must be retried");
  assert.equal(reportedUiErrors, 1, "a UI failure must remain diagnosable");
  assert.equal(widget?.length, 1);
  const lines = renderedLines();
  assert.equal(lines.filter((line) => line === widget?.[0]).length, 1, "HUD must occupy one rendered row");
  assert.equal(lines.filter((line) => line === agentDock[0]).length, 1, "Agent dock must remain visible");
  assert.equal(lines.filter((line) => line === todoDock[0]).length, 1, "Todo dock must remain visible");
  assert.equal(hostWidgets.size, 1, "the host must retain one widget surface");
  assert.equal(new Set(widgetKeys).size, 1, "all updates must use one host widget key");
  assert.equal(workingMessageCalls, 0, "the host working-message slot must stay unused");

  emit("agent_end");
  emit("agent_settled");
  assert.match(widget?.[0] ?? "", /done/);

  let cleanupErrors = 0;
  const cleanupConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("[pi-cyber-working]")) {
      cleanupErrors += 1;
      return;
    }
    cleanupConsoleError(...args);
  };
  widgetFailures = 1;
  try {
    emit("session_shutdown");
    assert.equal(workingMessageCalls, 0, "teardown must not overwrite another owner's working message");
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    console.error = cleanupConsoleError;
  }
  assert.equal(cleanupErrors, 1, "a teardown failure must remain diagnosable");
  assert.equal(widget, undefined);
  assert.equal(hostWidgets.size, 0, "teardown must remove the HUD without touching the other docks");
  assert.deepEqual(visibility.at(-1), true);
});

test("stops cleanup retries for an invalidated host context", { concurrency: false }, async () => {
  const handlers = new Map<string, Handler[]>();
  let widget: string[] | undefined;
  const ui = {
    setWidget: (_key: string, content: unknown): void => {
      widget = content === undefined ? undefined : [...(content as string[])];
    },
    setWorkingMessage: () => {},
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
  assert.ok(widget);

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

  assert.equal(modeReads, 1, "teardown should not inspect the invalid event context while restoring the owned surface");
  assert.equal(reportedErrors, 1, "an invalid context should remain diagnosable");
});

test("restores only native visibility without clobbering the surface state", { concurrency: false }, () => {
  const handlers = new Map<string, Handler[]>();
  let visible = true;
  let widget: string[] | undefined;
  let workingMessageCalls = 0;
  let indicatorCalls = 0;
  const ui = {
    setWidget: (_key: string, content: unknown): void => {
      widget = content === undefined ? undefined : [...(content as string[])];
    },
    setWorkingMessage: () => {
      workingMessageCalls += 1;
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
    emit("session_start");
    emit("session_shutdown");
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(reportedErrors, 0, "a successful lease must not report a UI failure");
  assert.equal(visible, true, "teardown must restore visibility after releasing the lease");
  assert.equal(workingMessageCalls, 0, "releasing the lease must not overwrite the native working message");
  assert.equal(indicatorCalls, 0, "releasing the lease must not overwrite the native indicator");
  assert.equal(widget, undefined);
});
