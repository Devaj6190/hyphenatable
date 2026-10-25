import { type Reconciliation, reconcile } from "../payroll/reconcile";
import type { Payment as PayrollPayment } from "../payroll/types";
import type {
  CheckId,
  Expense,
  Flag,
  Rule,
  RuleType,
  TimeEntry,
} from "../schemas";
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

/** A source date as a company-local day: QuickBooks sends YYYY-MM-DD, Jobber a UTC instant. */
export function sourceDay(input: CheckInput, d: string): string {
  return d.length === 10 ? d : day(input, d);
}

/** First and last local day of the cycle (both inclusive; bounds may be days or instants). */
export function periodDays(input: CheckInput): [string, string] {
  return [
    sourceDay(input, input.cycle.periodStart),
    sourceDay(input, input.cycle.periodEnd),
  ];
}

/** True when a date or instant falls on a local day of the cycle. */
export function inPeriod(input: CheckInput, at: string | null): boolean {
  if (at === null) return false;
  const [from, to] = periodDays(input);
  const d = sourceDay(input, at);
  return d >= from && d <= to;
}

/** The company's expenses dated inside the cycle (local days, inclusive), each id once. */
export function cycleExpenses(input: CheckInput): Expense[] {
  const byId = new Map<string, Expense>();
  for (const x of input.expenses) {
    if (x.companyId !== input.company.id || byId.has(x.id)) continue;
    if (inPeriod(input, x.date)) byId.set(x.id, x);
  }
  return [...byId.values()].sort((a, b) => cmp(a.id, b.id));
}

/** Active rules of one type for this company, in id order. */
export function activeRules(input: CheckInput, type: RuleType): Rule[] {
  return input.rules
    .filter(
      (r) =>
        r.type === type &&
        r.status === "active" &&
        r.companyId === input.company.id,
    )
    .sort((a, b) => cmp(a.id, b.id));
}

/** Trimmed, case-folded text for comparing names such as vendors and accounts. */
export const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

/**
 * Builds a deterministic flag over jobs, expenses or quotes. `key` names the subject records, so a
 * re-run yields the same id. workerId and jobId in `affects` follow the subject.
 */
export function recordFlag(
  input: CheckInput,
  checkId: CheckId,
  routeTo: Flag["routeTo"],
  key: string,
  subject: Partial<Flag["subject"]>,
  seen: string,
  where: Flag["where"],
  extra: Partial<Pick<Flag, "confidence" | "precedent">> & {
    dollarsCents?: number | null;
  } = {},
): Flag {
  const workerId = subject.workerId ?? null;
  const jobId = subject.jobId ?? null;
  return {
    id: `${checkId}:${input.cycle.id}:${key}`,
    companyId: input.company.id,
    cycleId: input.cycle.id,
    checkId,
    status: "open",
    subject: {
      workerId,
      jobId,
      entryIds: [...(subject.entryIds ?? [])].sort(cmp),
      expenseIds: [...(subject.expenseIds ?? [])].sort(cmp),
    },
    seen,
    where,
    confidence: extra.confidence ?? "certain",
    precedent: extra.precedent ?? null,
    routeTo,
    affects: { workerId, jobId, dollarsCents: extra.dollarsCents ?? null },
    questionId: null,
    correctionId: null,
  };
}

/** Where an expense lives, by its own source. */
export const expenseWhere = (x: Expense): Flag["where"][number] => ({
  system: x.source,
  recordId: x.sourceId,
  url: null,
});

/** Cents for a sentence, e.g. "$214.37". */
export const dollars = (cents: number): string =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * The Stage 2 reconciliation (A-13) over this cycle: labor at the current cost rate, job costs,
 * stale Jobber rates. Payments and quotes are not read for profit, so null amounts cannot leak in.
 */
export function reconcileCycle(input: CheckInput): Reconciliation {
  const own = <T extends { companyId: string }>(xs: T[]) =>
    xs.filter((x) => x.companyId === input.company.id);
  // ponytail: payroll/types.ts mirrors section 6 with non-null payment amounts; reconcile only
  // sums payments into deposit/final totals, which CHK-18 and CHK-21 do not read.
  return reconcile({
    periodStart: input.cycle.periodStart,
    periodEnd: input.cycle.periodEnd,
    timeZone: input.company.timezone,
    jobs: own(input.jobs),
    entries: cycleEntries(input),
    expenses: own(input.expenses),
    invoices: own(input.invoices),
    payments: own(input.payments) as PayrollPayment[],
    workers: own(input.workers),
    rules: own(input.rules),
  });
}
