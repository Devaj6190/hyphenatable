import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { MIN_JOBS_FOR_SPREAD, marginHistory } from "../marginHistory";
import type { Rule } from "../types";
import { fixtures } from "./fixtures";

const A = fixtures("a");
const B = fixtures("b");
const past = (F: typeof A) => F.cycles.filter((c) => c.stage === "closed");
const input = (F: typeof A, over = {}) => ({
  cycles: past(F),
  company: { id: F.company.id, timezone: F.company.timezone },
  jobs: F.jobs,
  invoices: F.invoices,
  payments: F.payments,
  expenses: F.expenses,
  entries: F.entries,
  workers: F.workers,
  rules: F.rules,
  ...over,
});

/** Costing rates as Jobber held them in each past A cycle (seed/companies/a.json jobberRates). */
const pastRulesA = (cycleId: string): Rule[] =>
  A.rules.map((r) => {
    if (r.type !== "pay_rate") return r;
    if (r.params.workerId === "a-w08")
      return { ...r, params: { ...r.params, costRateCentsPerHour: 3000 } };
    if (r.params.workerId === "a-w02" && cycleId < "a-c04")
      return { ...r, params: { ...r.params, costRateCentsPerHour: 2500 } };
    return r;
  });
const rulesByCycleA = Object.fromEntries(
  past(A).map((c) => [c.id, pastRulesA(c.id)]),
);

const goldenPath = join(
  import.meta.dirname,
  "../__golden__/margin-history.json",
);

describe("marginHistory golden (Company A a-c01..a-c04, Company B b-c01..b-c04)", () => {
  const a = marginHistory(input(A, { rulesByCycle: rulesByCycleA }));
  const b = marginHistory(input(B));
  test("matches the golden file", () => {
    // per-job margins are covered by the range test below; the golden pins cycle totals, stats and the suggestion
    const slim = (h: typeof a) => ({
      ...h,
      cycles: h.cycles.map(({ jobs, ...c }) => ({ ...c, jobs: jobs.length })),
    });
    const got = { a: slim(a), b: slim(b) };
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
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
  test("every past job's margin is inside the range the generator priced it at (±1 point for rounding)", () => {
    // seed: job total = cost / (1 − m), m drawn from A [30, 45], B installs [30, 40] / service [40, 55], rounded
    for (const [h, lo, hi] of [
      [a, 30, 45],
      [b, 30, 55],
    ] as const)
      for (const c of h.cycles) {
        expect(c.complete, c.cycleId).toBe(true);
        for (const j of c.jobs) {
          expect(j.marginPct, j.jobId).not.toBeNull();
          expect(j.marginPct as number).toBeGreaterThanOrEqual(lo - 1);
          expect(j.marginPct as number).toBeLessThanOrEqual(hi + 1);
        }
      }
  });
  test("Company A cycle profit agrees with the manager's 10% Bonus actually paid", () => {
    for (const c of a.cycles) {
      const bonus = A.pastPayrolls.find(
        (p) =>
          p.cycleId === c.cycleId &&
          p.workerId === "a-w11" &&
          p.paidVia === "gusto_off_cycle",
      );
      expect(Math.round((c.profitCents as number) / 10), c.cycleId).toBe(
        bonus?.grossCents,
      );
    }
  });
  test("cycle totals add up from the jobs, and margin = profit / revenue", () => {
    for (const c of [...a.cycles, ...b.cycles]) {
      expect(c.profitCents).toBe(
        c.jobs.reduce((s, j) => s + (j.profitCents as number), 0),
      );
      expect(c.profitCents).toBe(
        (c.revenueCents as number) -
          (c.laborCents as number) -
          (c.jobCostCents as number),
      );
      expect(c.marginPct).toBe(
        Math.round(
          ((c.profitCents as number) * 10000) / (c.revenueCents as number),
        ) / 100,
      );
    }
  });
  test("the suggestion is a proposal with its method and evidence, never flagging a clean past job", () => {
    // A: 20 jobs, mean 37.74, sd 3.47 → mean − 2 sd = 30.80 → 30, but a-j24 was 29.99 → lowest clean job, 29.
    expect(a.suggestion).toMatchObject({
      status: "proposed",
      lowMarginPct: 29,
      method: "lowest_clean_job",
    });
    expect(a.suggestion?.why).toContain("would have flagged a clean past job");
    // B: 80 jobs, mean 43.64, sd 7.00 → 29.64 → 29, below the lowest (30.02) → mean − 2 sd.
    expect(b.suggestion).toMatchObject({
      status: "proposed",
      lowMarginPct: 29,
      method: "mean_minus_2sd",
    });
    for (const h of [a, b]) {
      expect((h.jobStats?.n ?? 0) >= MIN_JOBS_FOR_SPREAD).toBe(true);
      expect(h.suggestion?.lowMarginPct as number).toBeLessThanOrEqual(
        h.jobStats?.minPct as number,
      );
    }
  });
});

describe("unknown profit is incomplete, never zero", () => {
  test("a job with no total makes its cycle incomplete and leaves it out of the stats", () => {
    const c = past(A)[0];
    const j = A.jobs.find(
      (x) =>
        !x.parentJobId &&
        x.startAt &&
        x.startAt >= c.periodStart &&
        x.startAt <= c.periodEnd,
    );
    if (!j) throw new Error("no job in a-c01");
    const jobs = A.jobs.map((x) =>
      x.id === j.id ? { ...x, totalCents: null } : x,
    );
    const invoices = A.invoices.filter((i) => i.jobId !== j.id);
    const h = marginHistory(
      input(A, { jobs, invoices, rulesByCycle: rulesByCycleA }),
    );
    const c1 = h.cycles.find((x) => x.cycleId === c.id);
    expect(c1).toMatchObject({
      complete: false,
      profitCents: null,
      marginPct: null,
      revenueCents: null,
    });
    expect(c1?.incompleteReasons).toEqual([
      `${j.id}: no job total and no invoice total`,
    ]);
    expect(h.cycleStats?.n).toBe(past(A).length - 1);
  });
  test("few jobs → the lowest clean job, and no jobs → no suggestion", () => {
    const one = marginHistory(
      input(A, { cycles: past(A).slice(0, 1), rulesByCycle: rulesByCycleA }),
    );
    expect(one.jobStats?.n).toBeLessThan(MIN_JOBS_FOR_SPREAD);
    expect(one.suggestion).toMatchObject({
      method: "lowest_clean_job",
      lowMarginPct: Math.floor(one.jobStats?.minPct as number),
    });
    const none = marginHistory(input(A, { cycles: [] }));
    expect(none.suggestion).toBeNull();
    expect(none.note).toContain("no complete past cycle");
  });
});
