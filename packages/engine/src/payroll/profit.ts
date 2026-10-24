// A-13 step 2: profit = revenue − labor − job-cost expenses, the margin, and the low-profit input for CHK-21
// with deterministic reason hints (unmatched expenses on the job's dates, an unlinked disposal sub-job,
// a stale costing rate). Hints are hints; the check and the owner decide.
import { localDate } from "./hours";
import type { JobRecon, Reconciliation } from "./reconcile";
import type { Expense, Job, Rule } from "./types";

export type JobProfit = {
  jobId: string;
  profitCents: number | null;
  /** Margin in percent, two decimals; null when profit or revenue is unknown or revenue is 0. */
  marginPct: number | null;
  low: boolean;
  hints: string[];
  reason: string | null;
};

export function jobProfit(
  r: JobRecon,
  ctx: {
    job: Job | undefined;
    jobs: Job[];
    expenses: Expense[];
    rules: Rule[];
    recon: Reconciliation;
    lowMarginPct: number | null;
    timeZone: string;
  },
): JobProfit {
  if (r.unknown.length || r.revenueCents === null || r.laborCents === null)
    return {
      jobId: r.jobId,
      profitCents: null,
      marginPct: null,
      low: false,
      hints: [],
      reason: r.unknown.join("; ") || "revenue or labor unknown",
    };
  const profitCents = r.revenueCents - r.laborCents - r.jobCostCents;
  const marginPct =
    r.revenueCents > 0
      ? Math.round((profitCents * 10000) / r.revenueCents) / 100
      : null;
  const low =
    ctx.lowMarginPct !== null &&
    marginPct !== null &&
    marginPct < ctx.lowMarginPct;
  const hints: string[] = [];
  if (low) {
    const job = ctx.job;
    const from = job?.startAt ? localDate(job.startAt, ctx.timeZone) : null;
    const to = job?.endAt ? localDate(job.endAt, ctx.timeZone) : from;
    if (from && to)
      for (const x of ctx.expenses)
        if (
          ctx.recon.unmatchedJobCostExpenseIds.includes(x.id) &&
          x.date.slice(0, 10) >= from &&
          x.date.slice(0, 10) <= to
        )
          hints.push(
            `unmatched job-cost expense ${x.id} on ${x.date.slice(0, 10)}`,
          );
    for (const link of ctx.rules.filter(
      (x) => x.type === "disposal_parent_link" && x.status === "active",
    )) {
      const prefix = link.params.titlePrefix;
      if (typeof prefix !== "string" || !job) continue;
      for (const j of ctx.jobs)
        if (
          !j.parentJobId &&
          j.id !== job.id &&
          j.title.startsWith(prefix) &&
          job.title.endsWith(` - ${j.title.slice(prefix.length)}`)
        )
          hints.push(`unlinked disposal sub-job ${j.id} (rule ${link.id})`);
    }
    for (const s of ctx.recon.staleRates)
      if (r.labor.some((l) => l.workerId === s.workerId))
        hints.push(
          `stale Jobber rate for ${s.workerId}: ${s.jobberRateCents}¢/h vs ${s.ruleRateCents}¢/h (${s.ruleId})`,
        );
  }
  return { jobId: r.jobId, profitCents, marginPct, low, hints, reason: null };
}
