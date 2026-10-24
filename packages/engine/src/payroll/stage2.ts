// A-13 Stage 2: the reconciled workbook → job profit, the CHK-18..21 inputs, and the off-cycle Bonus draft
// (Commission, Paycheck Tips, Bonus as fixed lines; Venmo cash tips listed beside it). Pure.
import {
  commissions,
  type Held,
  managerSplit,
  type Payout,
  tips,
} from "./commissions";
import { type JobProfit, jobProfit } from "./profit";
import { type Reconciliation, reconcile } from "./reconcile";
import type {
  Cycle,
  Draft,
  DraftLine,
  Expense,
  Invoice,
  Job,
  Payment,
  Quote,
  Rule,
  TimeEntry,
  Worker,
} from "./types";

export type Stage2Input = {
  cycle: Cycle;
  company: { id: string; timezone: string; lowMarginPct?: number | null };
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  entries: TimeEntry[];
  workers: Worker[];
  rules: Rule[];
  jobIds?: string[];
  draftId?: string;
  workbookVersion?: number;
};

export type Stage2Report = {
  recon: Reconciliation;
  profits: JobProfit[];
  totalProfitCents: number | null;
  payouts: Payout[];
  /** Venmo contractors' cash tips: paid by Venmo, never sent to Gusto. */
  venmoTips: Payout[];
  held: Held[];
  notes: string[];
};

export type Stage2Result = {
  draft: Draft;
  explain: Record<string, string[]>;
  report: Stage2Report;
};

export function computeStage2(input: Stage2Input): Stage2Result {
  const tz = input.company.timezone;
  const recon = reconcile({
    periodStart: input.cycle.periodStart,
    periodEnd: input.cycle.periodEnd,
    timeZone: tz,
    jobs: input.jobs,
    entries: input.entries,
    expenses: input.expenses,
    invoices: input.invoices,
    payments: input.payments,
    workers: input.workers,
    rules: input.rules,
    jobIds: input.jobIds,
  });
  const jobById = new Map(input.jobs.map((j) => [j.id, j]));
  const lowMarginPct = input.company.lowMarginPct ?? null;
  const notes: string[] = [];
  if (lowMarginPct === null)
    notes.push(
      "no lowMarginPct for the company; low-profit input not computed",
    );
  const profits = recon.jobs.map((r) =>
    jobProfit(r, {
      job: jobById.get(r.jobId),
      jobs: input.jobs,
      expenses: input.expenses,
      rules: input.rules,
      recon,
      lowMarginPct,
      timeZone: tz,
    }),
  );
  const profitMap = new Map(profits.map((p) => [p.jobId, p]));
  const scopeJobs = recon.jobs
    .map((r) => jobById.get(r.jobId))
    .filter((j): j is Job => j !== undefined);
  const periodEntries = input.entries.filter(
    (e) =>
      Date.parse(e.startAt) >= Date.parse(input.cycle.periodStart) &&
      Date.parse(e.startAt) <= Date.parse(input.cycle.periodEnd),
  );
  // Decision (A-13, Shanin): profit-based payouts on a job that isn't complete are held; the owner releases.
  const incomplete = new Set(
    recon.jobs.filter((j) => j.provisional).map((j) => j.jobId),
  );
  const parts = [
    commissions(
      input.rules,
      scopeJobs,
      input.quotes,
      profitMap,
      input.workers,
      incomplete,
    ),
    tips(input.rules, recon.jobs, periodEntries, input.workers),
    managerSplit(input.rules, profits, incomplete),
  ];
  const all = parts.flatMap((p) => p.payouts);
  const held = parts.flatMap((p) => p.held);
  notes.push(...parts.flatMap((p) => p.notes));

  const venmo = new Set(
    input.workers
      .filter((w) => w.payType === "contractor_venmo")
      .map((w) => w.id),
  );
  const payouts = all.filter((p) => !venmo.has(p.workerId));
  const venmoTips = all.filter((p) => venmo.has(p.workerId));

  const explain: Record<string, string[]> = {};
  const say = (w: string, s: string) => {
    if (!explain[w]) explain[w] = [];
    explain[w].push(`${w}: ${s}`);
  };
  for (const p of all) for (const s of p.explain) say(p.workerId, s);
  for (const p of venmoTips)
    say(p.workerId, "Cash Tips are paid by Venmo, not in Gusto");
  for (const h of held)
    if (h.workerId) say(h.workerId, `${h.what} held: ${h.reason}`);

  const draftId = input.draftId ?? `${input.cycle.id}-draft-s2`;
  const lines: DraftLine[] = [...new Set(payouts.map((p) => p.workerId))]
    .sort()
    .map((workerId) => ({
      workerId,
      excluded: false,
      hourly: [],
      fixed: payouts
        .filter((p) => p.workerId === workerId)
        .map((p) => ({ name: p.name, amountCents: p.amountCents })),
      memo: `PayrollPilot draft ${draftId}`,
      heldFlagIds: [],
    }));
  const known = profits.every((p) => p.profitCents !== null);
  return {
    draft: {
      id: draftId,
      companyId: input.cycle.companyId,
      cycleId: input.cycle.id,
      stage: 2,
      lines,
      venmoList: [],
      workbookVersion: input.workbookVersion ?? 1,
      gustoPayrollId: input.cycle.gustoOffCyclePayrollId,
      status: "computed",
      totals: {
        grossCents: payouts.reduce((s, p) => s + p.amountCents, 0),
        hours: 0,
      },
    },
    explain,
    report: {
      recon,
      profits,
      totalProfitCents: known
        ? profits.reduce((s, p) => s + (p.profitCents as number), 0)
        : null,
      payouts,
      venmoTips,
      held,
      notes,
    },
  };
}
