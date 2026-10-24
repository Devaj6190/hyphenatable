import corrections from "@/app/_fixtures/corrections.json";

// Mirrors Correction in docs/plans/00-shared-context.md section 6. B's corrections.* replace the fixture.
export type Correction = {
  id: string;
  companyId: string;
  cycleId: string;
  flagId: string;
  target: { table: string; id: string; field: string };
  before: string | number | null;
  after: string | number | null;
  effectPayCents: number;
  effectProfitCents: number;
  status: "proposed" | "approved" | "applied" | "rejected";
  source: "reply" | "owner" | "rule";
  approvedBy: string | null;
  approvedAt: string | null;
};

export const fixtureCorrections = corrections as Correction[];
export const CORRECTIONS_FIXTURE_SOURCE =
  "placeholder fixture, apps/web/app/_fixtures/corrections.json";

// flags.json predates corrections, so fall back to the flag id when correctionId is not set yet.
export const correctionFor = (flagId: string, correctionId: string | null) =>
  fixtureCorrections.find((c) =>
    correctionId ? c.id === correctionId : c.flagId === flagId,
  );

const tableWord: Record<string, string> = {
  timeEntries: "Time entry",
  expenses: "Purchase",
  workers: "Worker",
  jobs: "Job",
};
const fieldWord: Record<string, string> = {
  jobId: "job",
  hours: "hours",
  startAt: "start",
  endAt: "end",
  rateCents: "pay rate",
};

/** "Time entry a-te-0177 · job" */
export const targetInWords = (t: Correction["target"]) =>
  `${tableWord[t.table] ?? t.table} ${t.id} · ${fieldWord[t.field] ?? t.field}`;

// A money field never reaches a manager view, before or after.
export const isMoneyField = (field: string) => /cents$/i.test(field);
