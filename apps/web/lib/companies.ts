import type { DataKind } from "@/components/DataLabel";

// Fake names only. Replaced by cycles.list / company rows once B's functions are live.
// timezone matches each company's data/fixtures/<id>/company.json (Company A is Pennsylvania, per docs/STATUS.md).
export const companies: Record<
  string,
  { name: string; kind: DataKind; timezone: string }
> = {
  a: {
    name: "Company A (synthetic landscaping crew)",
    kind: "synthetic",
    timezone: "America/New_York",
  },
  b: {
    name: "Company B (synthetic HVAC)",
    kind: "synthetic",
    timezone: "America/Los_Angeles",
  },
  // Company R has no fixture file and no documented zone (the ingest takes it as a parameter). UTC is shown in the
  // zone label on every time, so it is never silently wrong. Replace with the company row's timezone once live.
  r: {
    name: "Company R (anonymized)",
    kind: "real, anonymized",
    timezone: "UTC",
  },
};

export const SEATS_LINE =
  "PayrollPilot fills the seat of the person who prepares and checks payroll before it is submitted.";
