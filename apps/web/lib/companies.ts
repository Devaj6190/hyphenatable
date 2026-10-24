import type { DataKind } from "@/components/DataLabel";

// Fake names only. Replaced by cycles.list / company rows once B's functions are live.
export const companies: Record<string, { name: string; kind: DataKind }> = {
  a: { name: "Company A (synthetic landscaping crew)", kind: "synthetic" },
  b: { name: "Company B (synthetic HVAC)", kind: "synthetic" },
  r: { name: "Company R (anonymized)", kind: "real, anonymized" },
};

export const SEATS_LINE =
  "PayrollPilot fills the seat of the person who prepares and checks payroll before it is submitted.";
