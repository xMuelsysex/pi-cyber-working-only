import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { cyberWorkingState, type HudSnapshot } from "./editor-state.js";

type Timer = ReturnType<typeof setTimeout>;
type RGB = readonly [number, number, number];

const C = {
  fgMuted: [169, 177, 214] as RGB,
  fgDim: [86, 95, 137] as RGB,
  teal: [79, 214, 190] as RGB,
  green: [158, 206, 106] as RGB,
  orange: [224, 175, 104] as RGB,
  red: [247, 118, 142] as RGB,
  silverDim: [111, 119, 148] as RGB,
  silverHi: [230, 236, 250] as RGB,
};

const RESET_FG = "\x1b[39m";
const BOLD = "\x1b[1m";
const UNBOLD = "\x1b[22m";
const ESC_HINT_AFTER_MS = 10_000;
// One wall-clock loop renders the pulse and the HUD message together.
const MESSAGE_REFRESH_MS = 33;
const MESSAGE_BUDGET = 100;
const VERB_ROTATE_MS = 8_000;
const TURN_ICON = "\u{f0109}";

function rgb(c: RGB): string {
  return `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
}

function paint(color: RGB, text: string, bold = false): string {
  const open = bold ? `${BOLD}${rgb(color)}` : rgb(color);
  const close = bold ? `${RESET_FG}${UNBOLD}` : RESET_FG;
  return `${open}${text}${close}`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ] as RGB;
}

function isCombining(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  );
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  );
}

function visibleWidth(text: string): number {
  const stripped = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  let width = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0 || isCombining(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

// 32 frames @ 75ms = 2400ms cycle, ported from pi-cyber-ui's silver pulsar.
const PULSE_FRAME_INTERVAL_MS = 75;
const PULSE_FRAME_TEXTS = Array.from({ length: 32 }, (_unused, i) => {
  const phase = i / 32;
  const intensity = 0.5 * (1 - Math.cos(Math.PI * 2 * phase));
  return paint(mix(C.fgDim, C.silverHi, intensity), "●");
});

const LETTER_WAVE_PERIOD_MS = 1_800;
const LETTER_WAVE_DELAY_MS = 120;
const LETTER_WAVE_PEAK = 0.32;
const LETTER_WAVE_HALF = 0.25;

function paintLetterWave(text: string, now: number): string {
  const chars = [...text];
  if (chars.length === 0) return "";

  return `${chars
    .map((ch, i) => {
      const charTime = now - i * LETTER_WAVE_DELAY_MS;
      const phi =
        (((charTime % LETTER_WAVE_PERIOD_MS) + LETTER_WAVE_PERIOD_MS) %
          LETTER_WAVE_PERIOD_MS) /
        LETTER_WAVE_PERIOD_MS;
      const d = Math.abs(phi - LETTER_WAVE_PEAK);
      const wrapped = Math.min(d, 1 - d);
      const intensity =
        wrapped > LETTER_WAVE_HALF
          ? 0
          : 0.5 * (1 + Math.cos((Math.PI * wrapped) / LETTER_WAVE_HALF));
      return `${rgb(mix(C.fgMuted, C.silverHi, intensity))}${ch}`;
    })
    .join("")}${RESET_FG}`;
}

function tpsColor(value: number): RGB {
  if (value >= 100) return C.green;
  if (value >= 60) return C.teal;
  if (value >= 30) return C.orange;
  return C.red;
}

const VERBS = [
  "Reasoning",
  "Analyzing",
  "Resolving",
  "Inferring",
  "Rendering",
  "Iterating",
  "Threading",
  "Distilling",
  "Razonando",
  "Pensando.",
  "Tejiendo.",
  "Afinando.",
  "Analysant",
  "Composant",
  "Éclairant",
  "Tissant..",
  "Pensando.",
  "Ragionare",
  "Denkend..",
  "Cogitans.",
] as const;

const WORKING_LABEL_SUFFIX = "...";
const WORKING_LABEL_WIDTH = Math.max(
  ...VERBS.map((verb) => visibleWidth(`${verb}${WORKING_LABEL_SUFFIX}`)),
);

interface PromptState {
  startedAt: number;
  verb: string;
  verbChangedAt: number;
}

interface Segment {
  text: string;
  importance: number;
  width: number;
}

let prompt: PromptState | undefined;
let timer: Timer | undefined;
let sessionToken = 0;
let lastSummary: string | undefined;
let lastMessage: string | undefined;

function padWorkingLabel(verb: string): string {
  const label = `${verb}${WORKING_LABEL_SUFFIX}`;
  const pad = Math.max(0, WORKING_LABEL_WIDTH - visibleWidth(label));
  return `${label}${" ".repeat(pad)}`;
}

function pickVerb(prev?: string): string {
  for (let i = 0; i < 8; i++) {
    const candidate = VERBS[Math.floor(Math.random() * VERBS.length)]!;
    if (candidate !== prev) return candidate;
  }
  return VERBS[0]!;
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatWorkingElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTokens(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "";
  if (value < 1_000) return `${Math.round(value)}`;
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatTps(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "";
  return value < 1 ? `${value.toFixed(1)}t/s` : `${Math.round(value)}t/s`;
}

function joinDim(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join(paint(C.fgDim, " · "));
}

function seg(text: string, importance: number): Segment {
  return { text, importance, width: visibleWidth(text) };
}

function collectRunningSegments(
  snapshot: HudSnapshot,
  verb: string,
  elapsedMs: number,
  now: number,
): Segment[] {
  const segments: Segment[] = [];
  segments.push(seg(paintLetterWave(padWorkingLabel(verb), now), 100));
  segments.push(seg(paint(C.fgMuted, formatWorkingElapsed(elapsedMs)), 95));

  const inputTokens = formatTokens(snapshot.inputValue ?? snapshot.promptIn);
  const outputTokens = formatTokens(snapshot.output.value);
  if (inputTokens || outputTokens) {
    const input = inputTokens ? paint(C.fgDim, `↑${inputTokens}`) : "";
    const outputColor = snapshot.output.frozen ? C.fgDim : C.fgMuted;
    const outputPrefix = snapshot.output.estimated ? "~" : "";
    const output = outputTokens ? paint(outputColor, `${outputPrefix}↓${outputTokens}`) : "";
    const both = [input, output].filter(Boolean).join(" ");
    if (both) segments.push(seg(both, 70));
  }

  const tpsValue = snapshot.tps.value;
  if (tpsValue !== undefined && Number.isFinite(tpsValue) && tpsValue > 0) {
    const tps = `${snapshot.tps.estimated ? "~" : ""}${formatTps(tpsValue)}`;
    const idle = snapshot.agentState === "thinking" || snapshot.agentState === "idle";
    segments.push(seg(paint(idle ? C.fgDim : tpsColor(tpsValue), tps), 60));
  }

  if (snapshot.promptActive) {
    const turns = Math.max(1, snapshot.promptTurns);
    segments.push(seg(paint(C.fgDim, `${TURN_ICON}${turns}`), 50));
  }

  if (elapsedMs >= ESC_HINT_AFTER_MS) {
    segments.push(seg(paint(C.fgDim, "esc to cancel"), 20));
  }

  return segments;
}

function fitSegments(segments: Segment[], budget: number): string {
  const sep = paint(C.fgDim, " · ");
  const sepWidth = visibleWidth(sep);
  const indexed = segments.map((s, i) => ({ s, i }));
  const survivors = new Set(indexed.map((item) => item.i));
  const labelWidth = segments[0]?.width ?? 0;
  const bracketWidth = visibleWidth(" ()");

  const totalWidth = () => {
    let tailWidth = 0;
    let tailCount = 0;
    for (const { s, i } of indexed) {
      if (!survivors.has(i) || i === 0) continue;
      if (tailCount > 0) tailWidth += sepWidth;
      tailWidth += s.width;
      tailCount += 1;
    }
    return labelWidth + (tailCount > 0 ? bracketWidth + tailWidth : 0);
  };

  for (const { i, s } of [...indexed].sort((a, b) => a.s.importance - b.s.importance)) {
    if (totalWidth() <= budget) break;
    if (s.importance >= 100) continue;
    survivors.delete(i);
  }

  const label = segments[0]?.text ?? "";
  const tail = indexed
    .filter(({ i }) => survivors.has(i) && i !== 0)
    .map(({ s }) => s.text)
    .join(sep);

  if (!tail) return label;
  return `${label} ${paint(C.fgDim, "(")}${tail}${paint(C.fgDim, ")")}`;
}

function tokenSegment(snapshot: HudSnapshot): string {
  const input = formatTokens(snapshot.inputValue ?? snapshot.promptIn);
  const output = formatTokens(snapshot.output.value);
  const outputPrefix = snapshot.output.estimated ? "~" : "";
  return [input ? paint(C.fgDim, `↑${input}`) : "", output ? paint(C.fgMuted, `${outputPrefix}↓${output}`) : ""]
    .filter(Boolean)
    .join(" ");
}

function tpsSegment(snapshot: HudSnapshot): string {
  const tps = formatTps(snapshot.tps.value);
  if (!tps) return "";
  return paint(C.fgDim, `${snapshot.tps.estimated ? "~" : ""}${tps}`);
}

function pulseFrame(elapsedMs: number): string {
  const index =
    Math.floor(Math.max(0, elapsedMs) / PULSE_FRAME_INTERVAL_MS) %
    PULSE_FRAME_TEXTS.length;
  return PULSE_FRAME_TEXTS[index] ?? PULSE_FRAME_TEXTS[0]!;
}

function buildRunningMessage(now = Date.now()): string | undefined {
  if (!prompt) return undefined;
  const elapsedMs = now - prompt.startedAt;

  if (now - prompt.verbChangedAt >= VERB_ROTATE_MS) {
    prompt.verb = pickVerb(prompt.verb);
    prompt.verbChangedAt = now;
  }

  const hud = fitSegments(
    collectRunningSegments(
      cyberWorkingState.snapshot(),
      prompt.verb,
      elapsedMs,
      now,
    ),
    MESSAGE_BUDGET,
  );
  return `${pulseFrame(elapsedMs)} ${hud}`;
}

function buildSummaryMessage(elapsedMs: number, snapshot: HudSnapshot): string {
  const parts: string[] = [
    `${paint(C.green, "✓", true)} ${paint(C.fgMuted, "done")} ${paint(C.fgDim, "·")} ${paint(C.fgMuted, formatElapsed(elapsedMs))}`,
  ];
  const tokens = tokenSegment(snapshot);
  if (tokens) parts.push(tokens);
  const tps = tpsSegment(snapshot);
  if (tps) parts.push(tps);
  if (snapshot.promptTurns > 0) parts.push(paint(C.fgDim, `${TURN_ICON}${snapshot.promptTurns}`));
  return joinDim(parts);
}

function safeUi(ctx: ExtensionContext | undefined, fn: (ctx: ExtensionContext) => void): boolean {
  try {
    if (!ctx?.hasUI) return true;
    fn(ctx);
    return true;
  } catch {
    return false;
  }
}

function setWorkingMessage(ctx: ExtensionContext | undefined, message?: string): boolean {
  return safeUi(ctx, (uiCtx) => uiCtx.ui.setWorkingMessage(message));
}

function applyWorkingIndicator(ctx: ExtensionContext | undefined): boolean {
  // Keep the host working surface active without enabling its independent
  // animation clock. The message loop below owns every animated cell.
  return safeUi(ctx, (uiCtx) => uiCtx.ui.setWorkingIndicator({ frames: [] }));
}

function clearWorkingIndicator(ctx: ExtensionContext | undefined): boolean {
  return safeUi(ctx, (uiCtx) => uiCtx.ui.setWorkingIndicator());
}

function stopTimer(target = timer): void {
  if (!target) return;
  clearTimeout(target);
  if (target === timer) timer = undefined;
}

function invalidateSession(): void {
  sessionToken += 1;
  stopTimer();
  prompt = undefined;
  lastMessage = undefined;
}

function updateWorkingMessage(
  ctx: ExtensionContext | undefined,
  now = Date.now(),
): boolean {
  const message = buildRunningMessage(now);
  if (message === undefined || message === lastMessage) return true;

  const ok = setWorkingMessage(ctx, message);
  if (ok) lastMessage = message;
  return ok;
}

function scheduleMessageFrame(
  ctx: ExtensionContext | undefined,
  token: number,
  delay = MESSAGE_REFRESH_MS,
): void {
  const next = setTimeout(() => {
    if (timer === next) timer = undefined;
    if (token !== sessionToken || !prompt) return;

    const startedAt = Date.now();
    if (!updateWorkingMessage(ctx, startedAt)) return;

    // Compensate for synchronous UI work so a busy render does not create
    // another competing cadence or gradually slow the animation.
    const nextDelay = Math.max(1, MESSAGE_REFRESH_MS - (Date.now() - startedAt));
    scheduleMessageFrame(ctx, token, nextDelay);
  }, delay);
  timer = next;
  if (typeof next.unref === "function") next.unref();
}

function hasUsableUi(ctx: ExtensionContext | undefined): boolean {
  try {
    return Boolean(ctx?.hasUI);
  } catch {
    return false;
  }
}

function startPrompt(ctx: ExtensionContext): void {
  const now = Date.now();
  prompt = {
    startedAt: now,
    verb: pickVerb(),
    verbChangedAt: now,
  };
  lastSummary = undefined;
  lastMessage = undefined;
  applyWorkingIndicator(ctx);
  updateWorkingMessage(ctx, now);
}

function finishPrompt(ctx: ExtensionContext | undefined): void {
  if (!prompt) return;
  const elapsedMs = Date.now() - prompt.startedAt;
  const snapshot = cyberWorkingState.snapshot();
  lastSummary = buildSummaryMessage(elapsedMs, snapshot);
  prompt = undefined;
  lastMessage = undefined;
  setWorkingMessage(ctx, lastSummary);
}

export function registerCyberWorking(pi: ExtensionAPI): void {
  pi.on("session_start", (event, ctx) => {
    invalidateSession();
    applyWorkingIndicator(ctx);
    if (event?.reason === "reload" && lastSummary) {
      setWorkingMessage(ctx, lastSummary);
    } else {
      lastSummary = undefined;
      setWorkingMessage(ctx);
    }
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!hasUsableUi(ctx)) return;
    if (!prompt) startPrompt(ctx);
    else updateWorkingMessage(ctx);

    stopTimer();
    scheduleMessageFrame(ctx, sessionToken);
  });

  // A low-level run may be followed by retry, compaction, or queued input.
  // Pause the message clock here; only agent_settled means the prompt is done.
  pi.on("agent_end", () => {
    stopTimer();
  });

  pi.on("agent_settled", (_event, ctx) => {
    stopTimer();
    finishPrompt(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    invalidateSession();
    lastSummary = undefined;
    setWorkingMessage(ctx);
  });

  pi.on("session_before_switch", () => {
    invalidateSession();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    setWorkingMessage(ctx);
    clearWorkingIndicator(ctx);
    invalidateSession();
  });
}
