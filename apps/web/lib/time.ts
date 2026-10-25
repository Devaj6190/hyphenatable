// Times are stored as UTC ISO strings and shown in the company's own timezone, with the zone named
// ("Oct 24, 4:12 AM EDT") so a reader never has to guess which clock it is.
//
// The string is built from Intl's parts, not from format(): with a zone name, engines disagree on the glue
// between date and time ("Oct 24, 4:12 AM EDT" vs "Oct 24 at 4:12 AM EDT"), and a server/browser difference
// would be a hydration mismatch. Parts carry only the values, so the output is the same everywhere.
const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatWhen(iso: string, timezone: string): string {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: timezone,
    });
    formatters.set(timezone, f);
  }
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date(iso))) p[part.type] = part.value;
  return `${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}
