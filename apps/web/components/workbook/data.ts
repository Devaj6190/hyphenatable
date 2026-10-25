import { formatCents } from "@/lib/money";
import type { SourceSystem } from "@/lib/types";

// Workbook values come from app/_fixtures/workbook.json (scripts/workbook-fixture.ts) through
// workbookView in lib/server/fixtures.ts until drafts.get is live. Nothing here computes pay: amounts are read
// as stored. Only records are counted.

/** One earning as the engine (open cycle) or Gusto (closed cycle) stored it. */
export type EarningLine = {
  name: string;
  /** Unrounded seconds behind the hours; null for salary and for Gusto records. */
  seconds: number | null;
  hours: number | null;
  /** What one hour of this earning pays (rate × multiplier); null for salary and fixed amounts. */
  hourRateCents: number | null;
  /** 1.5 for overtime; null when the record doesn't say (Gusto) or for salary. */
  multiplier: number | null;
  amountCents: number;
};

/** One workweek of an hourly line, split by the engine's overtime rule. Days are local YYYY-MM-DD. */
export type WeekHours = {
  start: string;
  end: string;
  seconds: number;
  hours: number;
  regularSeconds: number;
  regularHours: number;
  overtimeSeconds: number;
  overtimeHours: number;
  doubleOvertimeSeconds: number;
  doubleOvertimeHours: number;
};

/** Where a salary line's amount comes from: the yearly (or other unit) rate over the pay periods. */
export type SalaryBasis = {
  rateCents: number;
  unit: string;
  periodsPerYear: number;
};

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
  /** Time entries (Jobber), the draft line (Workbook) or the paid record (Gusto). Ids are ", "-joined. */
  recordSystem: SourceSystem;
  recordId: string;
  /** Hours logged in the period (information for salary and held lines). */
  loggedHours: number | null;
  earnings: EarningLine[];
  /** Per-workweek split for hourly lines in an open cycle; null otherwise. */
  weeks: WeekHours[] | null;
  salary: SalaryBasis | null;
};

export type OvertimeTier = { overHours: number; multiplier: number };

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
    /** The overtime rule the engine applied; null for closed cycles. */
    overtime: {
      ruleId: string;
      weekly: OvertimeTier | null;
      daily: OvertimeTier[];
    } | null;
    /** Summed by the fixture script from the engine's (or Gusto's) numbers. */
    totals: { hours: number; overtimeHours: number; venmoCents: number };
    venmo: {
      workerId: string;
      hours: number | null;
      rateCents: number | null;
      amountCents: number;
      recordSystem: SourceSystem;
      recordId: string;
    }[];
    venmoHeld: { workerId: string; reason: string; hours: number | null }[];
  };
  stage2: {
    /** The Stage 2 off-cycle draft; null for a closed cycle. */
    draftId: string | null;
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

/** Display name by worker id. */
export type Names = Record<string, string>;

export const workerLabel = (names: Names, workerId: string) =>
  names[workerId] ?? workerId;

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

export type WageGroup = "hourly" | "salary" | "venmo" | "held";

/** One person in the wages table. Every value is read from the stored line; nothing is added or multiplied. */
export type WageRow = {
  workerId: string;
  group: WageGroup;
  /** Hours shown in the row: logged hours, or the Venmo list's hours. Null for salary. */
  hours: number | null;
  overtimeHours: number | null;
  /** Null when the engine pays nothing because something is unknown. */
  grossCents: number | null;
  held: boolean;
  /** The engine's own words for a hold or exclusion. */
  reason: string | null;
  earnings: EarningLine[];
  weeks: WeekHours[] | null;
  salary: SalaryBasis | null;
  recordSystem: SourceSystem | null;
  recordId: string | null;
};

const GROUP_ORDER: WageGroup[] = ["hourly", "salary", "venmo", "held"];

/** The wages table, grouped Hourly / Salary / Venmo / Held, in the stored order inside each group. */
export function wageRows(wb: CycleWorkbook): WageRow[] {
  const rows: WageRow[] = [
    ...wb.stage1.lines.map(
      (l): WageRow => ({
        workerId: l.workerId,
        group: l.held ? "held" : l.kind,
        hours: l.kind === "salary" ? null : l.loggedHours,
        overtimeHours: l.overtimeHours,
        grossCents: l.grossCents,
        held: l.held,
        reason: l.held
          ? (l.reason ?? `held by ${l.heldFlagIds.join(", ")}`)
          : null,
        earnings: l.earnings,
        weeks: l.weeks,
        salary: l.salary,
        recordSystem: l.recordSystem,
        recordId: l.recordId,
      }),
    ),
    ...wb.stage1.venmo.map(
      (v): WageRow => ({
        workerId: v.workerId,
        group: "venmo",
        hours: v.hours,
        overtimeHours: null,
        grossCents: v.amountCents,
        held: false,
        reason: null,
        earnings: [
          {
            name: "Venmo Hours",
            seconds: null,
            hours: v.hours,
            hourRateCents: v.rateCents,
            multiplier: null,
            amountCents: v.amountCents,
          },
        ],
        weeks: null,
        salary: null,
        recordSystem: v.recordSystem,
        recordId: v.recordId,
      }),
    ),
    ...wb.stage1.venmoHeld.map(
      (v): WageRow => ({
        workerId: v.workerId,
        group: "venmo",
        hours: v.hours,
        overtimeHours: null,
        grossCents: null,
        held: true,
        reason: v.reason,
        earnings: [],
        weeks: null,
        salary: null,
        recordSystem: null,
        recordId: null,
      }),
    ),
  ];
  return GROUP_ORDER.flatMap((g) => rows.filter((r) => r.group === g));
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

/** A cycle as the owner's workbook sees it: readiness and last cycle's questions are counted on the server. */
export type WorkbookCycle = CycleWorkbook & {
  readiness: Readiness;
  lastQuestions: number | null;
};

/** workbookView's result. Owner-only, so it carries pay. */
export type WorkbookData = {
  source: string;
  names: Names;
  cycles: WorkbookCycle[];
};

/** Stage 1 and 2 lines as CSV, values exactly as stored (cents and the formatted amount). */
export function workbookCsv(names: Names, wb: CycleWorkbook): string {
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
  const name = (id: string) => workerLabel(names, id);
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
