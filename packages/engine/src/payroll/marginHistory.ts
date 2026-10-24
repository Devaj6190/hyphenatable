// Job margins over past cycles, as evidence for onboarding (the Analyst proposes; the owner approves).
// Runs the Stage 2 reconcile and profit per past cycle and suggests a low-margin threshold for CHK-21 with the
// method and the numbers behind it. The suggestion is a proposal, never a rule, until the owner approves it.
// Unknown profit → the cycle is listed as incomplete with reasons, never zero, and is left out of the stats.
import { type JobProfit, jobProfit } from "./profit";
import { reconcile } from "./reconcile";
import type {
  Cycle,
  Expense,
  Invoice,
  Job,
  Payment,
  Rule,
  TimeEntry,
  Worker,
} from "./types";

export type MarginHistoryInput = {
  cycles: Cycle[];
  company: { id: string; timezone: string };
  jobs: Job[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  entries: TimeEntry[];
  workers: Worker[];
  rules: Rule[];
  /** Rules as they were in a given cycle (e.g. the costing rate before a raise); default `rules`. */
  rulesByCycle?: Record<string, Rule[]>;
};

export type CycleMargin = {
  cycleId: string;
  jobs: {
    jobId: string;
    profitCents: number | null;
    marginPct: number | null;
  }[];
  revenueCents: number | null;
  laborCents: number | null;
  jobCostCents: number | null;
  profitCents: number | null;
  marginPct: number | null;
  complete: boolean;
  incompleteReasons: string[];
};

export type MarginStats = {
  n: number;
  meanPct: number;
  sdPct: number;
  minPct: number;
  maxPct: number;
  minId: string;
};

export type MarginHistory = {
  cycles: CycleMargin[];
  /** Over complete cycles' margins. */
  cycleStats: MarginStats | null;
  /** Over every job margin in complete cycles (what CHK-21 compares against). */
  jobStats: MarginStats | null;
  suggestion: {
    status: "proposed";
    lowMarginPct: number;
    method: "mean_minus_2sd" | "lowest_clean_job";
    why: string;
    evidence: {
      cycleIds: string[];
      jobs: number;
      meanPct: number;
      sdPct: number;
      minPct: number;
      minJobId: string;
    };
  } | null;
  /** Why there is no suggestion, when there is none. */
  note: string | null;
};

/** Enough past job margins for a spread to mean something. */
export const MIN_JOBS_FOR_SPREAD = 8;

const pct2 = (num: number, den: number) =>
  Math.round((num * 10000) / den) / 100;
const round2 = (x: number) => Math.round(x * 100) / 100;

function stats(xs: { id: string; pct: number }[]): MarginStats | null {
  if (!xs.length) return null;
  const mean = xs.reduce((s, x) => s + x.pct, 0) / xs.length;
  const sd = Math.sqrt(
    xs.reduce((s, x) => s + (x.pct - mean) ** 2, 0) / xs.length,
  );
  const min = xs.reduce((a, b) => (b.pct < a.pct ? b : a));
  return {
    n: xs.length,
    meanPct: round2(mean),
    sdPct: round2(sd),
    minPct: min.pct,
    maxPct: Math.max(...xs.map((x) => x.pct)),
    minId: min.id,
  };
}

export function marginHistory(input: MarginHistoryInput): MarginHistory {
  const cycles = [...input.cycles].sort((a, b) => a.number - b.number);
  const out: CycleMargin[] = cycles.map((cycle) => {
    const rules = input.rulesByCycle?.[cycle.id] ?? input.rules;
    const recon = reconcile({
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      timeZone: input.company.timezone,
      jobs: input.jobs,
      entries: input.entries.filter(
        (e) => e.cycleId === cycle.id || e.cycleId === null,
      ),
      expenses: input.expenses,
      invoices: input.invoices,
      payments: input.payments,
      workers: input.workers,
      rules,
    });
    const profits: JobProfit[] = recon.jobs.map((r) =>
      jobProfit(r, {
        job: input.jobs.find((j) => j.id === r.jobId),
        jobs: input.jobs,
        expenses: input.expenses,
        rules,
        recon,
        lowMarginPct: null,
        timeZone: input.company.timezone,
      }),
    );
    const reasons = profits
      .filter((p) => p.profitCents === null)
      .map((p) => `${p.jobId}: ${p.reason}`);
    for (const r of recon.jobs)
      if (r.provisional) reasons.push(`${r.jobId}: job not complete`);
    const complete = reasons.length === 0 && recon.jobs.length > 0;
    if (recon.jobs.length === 0) reasons.push("no jobs in the cycle");
    const sum = (f: (r: (typeof recon.jobs)[number]) => number | null) =>
      complete ? recon.jobs.reduce((s, r) => s + (f(r) as number), 0) : null;
    const revenueCents = sum((r) => r.revenueCents);
    const laborCents = sum((r) => r.laborCents);
    const jobCostCents = sum((r) => r.jobCostCents);
    const profitCents =
      revenueCents !== null && laborCents !== null && jobCostCents !== null
        ? revenueCents - laborCents - jobCostCents
        : null;
    return {
      cycleId: cycle.id,
      jobs: profits.map((p) => ({
        jobId: p.jobId,
        profitCents: p.profitCents,
        marginPct: p.marginPct,
      })),
      revenueCents,
      laborCents,
      jobCostCents,
      profitCents,
      marginPct:
        profitCents !== null && revenueCents
          ? pct2(profitCents, revenueCents)
          : null,
      complete,
      incompleteReasons: reasons,
    };
  });

  const clean = out.filter((c) => c.complete);
  const cycleStats = stats(
    clean
      .filter((c) => c.marginPct !== null)
      .map((c) => ({ id: c.cycleId, pct: c.marginPct as number })),
  );
  const jobMargins = clean.flatMap((c) =>
    c.jobs
      .filter((j) => j.marginPct !== null)
      .map((j) => ({ id: j.jobId, pct: j.marginPct as number })),
  );
  const jobStats = stats(jobMargins);
  if (!jobStats)
    return {
      cycles: out,
      cycleStats,
      jobStats,
      suggestion: null,
      note: "no complete past cycle with job margins; no suggestion",
    };
  const evidence = {
    cycleIds: clean.map((c) => c.cycleId),
    jobs: jobStats.n,
    meanPct: jobStats.meanPct,
    sdPct: jobStats.sdPct,
    minPct: jobStats.minPct,
    minJobId: jobStats.minId,
  };
  // Precision over recall: the threshold never flags a clean past job, so it is the lower of mean − 2 sd
  // (when there are enough jobs for a spread) and the lowest clean job, rounded down to a whole percent.
  const spread = jobStats.n >= MIN_JOBS_FOR_SPREAD;
  const bySpread = spread
    ? Math.floor(jobStats.meanPct - 2 * jobStats.sdPct)
    : null;
  const byMin = Math.floor(jobStats.minPct);
  const useSpread = bySpread !== null && bySpread <= byMin;
  const lowMarginPct = Math.max(0, useSpread ? (bySpread as number) : byMin);
  const base = `${jobStats.n} job margins over ${clean.length} complete cycles (mean ${jobStats.meanPct}%, sd ${jobStats.sdPct}, lowest ${jobStats.minPct}% on ${jobStats.minId})`;
  return {
    cycles: out,
    cycleStats,
    jobStats,
    suggestion: {
      status: "proposed",
      lowMarginPct,
      method: useSpread ? "mean_minus_2sd" : "lowest_clean_job",
      why: useSpread
        ? `${base}; a job more than 2 sd below the mean is unusual for this company, and that is below every clean past job`
        : spread
          ? `${base}; mean − 2 sd (${bySpread}%) would have flagged a clean past job, so the lowest clean job, rounded down, is used`
          : `${base}; fewer than ${MIN_JOBS_FOR_SPREAD} jobs is too few for a spread, so the lowest clean job, rounded down, is used`,
      evidence,
    },
    note: null,
  };
}
