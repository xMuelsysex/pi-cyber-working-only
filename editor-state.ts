import { getUsageMode, StreamingTokenEstimator, type UsageMode } from "./token-usage.js";

type AgentState = "idle" | "running" | "thinking";

interface AssistantMessageLike {
  role?: unknown;
  api?: unknown;
  usage?: {
    input?: number;
    output?: number;
  };
}

export interface DisplayValue {
  value?: number;
  estimated: boolean;
}

export interface OutputDisplayValue extends DisplayValue {
  frozen: boolean;
}

export interface HudSnapshot {
  agentState: AgentState;
  promptActive: boolean;
  promptTurns: number;
  promptIn: number;
  inputValue?: number;
  output: OutputDisplayValue;
  tps: DisplayValue;
  toolDepth: number;
}

function usageInput(message: AssistantMessageLike): number {
  const value = message.usage?.input;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function usageOutput(message: AssistantMessageLike): number {
  const value = message.usage?.output;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

class CyberWorkingState {
  private agentState: AgentState = "idle";
  private promptIn = 0;
  private promptOut = 0;
  private promptTurns = 0;
  private promptActive = false;

  private msgActive = false;
  private msgStartMs = 0;
  private msgIn: number | undefined;
  private msgOut: number | undefined;
  private estOut: number | undefined;
  private msgHasAccurateOut = false;
  private liveTpsActive = false;
  private msgUsageMode: UsageMode = "estimated";
  private readonly msgEstimator = new StreamingTokenEstimator();

  private firstOutMs = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  private toolDepth = 0;

  private exactTps: number | undefined;
  private estTps: number | undefined;
  private snapOut: number | undefined;
  private snapOutEst = false;
  private snapTps: number | undefined;
  private snapTpsEst = false;

  resetAll(): void {
    this.promptIn = 0;
    this.promptOut = 0;
    this.promptTurns = 0;
    this.promptActive = false;
    this.firstOutMs = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.toolDepth = 0;
    this.exactTps = undefined;
    this.estTps = undefined;
    this.snapOut = undefined;
    this.snapTps = undefined;
    this.snapOutEst = false;
    this.snapTpsEst = false;
    this.resetMsg();
    this.agentState = "idle";
  }

  onSessionStart(): void {
    this.resetAll();
    this.promptActive = true;
  }

  onSessionSwitch(): void {
    this.resetAll();
    this.promptActive = true;
  }

  onAgentStart(): void {
    this.resetAll();
    this.promptActive = true;
    this.agentState = "running";
  }

  onTurnStart(): void {
    this.promptTurns += 1;
    this.agentState = "running";
  }

  onAgentEnd(): void {
    this.resumeClock();
    this.promptActive = false;
    this.agentState = "idle";
    this.refreshExactTps();
    this.refreshEstTps();
  }

  onToolCall(): void {
    this.toolDepth += 1;
    if (this.firstOutMs && !this.pausedAt) {
      this.pausedAt = Date.now();
    }
    this.agentState = "thinking";
  }

  onToolResult(): void {
    this.toolDepth = Math.max(0, this.toolDepth - 1);
    if (this.toolDepth === 0) {
      this.resumeClock();
      this.refreshExactTps();
      this.refreshEstTps();
      this.agentState = "running";
    }
  }

  onAssistantStart(message: AssistantMessageLike): void {
    if (message.role !== "assistant") return;
    this.resetMsg();
    this.msgActive = true;
    this.msgStartMs = Date.now();
    this.msgUsageMode = getUsageMode(message.api);
    this.syncMessage(message);
  }

  onAssistantDelta(delta: unknown, partial: AssistantMessageLike): void {
    if (typeof delta === "string" && delta.length > 0) {
      if (!this.firstOutMs) this.firstOutMs = Date.now();
      this.liveTpsActive = true;
      this.msgEstimator.add(delta);
      this.estOut = this.msgEstimator.value();
      this.refreshEstTps();
    }
    this.syncMessage(partial);
  }

  onAssistantPartial(partial: AssistantMessageLike): void {
    if (usageOutput(partial) > 0 || usageInput(partial) > 0) {
      this.liveTpsActive = true;
    }
    this.syncMessage(partial);
  }

  onAssistantDone(message: AssistantMessageLike): void {
    this.liveTpsActive = false;
    if (!this.firstOutMs && usageOutput(message) > 0) {
      this.firstOutMs = this.msgStartMs || Date.now();
    }
    this.syncMessage(message, true);
    this.refreshExactTps();
  }

  onAssistantError(message: AssistantMessageLike | undefined): void {
    this.liveTpsActive = false;
    if (message) {
      if (!this.firstOutMs && usageOutput(message) > 0) {
        this.firstOutMs = this.msgStartMs || Date.now();
      }
      this.syncMessage(message, true);
    }
    this.refreshExactTps();
  }

  onAssistantTurnEnd(message: AssistantMessageLike): void {
    if (message.role !== "assistant") return;
    this.liveTpsActive = false;
    this.resumeClock();
    if (!this.firstOutMs && usageOutput(message) > 0) {
      this.firstOutMs = this.msgStartMs || Date.now();
    }
    this.syncMessage(message, true);
    this.commit();
    this.refreshExactTps();
  }

  snapshot(): HudSnapshot {
    const exactIn = this.exactIn();
    const exactOut = this.exactOut();
    const estOut = this.estDisplayOut();
    const displayOut = exactOut ?? estOut ?? this.snapOut;
    const outputEstimated = exactOut === undefined && (estOut !== undefined || this.snapOutEst);
    const liveTps = this.liveTpsActive
      ? this.computeLiveTps(displayOut, outputEstimated)
      : undefined;
    const displayTps = liveTps?.value ?? this.exactTps ?? this.estTps ?? this.snapTps;
    const tpsEstimated = liveTps?.estimated ?? (this.exactTps === undefined && (this.estTps !== undefined || this.snapTpsEst));

    return {
      agentState: this.agentState,
      promptActive: this.promptActive,
      promptTurns: this.promptTurns,
      promptIn: this.promptIn,
      inputValue: exactIn,
      output: {
        value: displayOut,
        estimated: outputEstimated,
        frozen: this.toolDepth > 0,
      },
      tps: {
        value: displayTps,
        estimated: tpsEstimated,
      },
      toolDepth: this.toolDepth,
    };
  }

  private resetMsg(): void {
    this.msgActive = false;
    this.msgStartMs = 0;
    this.msgIn = undefined;
    this.msgOut = undefined;
    this.estOut = undefined;
    this.msgHasAccurateOut = false;
    this.liveTpsActive = false;
    this.msgUsageMode = "estimated";
    this.msgEstimator.reset();
  }

  private elapsed(): number {
    if (!this.firstOutMs) return 0;
    const activePause = this.pausedAt ? Date.now() - this.pausedAt : 0;
    return Math.max(0, Date.now() - this.firstOutMs - this.pausedTotal - activePause);
  }

  private resumeClock(): void {
    if (!this.pausedAt) return;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  private exactOut(): number | undefined {
    if (this.msgActive) {
      if (!this.msgHasAccurateOut || this.msgOut === undefined) return undefined;
      return this.promptOut + this.msgOut;
    }
    return this.promptOut > 0 ? this.promptOut : undefined;
  }

  private estDisplayOut(): number | undefined {
    if (!this.msgActive || this.estOut === undefined) return undefined;
    return this.promptOut + this.estOut;
  }

  private exactIn(): number | undefined {
    if (this.msgActive) {
      if (this.msgIn === undefined) return this.promptIn > 0 ? this.promptIn : undefined;
      return this.promptIn + this.msgIn;
    }
    return this.promptIn > 0 ? this.promptIn : undefined;
  }

  private computeLiveTps(output: number | undefined, estimated: boolean): DisplayValue | undefined {
    if (output === undefined || output <= 0 || !this.firstOutMs) return undefined;
    const seconds = this.elapsed() / 1000;
    if (seconds <= 0) return undefined;
    return { value: output / seconds, estimated };
  }

  private refreshExactTps(): void {
    const out = this.exactOut();
    if (out !== undefined && out > 0) {
      this.snapOut = out;
      this.snapOutEst = false;
    }
    if (out === undefined || out <= 0 || !this.firstOutMs) return;
    const seconds = this.elapsed() / 1000;
    if (seconds > 0) {
      this.exactTps = out / seconds;
      this.snapTps = this.exactTps;
      this.snapTpsEst = false;
    }
  }

  private refreshEstTps(): void {
    const out = this.estDisplayOut();
    if (out === undefined || out <= 0 || !this.firstOutMs) return;
    if (this.snapOut === undefined) {
      this.snapOut = out;
      this.snapOutEst = true;
    }
    const seconds = this.elapsed() / 1000;
    if (seconds > 0) {
      this.estTps = out / seconds;
      if (this.snapTps === undefined) {
        this.snapTps = this.estTps;
        this.snapTpsEst = true;
      }
    }
  }

  private syncMessage(message: AssistantMessageLike, final = false): void {
    const input = usageInput(message);
    const output = usageOutput(message);
    if (final || input > 0) this.msgIn = input;
    if (final || output > 0 || this.msgOut !== undefined) {
      this.msgOut = output;
      if (final || (this.msgUsageMode === "exact" && output > 0)) {
        this.msgHasAccurateOut = true;
      }
      this.refreshExactTps();
    }
  }

  private commit(): void {
    this.promptIn += this.msgIn ?? 0;
    this.promptOut += this.msgOut ?? 0;
    this.estTps = undefined;
    this.resetMsg();
    this.refreshExactTps();
  }
}

export const cyberWorkingState = new CyberWorkingState();
