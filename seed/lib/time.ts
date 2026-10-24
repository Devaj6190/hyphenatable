// Calendar helpers. Offsets for the two zones the seed uses; US daylight time ends 2026-11-01.
// Only the dates the seed uses are covered (Aug to Dec 2026). Company A: America/New_York (Pennsylvania);
// Company B: America/Los_Angeles (the default).

export const DAY_MS = 86_400_000;

const OFFSETS: Record<string, [string, string]> = {
  "America/Los_Angeles": ["-07:00", "-08:00"],
  "America/New_York": ["-04:00", "-05:00"],
};

export function tzOffset(date: string, tz = "America/Los_Angeles"): string {
  const o = OFFSETS[tz];
  if (!o) throw new Error(`no offsets for time zone ${tz}`);
  if (date < "2026-03-08" || date >= "2027-03-14")
    throw new Error(`date ${date} outside the covered DST range`);
  return date >= "2026-11-01" ? o[1] : o[0];
}

/** The local calendar date (YYYY-MM-DD) of an ISO instant in `tz`. */
export function localDateOf(iso: string, tz = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Local wall time (YYYY-MM-DD, HH:MM) to an ISO UTC string. */
export function local(
  date: string,
  hhmm: string,
  tz = "America/Los_Angeles",
): string {
  return new Date(`${date}T${hhmm}:00${tzOffset(date, tz)}`).toISOString();
}

/** Last Friday on or before `date` (cutoff day). */
export function fridayOnOrBefore(date: string): string {
  let d = date;
  while (weekday(d) !== 5) d = addDays(d, -1);
  return d;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sunday
}

/** Mon-Fri dates in [start, end], skipping holidays. */
export function workdays(
  start: string,
  end: string,
  holidays: string[],
): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd >= 1 && wd <= 5 && !holidays.includes(d)) out.push(d);
  }
  return out;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export function shortDate(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

export function seconds(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 1000;
}
