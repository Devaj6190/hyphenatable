import workbook from "@/app/_fixtures/workbook.json";
import { formatCents } from "@/lib/money";
import type { Flag } from "@/lib/types";

// Workbook values come from app/_fixtures/workbook.json (scripts/workbook-fixture.ts) until drafts.get is live.
// Nothing here computes pay: amounts are read as stored. Only records are counted.
export type Stage1Line = {
  workerId: string;
  kind: "hourly" | "salary";
  regularHours: number | null;
  overtimeHours: number | null;
  rateCents: number | null;
  /** null when the worker is excluded: unknown is never zero. */
  grossCents: number | null;
  held: boolean;
  reason: string | null;
  heldFlagIds: string[];
  recordId: string;
};

export type JobRow = {
  jobId: string;
  jobNumber: number | null;
  title: string | null;
  revenueCents: number | null;
  laborCents: number | null;
  jobCostCents: number | null;
  profitCents: number | null;
  marginPct: number | null;
  low: boolean;
  provisional: boolean;
  hints: string[];
};

export type CycleWorkbook = {
  cycle: {
    id: string;
    number: number;
    periodStart: string;
    periodEnd: string;
    stage: string;
    questionsAsked: number;
    gustoPayrollId: string | null;
  };
  syncRuns: {
    id: string;
    source: string;
    object: string;
    pulled: number;
    expected: number;
    complete: boolean;
  }[];
  /** "engine": computed draft for an open cycle. "paid": what Gusto and Venmo paid in a closed cycle. */
  basis: "engine" | "paid";
  draftId: string | null;
  draftStatus: "computed" | "approved" | "filled" | "calculated" | null;
  stage1: {
    lines: Stage1Line[];
    totalCents: number;
    venmo: {
      workerId: string;
      hours: number | null;
      rateCents: number | null;
      amountCents: number;
      recordId: string;
    }[];
    venmoHeld: { workerId: string; reason: string }[];
  };
  stage2: {
    lines: {
      workerId: string;
      name: string;
      amountCents: number;
      recordId: string;
    }[];
    totalCents: number;
    held: { workerId: string | null; what: string; reason: string }[];
  };
  jobs: JobRow[] | null;
  totalProfitCents: number | null;
  lowMarginPct?: number | null;
};

type Company = {
  workers: Record<string, { name: string; payType: string }>;
  cycles: CycleWorkbook[];
};
const fixture = workbook as unknown as {
  source: string;
  companies: Record<string, Company>;
};
export const WORKBOOK_SOURCE = fixture.source;

const companyData = (companyId: string): Company | null =>
  fixture.companies[companyId] ?? null;

export const cyclesFor = (companyId: string) =>
  companyData(companyId)?.cycles ?? [];

export const workerLabel = (companyId: string, workerId: string) =>
  companyData(companyId)?.workers[workerId]?.name ?? workerId;

/** The cycle before this one, for "questions this cycle vs last". */
export const previousCycle = (companyId: string, cycleId: string) => {
  const all = cyclesFor(companyId);
  const i = all.findIndex((c) => c.cycle.id === cycleId);
  return i > 0 ? all[i - 1] : null;
};

/** Short period, "Oct 10 – Oct 23", in the company timezone. Period ends are exclusive-ish (03:59:59 next day). */
export function periodLabel(
  c: { periodStart: string; periodEnd: string },
  timeZone: string,
) {
  const f = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
  return `${f.format(new Date(c.periodStart))} – ${f.format(new Date(c.periodEnd))}`;
}

export type Hold = {
  key: string;
  workerId: string | null;
  what: string;
  reason: string;
};

/** Every held item in the cycle, from the engine's reasons: Stage 1 lines, the Venmo list and Stage 2. */
export function holdsOf(wb: CycleWorkbook): Hold[] {
  return [
    ...wb.stage1.lines
      .filter((l) => l.held)
      .map((l) => ({
        key: `s1-${l.workerId}`,
        workerId: l.workerId,
        what: "Wages",
        reason: l.reason ?? `held by ${l.heldFlagIds.join(", ")}`,
      })),
    ...wb.stage1.venmoHeld.map((v) => ({
      key: `v-${v.workerId}`,
      workerId: v.workerId,
      what: "Venmo hours",
      reason: v.reason,
    })),
    ...wb.stage2.held.map((h, i) => ({
      key: `s2-${i}`,
      workerId: h.workerId,
      what: h.what,
      reason: h.reason,
    })),
  ];
}

export type Readiness = {
  /** Time entries pulled with no flag on them; null when the sync didn't report entries. */
  clean: number | null;
  pulled: { pulled: number; expected: number; complete: boolean } | null;
  fixed: number;
  open: number;
  held: number;
  incompleteSyncs: number;
};

/** Counts records, never money. Flags are the flags.list result (fixture until B's query is live). */
export function readinessOf(wb: CycleWorkbook, flags: Flag[]): Readiness {
  const mine = flags.filter((f) => f.cycleId === wb.cycle.id);
  const entries = wb.syncRuns.find((s) => s.object === "timeSheetEntries");
  const flagged = new Set(mine.flatMap((f) => f.subject.entryIds)).size;
  return {
    clean: entries ? entries.pulled - flagged : null,
    pulled: entries ?? null,
    fixed: mine.filter((f) => f.status === "corrected").length,
    open: mine.filter((f) => ["open", "asked", "answered"].includes(f.status))
      .length,
    // The engine already applies held flags, so its holds are the whole list.
    held: holdsOf(wb).length,
    incompleteSyncs: wb.syncRuns.filter((s) => !s.complete).length,
  };
}

/** Stage 1 and 2 lines as CSV, values exactly as stored (cents and the formatted amount). */
export function workbookCsv(companyId: string, wb: CycleWorkbook): string {
  const rows: (string | number | null)[][] = [
    [
      "cycle",
      "stage",
      "worker_id",
      "worker",
      "earning",
      "regular_hours",
      "overtime_hours",
      "rate_cents",
      "amount_cents",
      "amount",
      "held",
      "reason",
      "source_record",
    ],
  ];
  const name = (id: string) => workerLabel(companyId, id);
  for (const l of wb.stage1.lines)
    rows.push([
      wb.cycle.id,
      1,
      l.workerId,
      name(l.workerId),
      l.kind,
      l.regularHours,
      l.overtimeHours,
      l.rateCents,
      l.grossCents,
      l.grossCents === null ? "" : formatCents(l.grossCents),
      l.held ? "yes" : "no",
      l.reason,
      l.recordId,
    ]);
  for (const v of wb.stage1.venmo)
    rows.push([
      wb.cycle.id,
      "venmo",
      v.workerId,
      name(v.workerId),
      "venmo",
      v.hours,
      null,
      v.rateCents,
      v.amountCents,
      formatCents(v.amountCents),
      "no",
      null,
      v.recordId,
    ]);
  for (const s of wb.stage2.lines)
    rows.push([
      wb.cycle.id,
      2,
      s.workerId,
      name(s.workerId),
      s.name,
      null,
      null,
      null,
      s.amountCents,
      formatCents(s.amountCents),
      "no",
      null,
      s.recordId,
    ]);
  for (const h of holdsOf(wb).filter((h) => !h.key.startsWith("s1-")))
    rows.push([
      wb.cycle.id,
      h.key.startsWith("v-") ? "venmo" : 2,
      h.workerId,
      h.workerId ? name(h.workerId) : null,
      h.what,
      null,
      null,
      null,
      null,
      "",
      "yes",
      h.reason,
      null,
    ]);
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}
