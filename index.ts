import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cyberWorkingState as state } from "./editor-state.js";
import { registerCyberWorking } from "./working.js";

function assistantMessage(event: unknown): any | undefined {
  const value = event as { message?: unknown } | undefined;
  return value?.message;
}

export default function cyberWorkingOnly(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    state.onSessionStart();
  });

  pi.on("session_before_switch", async () => {
    state.onSessionSwitch();
  });

  pi.on("agent_start", async () => {
    state.onAgentStart();
  });

  pi.on("turn_start", async () => {
    state.onTurnStart();
  });

  pi.on("agent_end", async () => {
    state.onAgentEnd();
  });

  pi.on("tool_call", async () => {
    state.onToolCall();
  });

  pi.on("tool_result", async () => {
    state.onToolResult();
  });

  pi.on("message_start", async (event) => {
    const message = assistantMessage(event);
    if (message?.role !== "assistant") return;
    state.onAssistantStart(message);
  });

  pi.on("message_update", async (event) => {
    const e = (event as any)?.assistantMessageEvent;
    if (!e || typeof e.type !== "string") return;

    if (
      e.type === "text_delta" ||
      e.type === "thinking_delta" ||
      e.type === "toolcall_delta"
    ) {
      state.onAssistantDelta(e.delta, e.partial ?? {});
      return;
    }

    if (
      e.type === "start" ||
      e.type === "text_start" ||
      e.type === "text_end" ||
      e.type === "thinking_start" ||
      e.type === "thinking_end" ||
      e.type === "toolcall_start" ||
      e.type === "toolcall_end"
    ) {
      state.onAssistantPartial(e.partial ?? {});
      return;
    }

    if (e.type === "done") {
      state.onAssistantDone(e.message ?? {});
      return;
    }

    if (e.type === "error") {
      state.onAssistantError(e.error?.message ? e.error : undefined);
    }
  });

  pi.on("turn_end", async (event) => {
    const message = assistantMessage(event);
    if (message?.role !== "assistant") return;
    state.onAssistantTurnEnd(message);
  });

  registerCyberWorking(pi);
}
