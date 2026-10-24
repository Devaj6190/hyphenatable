// Hours per worker per workweek per local day, in the company timezone.
// An entry counts in full on the local day (and workweek) its startAt falls on; it is never trimmed or split,
// and no break is ever assumed. BREAK, payable=false and held entries are left out, each with a reason.
import type { TimeEntry } from "./types";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The local calendar day of an instant in `timeZone`, as YYYY-MM-DD. */
export function localDate(iso: string, timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  const parts = Object.fromEntries(
    f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Days since 1970-01-01 for a YYYY-MM-DD calendar day. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function dayFromNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * First day of the workweek containing the period start. The rule's `workweek` ("Sunday-Saturday")
 * wins; without one, the workweek starts on the period's first local day (Company A: Sat-Fri).
 */
export function workweekAnchor(
  periodStartDay: string,
  workweek: unknown,
): { anchor: number; source: string } {
  const start = dayNumber(periodStartDay);
  if (typeof workweek === "string") {
    const first = WEEKDAYS.indexOf(workweek.split("-")[0].trim().toLowerCase());
    if (first >= 0) {
      const wd = new Date(start * 86_400_000).getUTCDay();
      return {
        anchor: start - ((wd - first + 7) % 7),
        source: `overtime_policy workweek ${workweek}`,
      };
    }
  }
  return { anchor: start, source: "the pay period's first day" };
}

export type WorkerHours = {
  /** weekStart (YYYY-MM-DD) → local day (YYYY-MM-DD) → seconds */
  weeks: Map<string, Map<string, number>>;
  entryIds: string[];
  seconds: number;
};

export type Skipped = { entryId: string; workerId: string; reason: string };

export function bucketHours(
  entries: TimeEntry[],
  opts: {
    periodStart: string;
    periodEnd: string;
    timeZone: string;
    anchor: number;
    held: Set<string>;
  },
): { byWorker: Map<string, WorkerHours>; skipped: Skipped[] } {
  const byWorker = new Map<string, WorkerHours>();
  const skipped: Skipped[] = [];
  const t0 = Date.parse(opts.periodStart);
  const t1 = Date.parse(opts.periodEnd);
  const sorted = [...entries].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
  );
  for (const e of sorted) {
    const skip = (reason: string) =>
      skipped.push({ entryId: e.id, workerId: e.workerId, reason });
    const t = Date.parse(e.startAt);
    if (Number.isNaN(t) || t < t0 || t > t1) {
      skip("starts outside the pay period");
      continue;
    }
    if (e.category === "BREAK") {
      skip("BREAK entry (unpaid)");
      continue;
    }
    if (e.payable === false) {
      skip("marked not payable in Jobber");
      continue;
    }
    if (opts.held.has(e.id)) {
      skip("held (its flag is open)");
      continue;
    }
    if (!Number.isInteger(e.durationSec) || e.durationSec < 0) {
      skip(`duration ${e.durationSec}s is not a whole non-negative number`);
      continue;
    }
    const day = localDate(e.startAt, opts.timeZone);
    const week = dayFromNumber(
      opts.anchor + Math.floor((dayNumber(day) - opts.anchor) / 7) * 7,
    );
    let w = byWorker.get(e.workerId);
    if (!w) {
      w = { weeks: new Map(), entryIds: [], seconds: 0 };
      byWorker.set(e.workerId, w);
    }
    let days = w.weeks.get(week);
    if (!days) {
      days = new Map();
      w.weeks.set(week, days);
    }
    days.set(day, (days.get(day) ?? 0) + e.durationSec);
    w.entryIds.push(e.id);
    w.seconds += e.durationSec;
  }
  return { byWorker, skipped };
}
