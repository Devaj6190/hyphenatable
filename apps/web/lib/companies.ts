import type { DataKind } from "@/components/DataLabel";

type CompanyInfo = {
  /** Fake display name for the header. */
  name: string;
  /** Short id label used in data labels, e.g. "Company A". */
  label: string;
  kind: DataKind;
  timezone: string;
  /** Current cycle, copied from data/fixtures/<id>/cycles.json until cycles.get is live. */
  cycle: { number: number; periodStart: string; periodEnd: string } | null;
};

// Fake names only. Replaced by company rows and cycles.get once B's functions are live.
// timezone matches each company's data/fixtures/<id>/company.json (Company A is Pennsylvania, per docs/STATUS.md).
export const companies: Record<string, CompanyInfo> = {
  a: {
    name: "Greenline Landscaping",
    label: "Company A",
    kind: "synthetic",
    timezone: "America/New_York",
    cycle: {
      number: 5,
      periodStart: "2026-10-10T04:00:00.000Z",
      periodEnd: "2026-10-24T03:59:59.999Z",
    },
  },
  b: {
    name: "Northfield Heating & Air",
    label: "Company B",
    kind: "synthetic",
    timezone: "America/Los_Angeles",
    cycle: {
      number: 5,
      periodStart: "2026-10-18T07:00:00.000Z",
      periodEnd: "2026-10-25T06:59:59.999Z",
    },
  },
  r: {
    name: "Company R",
    label: "Company R",
    kind: "real, anonymized",
    // No fixture file and no documented zone (the ingest takes it as a parameter). UTC is named on every time,
    // so it is never silently wrong. Replace with the company row's timezone once live.
    timezone: "UTC",
    cycle: null,
  },
};

export const DEFAULT_COMPANY = "a";

// A real company's payroll is never written: RollPay fills a Gusto draft for synthetic companies only (plan A-16).
// The UI hides every fill action for these; Convex should refuse it too (asked of B).
export const REAL_PAYROLL_NOTE =
  "Real company: RollPay never fills its Gusto draft";
export const isRealPayroll = (companyId: string): boolean =>
  companies[companyId]?.kind === "real, anonymized";

export const SEATS_LINE =
  "RollPay fills the seat of the person who prepares and checks payroll before it is submitted.";

export function cyclePeriod(
  c: Pick<CompanyInfo, "timezone" | "cycle">,
): string {
  if (!c.cycle) return "No cycle loaded yet";
  const f = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: c.timezone,
  });
  // Not formatRange: Node and browsers space its output differently, which breaks hydration.
  return `Payroll for ${f.format(new Date(c.cycle.periodStart))} – ${f.format(new Date(c.cycle.periodEnd))}`;
}
