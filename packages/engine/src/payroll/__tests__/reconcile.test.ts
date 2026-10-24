import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { jobProfit } from "../profit";
import { reconcile } from "../reconcile";
import type { Expense, Job } from "../types";
import { fixtures } from "./fixtures";

const A = fixtures("a");
const LOW_MARGIN_PCT = 20; // seed/companies/a.json lowMarginPct (Company.settings.lowMarginPct in #15)
const c05 = A.cycles.find((c) => c.id === "a-c05");
if (!c05) throw new Error("a-c05 missing");

const run = (over: { jobs?: Job[]; expenses?: Expense[] } = {}) => {
  const jobs = over.jobs ?? A.jobs;
  const expenses = over.expenses ?? A.expenses;
  const recon = reconcile({
    periodStart: c05.periodStart,
    periodEnd: c05.periodEnd,
    timeZone: A.company.timezone,
    jobs,
    entries: A.entries.filter((e) => e.cycleId === "a-c05"),
    expenses,
    invoices: A.invoices,
    payments: A.payments,
    workers: A.workers,
    rules: A.rules,
  });
  const profits = recon.jobs.map((r) =>
    jobProfit(r, {
      job: jobs.find((j) => j.id === r.jobId),
      jobs,
      expenses,
      rules: A.rules,
      recon,
      lowMarginPct: LOW_MARGIN_PCT,
      timeZone: A.company.timezone,
    }),
  );
  return { recon, profits };
};

const summarize = ({ recon, profits }: ReturnType<typeof run>) => ({
  jobs: recon.jobs.map((j) => {
    const p = profits.find((x) => x.jobId === j.jobId);
    return {
      jobId: j.jobId,
      revenueCents: j.revenueCents,
      laborCents: j.laborCents,
      jobCostCents: j.jobCostCents,
      profitCents: p?.profitCents ?? null,
      marginPct: p?.marginPct ?? null,
      low: p?.low ?? false,
      hints: p?.hints ?? [],
      depositCents: j.depositCents,
      finalCents: j.finalCents,
      misclassifiedPaymentIds: j.misclassifiedPaymentIds,
      provisional: j.provisional,
    };
  }),
  overheadCents: recon.overheadCents,
  unmatchedJobCostExpenseIds: recon.unmatchedJobCostExpenseIds,
  unknownKindExpenseIds: recon.unknownKindExpenseIds,
  staleRates: recon.staleRates,
});

describe("a-c05 reconciliation golden (Company A, all rules active)", () => {
  const goldenPath = join(
    import.meta.dirname,
    "../__golden__/a-c05-stage2.json",
  );
  const base = run();
  test("matches the golden file", () => {
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
    const got = summarize(base);
    if (process.env.PIN_GOLDEN === "1") {
      writeFileSync(
        goldenPath,
        `${JSON.stringify({ note: golden.note, ...got }, null, 2)}\n`,
      );
      return;
    }
    const { note: _note, ...expected } = golden;
    expect(got).toEqual(expected);
  });

  test("planted Stage 2 errors surface as inputs (CHK-14, 17, 18, 19, 21)", () => {
    const s = summarize(base);
    const j05 = s.jobs.find((j) => j.jobId === "a-j05");
    // a-in03 − labor at the rule's cost rates (re-derived with jq) − a-ex-0007 − a-ex-0009
    expect(j05?.profitCents).toBe(405000 - 345800 - (9735 + 21437));
    expect(j05?.low).toBe(true);
    expect(j05?.hints).toEqual([
      "unmatched job-cost expense a-ex-0003 on 2026-10-21",
      "stale Jobber rate for a-w08: 3000¢/h vs 3250¢/h (a-rule-23)",
    ]);
    expect(s.staleRates).toEqual([
      {
        workerId: "a-w08",
        jobberRateCents: 3000,
        ruleRateCents: 3250,
        ruleId: "a-rule-23",
        seconds: 68 * 3600,
        overstatementCents: 68 * 250,
      },
    ]);
    expect(
      s.jobs.find((j) => j.jobId === "a-j09")?.misclassifiedPaymentIds,
    ).toEqual(["a-pay03"]);
    expect(s.unmatchedJobCostExpenseIds).toEqual(["a-ex-0003"]);
    expect(s.unknownKindExpenseIds).toEqual(["a-ex-0011"]);
    // CHK-16: the unlinked disposal sub-job has no total, so its profit is unknown, never zero.
    expect(base.profits.find((p) => p.jobId === "a-j08")).toMatchObject({
      profitCents: null,
      reason: "no job total and no invoice total",
    });
  });

  test("changing one expense's matchedJobId changes exactly one job's profit", () => {
    const expenses = A.expenses.map((x) =>
      x.id === "a-ex-0003" ? { ...x, matchedJobId: "a-j05" } : x,
    );
    const moved = run({ expenses });
    const changed = moved.profits.filter(
      (p, i) => p.profitCents !== base.profits[i].profitCents,
    );
    expect(changed.map((p) => [p.jobId, p.profitCents])).toEqual([
      ["a-j05", 28028 - 21437],
    ]);
  });

  test("linking a-j08 under a-j04 rolls its cost into a-j04 and leaves the scope", () => {
    const jobs = A.jobs.map((j) =>
      j.id === "a-j08" ? { ...j, parentJobId: "a-j04" } : j,
    );
    const linked = run({ jobs });
    const p = (x: typeof base, id: string) =>
      x.profits.find((q) => q.jobId === id)?.profitCents;
    expect(p(linked, "a-j04")).toBe((p(base, "a-j04") as number) - 14250);
    expect(linked.recon.jobs.map((j) => j.jobId)).not.toContain("a-j08");
    expect(
      linked.recon.jobs.find((j) => j.jobId === "a-j04")?.childJobIds,
    ).toEqual(["a-j08"]);
  });
});
