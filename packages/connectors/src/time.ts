// Period boundaries. A pay period given as dates (YYYY-MM-DD, inclusive) is interpreted in the
// company's IANA timezone and turned into UTC instants; full ISO instants pass through.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Offset of `tz` from UTC at instant `ms`, in ms (e.g. -7h for PDT). */
function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Midnight at the start of `date` (YYYY-MM-DD) in `tz`, as epoch ms. */
export function zonedMidnight(date: string, tz: string): number {
  return zonedWallClock(date, 0, tz);
}

/** Local wall-clock `date` + `minutes` after midnight in `tz`, as epoch ms. */
export function zonedWallClock(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

/** Calendar date of instant `ms` in `tz`. */
export function zonedDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface Period {
  /** inclusive UTC instant */
  startUtc: string;
  /** exclusive UTC instant */
  endUtc: string;
  /** inclusive local dates */
  startDate: string;
  endDate: string;
}

export function resolvePeriod(periodStart: string, periodEnd: string, tz = "UTC"): Period {
  const startMs = DATE_RE.test(periodStart) ? zonedMidnight(periodStart, tz) : Date.parse(periodStart);
  const endMs = DATE_RE.test(periodEnd) ? zonedMidnight(addDays(periodEnd, 1), tz) : Date.parse(periodEnd);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error(`Bad period: ${periodStart} .. ${periodEnd}`);
  if (endMs <= startMs) throw new Error(`Period ends before it starts: ${periodStart} .. ${periodEnd}`);
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    startDate: DATE_RE.test(periodStart) ? periodStart : zonedDate(startMs, tz),
    endDate: DATE_RE.test(periodEnd) ? periodEnd : zonedDate(endMs - 1, tz),
  };
}

/** Inclusive date windows of at most 7 days covering startDate..endDate (Jobber's timeSheetsByDay limit). */
export function weekWindows(startDate: string, endDate: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let s = startDate; s <= endDate; s = addDays(s, 7)) {
    const e = addDays(s, 6);
    out.push({ start: s, end: e < endDate ? e : endDate });
  }
  return out;
}
