// Input hygiene before every model call (plan B 4.3) and the post-parse guards (plan B 4.4).
// The model gets ids, dates, hours, amounts, categories, job titles and quote statuses. Never names,
// contact refs, notes, phone numbers, SSNs or bank numbers.
import type { MatchDecision } from "../schemas";

export class ScrubError extends Error {
  constructor(
    /** Dotted path to the offending key or value, e.g. `workers.2.contactRef`. Never the value. */
    readonly path: string,
    readonly reason: string,
  ) {
    super(`scrub: ${reason} at ${path || "<root>"}`);
    this.name = "ScrubError";
  }
}

const ALLOWED_NAME_KEYS = new Set(["jobTitle"]);
const NOTE_KEYS = new Set(["note", "notes"]);

// Stripped before scanning so ISO dates/instants and UUIDs are not read as digit runs.
const ISO_DATE =
  /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const PATTERNS: [RegExp, string][] = [
  [/\d{3}-\d{2}-\d{4}/, "SSN-like string"],
  [/\+\d[\d\s().-]{6,}\d/, "phone-like string"],
  // 10+ digits with up to two separators between each: (415) 555-0123, 415.555.0123, 4155550123.
  [/\d(?:[\s().-]{0,2}\d){9,}/, "phone-like string"],
  // 9+ consecutive digits: routing numbers, account numbers, bare SSNs.
  [/\d{9,}/, "bank-like digit run"],
];

function checkKey(key: string, path: string) {
  if (key === "displayName" || key === "contactRef")
    throw new ScrubError(path, `forbidden key "${key}"`);
  if (NOTE_KEYS.has(key.toLowerCase()))
    throw new ScrubError(path, `forbidden key "${key}"`);
  if (/name/i.test(key) && !ALLOWED_NAME_KEYS.has(key))
    throw new ScrubError(path, `forbidden key "${key}"`);
}

function checkString(s: string, path: string) {
  const text = s.replace(ISO_DATE, " ").replace(UUID, " ");
  for (const [re, reason] of PATTERNS)
    if (re.test(text)) throw new ScrubError(path, reason);
}

// ponytail: numbers are not scanned. Cents and ms timestamps are numbers and would trip the
// digit-run rule; phone, SSN and bank fields are strings in the contract. Free-text names inside a
// string value cannot be detected here; keep free text out of model input except the reply being read.
/** Deep-walks `input` and throws a `ScrubError` on the first forbidden key or value. */
export function scrub(input: unknown): void {
  walk(input, "", false);
}

// Values under id keys are not scanned: a Convex id is 32 lowercase alphanumerics and can hold a
// 9+ digit run. Keys under them are still checked. `sourceId`, `recordId`, `providerId` match `Id$`.
const isIdKey = (key: string) =>
  key === "id" || key === "conversationKey" || /Ids?$/.test(key);

function walk(input: unknown, path: string, idValue: boolean): void {
  if (typeof input === "string" && !idValue) checkString(input, path);
  if (input === null || typeof input !== "object") return;
  for (const [key, v] of Object.entries(input)) {
    const p = path ? `${path}.${key}` : key;
    if (!Array.isArray(input)) checkKey(key, p);
    walk(v, p, idValue || isIdKey(key));
  }
}

// ── Post-parse guards (code decides, not the model) ──────────────────────────

const MONEY = /\$\s?\d|\d+\s?(dollars|usd)/i;

/** Throws if outbound text mentions a dollar amount. Run on every `QuestionDraft.text`. */
export function assertNoMoney(text: string): void {
  if (MONEY.test(text))
    throw new Error("assertNoMoney: text contains a money amount");
}

/** True for a bare STOP reply. Code records `kind: "stop"` and never calls the model. */
export const isStop = (raw: string): boolean => /^\s*stop\s*$/i.test(raw);

export const MATCH_MIN_CONFIDENCE = 0.85;

/** A `match` below 0.85, or with no job id, becomes `ask`. */
export function downgradeMatch(decision: MatchDecision): MatchDecision {
  if (decision.kind !== "match") return decision;
  if (decision.confidence >= MATCH_MIN_CONFIDENCE && decision.jobId !== null)
    return decision;
  return { ...decision, kind: "ask" };
}
