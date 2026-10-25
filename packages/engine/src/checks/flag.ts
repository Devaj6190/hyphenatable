import type { CheckId, Flag, TimeEntry } from "../schemas";
import type { CheckInput } from "./types";

/** The cycle's entries for this company, each id once (first copy wins). */
export function cycleEntries(input: CheckInput): TimeEntry[] {
  const byId = new Map<string, TimeEntry>();
  for (const e of input.timeEntries) {
    if (e.cycleId !== input.cycle.id || e.companyId !== input.company.id)
      continue;
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/**
 * Same worker, job, start instant and duration: an exact duplicate (CHK-05 owns these; CHK-04
 * skips them). Start is compared as an instant, so "…:00Z" and "…:00.000Z" are the same start.
 */
export function duplicateKey(e: TimeEntry): string {
  return JSON.stringify([
    e.workerId,
    e.jobId,
    Date.parse(e.startAt),
    e.durationSec,
  ]);
}

/** Calendar day of an instant in the company's timezone, e.g. 2026-10-07. */
export function day(input: CheckInput, at: string | number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: input.company.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

/** Seconds as hours for a sentence, e.g. "8.00 h". */
export function hours(sec: number): string {
  return `${(sec / 3600).toFixed(2)} h`;
}

/** The value every entry shares, else null. */
function shared<T>(values: (T | null)[]): T | null {
  return values.every((v) => v === values[0]) ? (values[0] ?? null) : null;
}

/**
 * Builds a deterministic flag over time entries. The id depends only on check, cycle and
 * entry ids, so a re-run yields the same id. Precedent and dollars are left null: the runner
 * fills precedent, and pay is computed elsewhere.
 */
export function entryFlag(
  input: CheckInput,
  checkId: CheckId,
  routeTo: Flag["routeTo"],
  entries: TimeEntry[],
  seen: string,
): Flag {
  const sorted = [...entries].sort((a, b) => cmp(a.id, b.id));
  const entryIds = sorted.map((e) => e.id);
  const workerId = shared(sorted.map((e) => e.workerId));
  const jobId = shared(sorted.map((e) => e.jobId));
  return {
    id: `${checkId}:${input.cycle.id}:${entryIds.join(",")}`,
    companyId: input.company.id,
    cycleId: input.cycle.id,
    checkId,
    status: "open",
    subject: { workerId, jobId, entryIds, expenseIds: [] },
    seen,
    where: sorted.map((e) => ({
      system: "jobber",
      recordId: e.sourceId,
      url: null,
    })),
    confidence: "certain",
    precedent: null,
    routeTo,
    affects: { workerId, jobId, dollarsCents: null },
    questionId: null,
    correctionId: null,
  };
}

/** Locale-independent string order. */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Map.groupBy without needing ES2024 (tsconfig targets ES2022). Keeps first-seen key order. */
export function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
