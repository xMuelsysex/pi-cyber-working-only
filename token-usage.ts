/**
 * Lightweight token usage helpers adapted from pi-cyber-ui's cyber HUD.
 * Kept local so this extension does not import pi-cyber-ui's full tool/editor UI.
 */

export type UsageMode = "exact" | "estimated";

const EXACT_USAGE_APIS = new Set<string>(["anthropic-messages"]);

export function getUsageMode(api?: unknown): UsageMode {
  return typeof api === "string" && EXACT_USAGE_APIS.has(api)
    ? "exact"
    : "estimated";
}

type TokenBuckets = {
  whitespace: number;
  punctuation: number;
  digit: number;
  latin: number;
  cjk: number;
  cyrillic: number;
  other: number;
};

const ASCII_KIND = new Uint8Array(128);

const CharKind = {
  Whitespace: 0,
  Punctuation: 1,
  Digit: 2,
  Latin: 3,
} as const;

(function initAsciiKind() {
  for (const c of [0x09, 0x0a, 0x0d, 0x20]) ASCII_KIND[c] = CharKind.Whitespace;
  for (let c = 0x30; c <= 0x39; c++) ASCII_KIND[c] = CharKind.Digit;
  for (let c = 0x41; c <= 0x5a; c++) ASCII_KIND[c] = CharKind.Latin;
  for (let c = 0x61; c <= 0x7a; c++) ASCII_KIND[c] = CharKind.Latin;
  for (let c = 0x21; c <= 0x7e; c++) {
    if (ASCII_KIND[c] === CharKind.Whitespace) continue;
    if (ASCII_KIND[c] === CharKind.Latin) continue;
    if (ASCII_KIND[c] === CharKind.Digit) continue;
    ASCII_KIND[c] = CharKind.Punctuation;
  }
})();

function classifyCodePoint(cp: number): keyof TokenBuckets {
  if (cp < 128) {
    switch (ASCII_KIND[cp]) {
      case CharKind.Whitespace:
        return "whitespace";
      case CharKind.Punctuation:
        return "punctuation";
      case CharKind.Digit:
        return "digit";
      default:
        return "latin";
    }
  }

  if (cp >= 0x4e00 && cp <= 0x9fff) return "cjk";
  if (cp >= 0x3400 && cp <= 0x4dbf) return "cjk";
  if (cp >= 0xf900 && cp <= 0xfaff) return "cjk";
  if (cp >= 0x3040 && cp <= 0x30ff) return "cjk";
  if (cp >= 0xac00 && cp <= 0xd7af) return "cjk";
  if (cp >= 0x3000 && cp <= 0x303f) return "cjk";
  if (cp >= 0xff00 && cp <= 0xffef) return "cjk";

  if (cp >= 0x0400 && cp <= 0x04ff) return "cyrillic";

  return "other";
}

function estimateTokensFromBuckets(b: TokenBuckets): number {
  return (
    b.punctuation +
    Math.ceil(b.digit / 3) +
    Math.ceil(b.latin / 4.5) +
    b.cjk +
    Math.ceil(b.cyrillic / 3.3) +
    Math.ceil(b.other / 2.5)
  );
}

export class StreamingTokenEstimator {
  private readonly b: TokenBuckets = {
    whitespace: 0,
    punctuation: 0,
    digit: 0,
    latin: 0,
    cjk: 0,
    cyrillic: 0,
    other: 0,
  };

  reset(): void {
    this.b.whitespace = 0;
    this.b.punctuation = 0;
    this.b.digit = 0;
    this.b.latin = 0;
    this.b.cjk = 0;
    this.b.cyrillic = 0;
    this.b.other = 0;
  }

  add(delta: string): void {
    for (const ch of delta) {
      this.b[classifyCodePoint(ch.codePointAt(0) ?? 0)] += 1;
    }
  }

  value(): number {
    return estimateTokensFromBuckets(this.b);
  }
}
