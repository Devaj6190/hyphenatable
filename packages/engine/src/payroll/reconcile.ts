// A-13 step 1: reconcile each job of the cycle: revenue, payments by kind, labor at the current cost rate,
// job-cost expenses by matchedJobId (linked sub-jobs roll into their parent), overhead to the cycle.
// Unknowns (no total, no cost rate) stay null with a reason; nothing defaults to zero.
import { localDate } from "./hours";
import { centsFor } from "./money";
import type {
  Expense,
  Invoice,
  Job,
  Payment,
  Rule,
  TimeEntry,
  Worker,
} from "./types";

export type CostRate =
  | { ok: true; rateCents: number; source: string }
  | { ok: false; reason: string };

export type StaleRate = {
  workerId: string;
  jobberRateCents: number;
  ruleRateCents: number;
  ruleId: string;
  seconds: number;
  /** Labor at the rule's rate minus labor at Jobber's rate, over the cycle's jobs (positive = Jobber overstates profit). */
  overstatementCents: number;
};

export type JobRecon = {
  jobId: string;
  childJobIds: string[];
  revenueCents: number | null;
  revenueSource: string;
  depositCents: number;
  finalCents: number;
  tipCents: number;
  tipPaymentIds: string[];
  /** Payments whose stored kind disagrees with the deposit_vs_final rule (CHK-19 input). */
  misclassifiedPaymentIds: string[];
  outstandingCents: number | null;
  labor: {
    workerId: string;
    seconds: number;
    rateCents: number | null;
    source: string;
    cents: number | null;
  }[];
  laborCents: number | null;
  jobCostCents: number;
  expenseIds: string[];
  provisional: boolean;
  unknown: string[];
};

export type Reconciliation = {
  jobs: JobRecon[];
  overheadCents: number;
  overheadExpenseIds: string[];
  unmatchedJobCostExpenseIds: string[];
  unknownKindExpenseIds: string[];
  staleRates: StaleRate[];
};

export type ReconcileInput = {
  periodStart: string;
  periodEnd: string;
  timeZone: string;
  jobs: Job[];
  entries: TimeEntry[];
  expenses: Expense[];
  invoices: Invoice[];
  payments: Payment[];
  workers: Worker[];
  rules: Rule[];
  /** Explicit job scope; default: top-level jobs that start in the period or have entries in it. */
  jobIds?: string[];
};

const active = (rules: Rule[], type: Rule["type"]) =>
  rules.filter((r) => r.type === type && r.status === "active");

/** Cost rate: the active pay_rate rule's costRateCentsPerHour, else Jobber's labour rate, else unknown. */
export function costRate(worker: Worker | undefined, rules: Rule[]): CostRate {
  if (!worker) return { ok: false, reason: "unknown worker" };
  const r = active(rules, "pay_rate").filter(
    (x) => x.params.workerId === worker.id,
  );
  if (r.length > 1)
    return {
      ok: false,
      reason: `conflicting pay_rate rules ${r.map((x) => x.id).join(", ")}`,
    };
  const c = r[0]?.params.costRateCentsPerHour;
  if (typeof c === "number" && Number.isSafeInteger(c) && c > 0)
    return { ok: true, rateCents: c, source: `pay_rate rule ${r[0].id}` };
  const j = worker.jobber?.labourRateCents;
  if (typeof j === "number" && j > 0)
    return { ok: true, rateCents: j, source: "Jobber labour rate" };
  return { ok: false, reason: `no cost rate for ${worker.id}` };
}

export function reconcile(input: ReconcileInput): Reconciliation {
  const t0 = Date.parse(input.periodStart);
  const t1 = Date.parse(input.periodEnd);
  const startDay = localDate(input.periodStart, input.timeZone);
  const endDay = localDate(input.periodEnd, input.timeZone);
  const inPeriod = (iso: string | null) =>
    iso !== null && Date.parse(iso) >= t0 && Date.parse(iso) <= t1;
  const byId = new Map(input.jobs.map((j) => [j.id, j]));
  const top = (id: string) => byId.get(id)?.parentJobId ?? id;
  const entries = input.entries.filter((e) => inPeriod(e.startAt));

  const scope = input.jobIds
    ? [...input.jobIds]
    : [
        ...new Set([
          ...input.jobs
            .filter((j) => !j.parentJobId && inPeriod(j.startAt))
            .map((j) => j.id),
          ...entries
            .filter((e) => e.jobId && byId.has(e.jobId))
            .map((e) => top(e.jobId as string)),
        ]),
      ].sort();

  // deposit_vs_final: a payment on a quote is a deposit, on an invoice only it is final.
  const dvf = active(input.rules, "deposit_vs_final")[0];
  const workers = new Map(input.workers.map((w) => [w.id, w]));
  const invoiceJob = new Map(input.invoices.map((i) => [i.id, i.jobId]));
  const quoteJob = new Map<string, string>();
  for (const j of input.jobs) if (j.quoteId) quoteJob.set(j.quoteId, j.id);

  const staleSec = new Map<string, number>();
  const jobs: JobRecon[] = scope.map((jobId) => {
    const job = byId.get(jobId);
    const children = input.jobs
      .filter((j) => j.parentJobId === jobId)
      .map((j) => j.id)
      .sort();
    const ids = new Set([jobId, ...children]);
    const unknown: string[] = [];

    const invs = input.invoices.filter((i) => i.jobId === jobId);
    let revenueCents: number | null = null;
    let revenueSource = "none";
    if (invs.length && invs.every((i) => typeof i.totalCents === "number")) {
      revenueCents = invs.reduce((s, i) => s + (i.totalCents as number), 0);
      revenueSource = `invoice ${invs.map((i) => i.id).join(", ")}`;
    } else if (typeof job?.totalCents === "number") {
      revenueCents = job.totalCents;
      revenueSource = "Jobber job total (not invoiced)";
    } else unknown.push("no job total and no invoice total");

    const pays = input.payments.filter((p) => {
      const j =
        (p.invoiceId && invoiceJob.get(p.invoiceId)) ||
        (p.quoteId && quoteJob.get(p.quoteId)) ||
        null;
      return j !== null && ids.has(j);
    });
    let depositCents = 0;
    let finalCents = 0;
    let tipCents = 0;
    const tipPaymentIds: string[] = [];
    const misclassifiedPaymentIds: string[] = [];
    for (const p of pays) {
      if (p.paymentType === "tip") {
        tipCents += p.amountCents;
        tipPaymentIds.push(p.id);
        continue;
      }
      const ruleKind = dvf
        ? p.quoteId
          ? (dvf.params.quotePayment as string)
          : (dvf.params.invoicePayment as string)
        : p.kind;
      if (ruleKind !== p.kind) misclassifiedPaymentIds.push(p.id);
      if (ruleKind === "deposit") depositCents += p.amountCents;
      else finalCents += p.amountCents;
    }

    const secByWorker = new Map<string, number>();
    for (const e of entries)
      if (e.jobId && ids.has(e.jobId))
        secByWorker.set(
          e.workerId,
          (secByWorker.get(e.workerId) ?? 0) + e.durationSec,
        );
    const labor = [...secByWorker]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([workerId, seconds]) => {
        const w = workers.get(workerId);
        const r = costRate(w, input.rules);
        if (!r.ok) {
          unknown.push(r.reason);
          return {
            workerId,
            seconds,
            rateCents: null,
            source: r.reason,
            cents: null,
          };
        }
        const j = w?.jobber?.labourRateCents;
        if (typeof j === "number" && j !== r.rateCents)
          staleSec.set(workerId, (staleSec.get(workerId) ?? 0) + seconds);
        return {
          workerId,
          seconds,
          rateCents: r.rateCents,
          source: r.source,
          cents: centsFor(seconds, r.rateCents),
        };
      });
    const laborCents = labor.some((l) => l.cents === null)
      ? null
      : labor.reduce((s, l) => s + (l.cents as number), 0);

    const xs = input.expenses
      .filter(
        (x) =>
          x.kind === "job_cost" && x.matchedJobId && ids.has(x.matchedJobId),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const x of xs)
      if (x.amountCents === null) unknown.push(`expense ${x.id} has no amount`);
    const jobCostCents = xs.reduce((s, x) => s + (x.amountCents ?? 0), 0);

    const endDayJob = job?.endAt ? localDate(job.endAt, input.timeZone) : null;
    return {
      jobId,
      childJobIds: children,
      revenueCents,
      revenueSource,
      depositCents,
      finalCents,
      tipCents,
      tipPaymentIds,
      misclassifiedPaymentIds,
      outstandingCents:
        revenueCents === null ? null : revenueCents - depositCents - finalCents,
      labor,
      laborCents,
      jobCostCents,
      expenseIds: xs.map((x) => x.id),
      provisional:
        job?.status === "active" ||
        job?.status === "upcoming" ||
        (endDayJob !== null && endDayJob > endDay),
      unknown,
    };
  });

  const inDay = (d: string) =>
    d.slice(0, 10) >= startDay && d.slice(0, 10) <= endDay;
  const sorted = [...input.expenses].sort((a, b) => a.id.localeCompare(b.id));
  const overhead = sorted.filter((x) => x.kind === "overhead" && inDay(x.date));
  const staleRates: StaleRate[] = [...staleSec]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([workerId, seconds]) => {
      const w = workers.get(workerId) as Worker;
      const r = costRate(w, input.rules) as {
        rateCents: number;
        source: string;
      };
      const jobberRateCents = w.jobber?.labourRateCents as number;
      return {
        workerId,
        jobberRateCents,
        ruleRateCents: r.rateCents,
        ruleId: r.source.replace("pay_rate rule ", ""),
        seconds,
        overstatementCents:
          centsFor(seconds, r.rateCents) - centsFor(seconds, jobberRateCents),
      };
    });
  return {
    jobs,
    overheadCents: overhead.reduce((s, x) => s + (x.amountCents ?? 0), 0),
    overheadExpenseIds: overhead.map((x) => x.id),
    unmatchedJobCostExpenseIds: sorted
      .filter((x) => x.kind === "job_cost" && !x.matchedJobId && inDay(x.date))
      .map((x) => x.id),
    unknownKindExpenseIds: sorted
      .filter((x) => x.kind === "unknown" && inDay(x.date))
      .map((x) => x.id),
    staleRates,
  };
}
