// B-08/B-09: which flags become a text, what the text says, and what a reply means. Pure: the
// Convex side loads the records and stores the results. Wording comes from C's templates only.
import { isStop, optionIndexFromReply, render } from "../messages/templates";
import { localDate } from "../payroll/hours";
import { hours2 } from "../payroll/money";
import type { CheckId, Interpretation } from "../schemas";

/** The templates a reply can answer. Every other check stays on the dashboard. */
export type QuestionTemplate =
  | "entryNoJob"
  | "openTimer"
  | "longShift"
  | "overlap"
  | "expenseNoJob";

export const TEMPLATE_FOR: Partial<Record<CheckId, QuestionTemplate>> = {
  "CHK-01": "entryNoJob",
  "CHK-02": "openTimer",
  "CHK-03": "longShift",
  "CHK-04": "overlap",
  "CHK-14": "expenseNoJob",
};

export type EntryFacts = {
  id: string;
  startAt: string;
  endAt: string | null;
  durationSec: number;
};

export type QuestionFacts = {
  timezone: string;
  /** The worker the flag is about; the text greets them by first name. */
  workerName: string;
  entries: EntryFacts[];
  /** Up to two candidate job numbers, best first (see candidateJobs). */
  jobNumbers: number[];
  expense: { vendor: string | null; date: string } | null;
};

export type BuiltQuestion = {
  template: QuestionTemplate;
  text: string;
  /** What each numbered option means, 0-based; [] for a free reply (openTimer). */
  options: string[];
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Oct 8" in the company timezone. */
function shortDate(iso: string, tz: string): string {
  const [y, m, d] = localDate(iso, tz).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "7:05am" in the company timezone. */
export function clock(iso: string, tz: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    })
    .replace(/\s/g, "")
    .toLowerCase();
}

const endOf = (e: EntryFacts) =>
  e.endAt ??
  new Date(Date.parse(e.startAt) + e.durationSec * 1000).toISOString();

const span = (e: EntryFacts, tz: string) =>
  `${clock(e.startAt, tz)}-${clock(endOf(e), tz)}`;

/** Null when the flag has no text template or the facts can't fill it (it stays on the dashboard). */
export function buildQuestion(
  checkId: CheckId,
  f: QuestionFacts,
): BuiltQuestion | null {
  const template = TEMPLATE_FOR[checkId];
  if (!template) return null;
  const who = firstName(f.workerName);
  const [e, e2] = f.entries;
  const tz = f.timezone;
  switch (template) {
    case "entryNoJob": {
      if (!e || f.jobNumbers.length < 2) return null;
      const [a, b] = f.jobNumbers.map((n) => `Job ${n}`);
      return {
        template,
        text: render(template, {
          who,
          date: shortDate(e.startAt, tz),
          hours: String(hours2(e.durationSec)),
          jobA: a,
          jobB: b,
        }),
        options: [a, b, "something else"],
      };
    }
    case "openTimer":
      if (!e) return null;
      return {
        template,
        text: render(template, {
          who,
          date: shortDate(e.startAt, tz),
          start: clock(e.startAt, tz),
        }),
        options: [],
      };
    case "longShift":
      if (!e) return null;
      return {
        template,
        text: render(template, {
          who,
          date: shortDate(e.startAt, tz),
          hours: String(hours2(e.durationSec)),
        }),
        options: ["yes", "no, it ended earlier", "forgot to clock out"],
      };
    case "overlap": {
      if (!e || !e2) return null;
      const a = span(e, tz);
      const b = span(e2, tz);
      return {
        template,
        text: render(template, { who, date: shortDate(e.startAt, tz), a, b }),
        options: [a, b, "both, different jobs", "neither"],
      };
    }
    case "expenseNoJob": {
      if (!f.expense || f.jobNumbers.length < 2) return null;
      const [a, b] = f.jobNumbers.map((n) => `Job ${n}`);
      return {
        template,
        text: render(template, {
          who,
          vendor: f.expense.vendor ?? "a",
          date: shortDate(`${f.expense.date}T12:00:00Z`, "UTC"),
          jobA: a,
          jobB: b,
        }),
        options: [a, b, "overhead", "not sure"],
      };
    }
  }
}

type Visit = { jobId: string; startAt: string; assignedWorkerIds: string[] };
type Entry = { workerId: string; jobId: string | null; startAt: string };

/**
 * Jobs the worker was on that local day (assigned visits first, then their other entries), then
 * the jobs they logged most this cycle. Ids only; the caller turns them into job numbers.
 */
export function candidateJobs(
  workerId: string,
  dayIso: string,
  tz: string,
  visits: Visit[],
  entries: Entry[],
): string[] {
  const day = localDate(dayIso, tz);
  const out: string[] = [];
  const add = (id: string | null) => {
    if (id && !out.includes(id)) out.push(id);
  };
  for (const v of visits)
    if (
      v.assignedWorkerIds.includes(workerId) &&
      localDate(v.startAt, tz) === day
    )
      add(v.jobId);
  const mine = entries.filter((x) => x.workerId === workerId && x.jobId);
  for (const x of mine) if (localDate(x.startAt, tz) === day) add(x.jobId);
  const counts = new Map<string, number>();
  for (const x of mine)
    counts.set(x.jobId as string, (counts.get(x.jobId as string) ?? 0) + 1);
  for (const [id] of [...counts].sort((a, b) => b[1] - a[1])) add(id);
  return out.slice(0, 2);
}

/** "4:30pm", "4pm", "16:30", "430 pm" → 24-hour clock; null if it isn't a clock time. */
export function parseClock(text: string): { h: number; m: number } | null {
  const t = text.trim().toLowerCase().replace(/\./g, "");
  const match = t.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  const ap = match[3]?.[0];
  if (m > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
  if (!ap && !match[2]) return null; // a bare "4" is an option number, not a time
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return { h, m };
}

/** The UTC instant of a wall-clock time on a local day in `tz`. */
export function zonedToUtc(day: string, h: number, m: number, tz: string) {
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const offset = (at: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(new Date(at))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first)).toISOString();
}

export type ReplyResult = Interpretation["result"] & { confidence: number };

const ambiguous: ReplyResult = {
  kind: "ambiguous",
  optionIndex: null,
  values: {},
  confidence: 0,
};

/**
 * What a reply means, by code only: STOP, a numbered option, or a clock time for an open timer.
 * Anything else is `ambiguous` (the caller sends one follow-up, then holds). Never guesses.
 */
export function readReply(
  template: QuestionTemplate,
  options: string[],
  text: string,
  facts: { entryIds: string[]; startAt: string | null; timezone: string },
): ReplyResult {
  if (isStop(text))
    return { kind: "stop", optionIndex: null, values: {}, confidence: 1 };
  if (template === "openTimer") {
    const t = parseClock(text);
    if (!t || !facts.startAt) return ambiguous;
    const day = localDate(facts.startAt, facts.timezone);
    const endAt = zonedToUtc(day, t.h, t.m, facts.timezone);
    if (Date.parse(endAt) <= Date.parse(facts.startAt)) return ambiguous;
    return {
      kind: "change",
      optionIndex: null,
      values: { endAt },
      confidence: 1,
    };
  }
  const i = optionIndexFromReply(text, options.length);
  if (i === null) return ambiguous;
  const pick = (r: Omit<ReplyResult, "optionIndex" | "confidence">) => ({
    ...r,
    optionIndex: i,
    confidence: 1,
  });
  const job = options[i]?.match(/^Job (\d+)$/)?.[1];
  switch (template) {
    case "entryNoJob":
      return job
        ? pick({ kind: "change", values: { jobNumber: Number(job) } })
        : pick({ kind: "escalate", values: {} });
    case "expenseNoJob":
      if (job)
        return pick({ kind: "change", values: { jobNumber: Number(job) } });
      return i === 2
        ? pick({ kind: "change", values: { expenseKind: "overhead" } })
        : pick({ kind: "escalate", values: {} });
    case "longShift":
      // "ended earlier" / "forgot to clock out" need the real end time: a person fixes it.
      return i === 0
        ? pick({ kind: "confirm", values: {} })
        : pick({ kind: "escalate", values: {} });
    case "overlap": {
      const [a, b] = facts.entryIds;
      if (i === 0) return pick({ kind: "change", values: { dropEntryId: b } });
      if (i === 1) return pick({ kind: "change", values: { dropEntryId: a } });
      return i === 2
        ? pick({ kind: "confirm", values: {} })
        : pick({ kind: "escalate", values: {} });
    }
  }
}

// ── Free-text replies (Haiku through complete(), or Jev) ─────────────────────────────────────────────

/** What each question asks, for the model. No names: the worker's name is in the text, not here. */
export const PURPOSE: Record<QuestionTemplate, string> = {
  entryNoJob: "A time entry has no job. Which of the options was it?",
  openTimer:
    "The worker's timer is still running. What time did they stop? Put the time in values as time, e.g. 4:30pm.",
  longShift:
    "A shift looks unusually long. Is it right? If they say it ended at a specific time, put that time in values as time.",
  overlap: "Two time entries overlap. Which option is right?",
  expenseNoJob: "A purchase has no job. Which of the options was it for?",
};

/** Replaces every known person's name in a reply with [person] before a model sees it. */
export function redactNames(text: string, names: string[]): string {
  const tokens = [
    ...new Set(
      names.flatMap((n) => n.split(/\s+/)).filter((t) => t.length > 1),
    ),
  ];
  let out = text;
  for (const t of tokens) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[person]");
  }
  return out;
}

export type ModelReading = {
  kind: Interpretation["result"]["kind"];
  optionIndex: number | null;
  values: Record<string, string | number>;
  confidence: number;
};

/**
 * Turns the model's reading into the same result code would give for that option or time, keeping
 * the model's confidence. The model picks; code decides what the pick changes.
 */
export function fromModel(
  m: ModelReading,
  template: QuestionTemplate,
  options: string[],
  facts: { entryIds: string[]; startAt: string | null; timezone: string },
): ReplyResult {
  if (
    m.kind === "escalate" ||
    m.kind === "fixed_in_source" ||
    m.kind === "stop"
  )
    return {
      kind: m.kind,
      optionIndex: null,
      values: {},
      confidence: m.confidence,
    };
  const time = typeof m.values.time === "string" ? m.values.time : null;
  if (time && (template === "openTimer" || template === "longShift")) {
    const r = readReply("openTimer", [], time, facts);
    return r.kind === "change"
      ? { ...r, confidence: m.confidence }
      : ambiguousAt(m.confidence);
  }
  if (
    m.optionIndex !== null &&
    m.optionIndex >= 0 &&
    m.optionIndex < options.length
  ) {
    const r = readReply(template, options, String(m.optionIndex + 1), facts);
    return { ...r, confidence: m.confidence };
  }
  return ambiguousAt(m.confidence);
}

const ambiguousAt = (confidence: number): ReplyResult => ({
  kind: "ambiguous",
  optionIndex: null,
  values: {},
  confidence,
});

/** "it was Job 15", "you stopped at 4:30pm": what a low-confidence reading is asked back as. */
export function restatement(
  template: QuestionTemplate,
  options: string[],
  r: ReplyResult,
  timezone: string,
): string | null {
  if (r.kind === "ambiguous" || r.kind === "escalate") return null;
  if (typeof r.values.endAt === "string")
    return `you stopped at ${clock(r.values.endAt, timezone)}`;
  if (r.optionIndex === null) return null;
  const pick = options[r.optionIndex];
  switch (template) {
    case "entryNoJob":
    case "expenseNoJob":
      return `it was ${pick}`;
    case "overlap":
      return r.optionIndex < 2 ? `${pick} is the right one` : pick;
    case "longShift":
      return r.optionIndex === 0 ? "the shift is right" : null;
    case "openTimer":
      return null;
  }
}

/** A reply to "Reply 1 yes, 2 no". */
export function readYesNo(text: string): "yes" | "no" | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (["1", "yes", "y", "yep", "yeah", "correct", "right"].includes(t))
    return "yes";
  if (["2", "no", "n", "nope", "wrong"].includes(t)) return "no";
  return null;
}
