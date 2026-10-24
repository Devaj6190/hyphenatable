// Calendar helpers. Company A is in America/Los_Angeles; PDT (-07:00) until 2026-11-01, PST (-08:00) after.
// Only the dates the seed uses are covered (Aug to Dec 2026).

export const DAY_MS = 86_400_000;

export function tzOffset(date: string): string {
  return date >= "2026-11-01" ? "-08:00" : "-07:00";
}

/** Local wall time (YYYY-MM-DD, HH:MM) to an ISO UTC string. */
export function local(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00${tzOffset(date)}`).toISOString();
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
