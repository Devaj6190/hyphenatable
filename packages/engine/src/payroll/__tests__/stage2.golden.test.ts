import { describe, expect, test } from "vitest";
import { computeStage2, type Stage2Input } from "../stage2";
import type { Cycle, Rule } from "../types";
import { fixtures } from "./fixtures";

const A = fixtures("a");
const B = fixtures("b");
const LOW_MARGIN_PCT = 20; // seed/companies/a.json lowMarginPct (Company.settings.lowMarginPct in #15)

const input = (
  F: typeof A,
  cycle: Cycle,
  over: Partial<Stage2Input> = {},
): Stage2Input => ({
  cycle,
  company: {
    id: F.company.id,
    timezone: F.company.timezone,
    lowMarginPct: LOW_MARGIN_PCT,
  },
  jobs: F.jobs,
  quotes: F.quotes,
  invoices: F.invoices,
  payments: F.payments,
  expenses: F.expenses,
  entries: F.entries.filter((e) => e.cycleId === cycle.id),
  workers: F.workers,
  rules: F.rules,
  ...over,
});
const cyc = (F: typeof A, id: string) => {
  const c = F.cycles.find((x) => x.id === id);
  if (!c) throw new Error(`${id} missing`);
  return c;
};

/** Off-cycle (and Venmo cash-tip) earnings actually paid, as [workerId, name, cents]. */
const paidOffCycle = (F: typeof A, cycleId: string) =>
  F.pastPayrolls
    .filter((p) => p.cycleId === cycleId)
    .flatMap((p) =>
      p.earnings
        .filter((e) =>
          ["Commission", "Paycheck Tips", "Cash Tips", "Bonus"].includes(
            e.name,
          ),
        )
        .map((e) => [p.workerId, e.name, e.amountCents]),
    )
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));
const computedOffCycle = (r: ReturnType<typeof computeStage2>) =>
  [...r.report.payouts, ...r.report.venmoTips]
    .map((p) => [p.workerId, p.name, p.amountCents])
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));

/** Costing rates as Jobber held them in each past cycle (seed/companies/a.json jobberRates). */
const pastRules = (cycleId: string): Rule[] =>
  A.rules.map((r) => {
    if (r.type !== "pay_rate") return r;
    if (r.params.workerId === "a-w08")
      return { ...r, params: { ...r.params, costRateCentsPerHour: 3000 } };
    if (r.params.workerId === "a-w02" && cycleId < "a-c04")
      return { ...r, params: { ...r.params, costRateCentsPerHour: 2500 } };
    return r;
  });

describe("Company A past cycles: commission, tips and manager split reproduced to the cent", () => {
  for (const id of ["a-c01", "a-c02", "a-c03", "a-c04"])
    test(id, () => {
      const r = computeStage2(input(A, cyc(A, id), { rules: pastRules(id) }));
      expect(r.report.held).toEqual([]);
      expect(computedOffCycle(r)).toEqual(paidOffCycle(A, id));
    });
});

describe("Company B past cycles: 8% of install profit to the salesperson", () => {
  for (const c of B.cycles.filter((x) => x.stage === "closed"))
    test(c.id, () => {
      const r = computeStage2(input(B, c));
      expect(paidOffCycle(B, c.id).length).toBeGreaterThan(0);
      expect(computedOffCycle(r)).toEqual(paidOffCycle(B, c.id));
    });
});

describe("a-c05 stage 2 draft (Company A, current cycle, all rules active)", () => {
  const notComplete = ["a-j02", "a-j04", "a-j05"].map((j) => ({
    workerId: "a-w11",
    what: `manager split on ${j}`,
    reason: "job not complete",
  }));
  test("no commission or tips; the split is held: jobs not complete, and a-j08's unknown total", () => {
    const r = computeStage2(input(A, cyc(A, "a-c05")));
    expect(r.report.payouts).toEqual([]);
    expect(r.report.held).toEqual([
      ...notComplete,
      {
        workerId: "a-w11",
        what: "manager split",
        reason: "profit unknown for a-j08 (no job total and no invoice total)",
      },
    ]);
    expect(r.draft).toMatchObject({
      stage: 2,
      lines: [],
      totals: { grossCents: 0, hours: 0 },
    });
  });
  test("once a-j08 is linked under a-j04, the Bonus is 10% of the complete jobs' profit, rounded once", () => {
    const jobs = A.jobs.map((j) =>
      j.id === "a-j08" ? { ...j, parentJobId: "a-j04" } : j,
    );
    const r = computeStage2(input(A, cyc(A, "a-c05"), { jobs }));
    // complete jobs: a-j01 321400 + a-j03 262055 + a-j07 48000 + a-j09 400000 = 1031455¢ → 10% = 103145.5 → 103146¢
    expect(r.report.held).toEqual(notComplete);
    expect(r.draft.lines).toEqual([
      {
        workerId: "a-w11",
        excluded: false,
        hourly: [],
        fixed: [{ name: "Bonus", amountCents: 103146 }],
        memo: "PayrollPilot draft a-c05-draft-s2",
        heldFlagIds: [],
      },
    ]);
  });
});

describe("one expense's matchedJobId changes exactly one job's profit and its commission", () => {
  test("Company B b-c04: unmatching b-ex-4004 changes b-j062 and its salesperson's commission only", () => {
    const c = cyc(B, "b-c04");
    const base = computeStage2(input(B, c));
    const expenses = B.expenses.map((x) =>
      x.id === "b-ex-4004" ? { ...x, matchedJobId: null } : x,
    );
    const moved = computeStage2(input(B, c, { expenses }));
    const changed = moved.report.profits.filter(
      (p, i) => p.profitCents !== base.report.profits[i].profitCents,
    );
    expect(changed.map((p) => [p.jobId, p.profitCents])).toEqual([
      [
        "b-j062",
        (base.report.profits.find((p) => p.jobId === "b-j062")
          ?.profitCents as number) + 554742,
      ],
    ]);
    const job = B.jobs.find((j) => j.id === "b-j062");
    const seller = B.quotes.find(
      (q) => q.id === job?.quoteId,
    )?.salespersonWorkerId;
    const com = (x: typeof base) =>
      new Map(x.report.payouts.map((p) => [p.workerId, p.amountCents]));
    for (const [w, cents] of com(moved))
      if (w === seller)
        // rounded once per payee, so the difference is within a cent of 8% of the expense
        expect(
          Math.abs(cents - (com(base).get(w) ?? 0) - 554742 * 0.08),
        ).toBeLessThanOrEqual(1);
      else expect(cents).toBe(com(base).get(w));
  });
});

describe("rules decide; no rule → no money and a reason", () => {
  const c05 = () => cyc(A, "a-c05");
  test("CHK-20: lighting quote by a-w12 while a-w05 quotes in person → commission held", () => {
    const r = computeStage2(input(A, c05(), { jobIds: ["a-j10"] }));
    expect(r.report.payouts.filter((p) => p.name === "Commission")).toEqual([]);
    expect(r.report.held[0]).toMatchObject({
      workerId: "a-w05",
      what: "commission on a-j10",
    });
    expect(r.report.held[0].reason).toContain("CHK-20");
  });
  test("no commission_plan, tip_policy or manager_split rule → no lines; tips held", () => {
    const rules = A.rules.filter(
      (x) =>
        !["commission_plan", "tip_policy", "manager_split"].includes(x.type),
    );
    const r = computeStage2(
      input(A, cyc(A, "a-c03"), {
        rules: pastRules("a-c03").filter((x) =>
          rules.some((y) => y.id === x.id),
        ),
      }),
    );
    expect(r.draft.lines).toEqual([]);
    expect(r.report.notes.join("\n")).toContain(
      "no active commission_plan rule",
    );
    expect(r.report.held.map((h) => h.what)).toEqual([
      expect.stringContaining("tips"),
    ]);
  });
  test("profit commission on a job that isn't complete is held (B b-c04, b-j062 active)", () => {
    const c = cyc(B, "b-c04");
    const base = computeStage2(input(B, c));
    const jobs = B.jobs.map((j) =>
      j.id === "b-j062" ? { ...j, status: "active" } : j,
    );
    const r = computeStage2(input(B, c, { jobs }));
    expect(r.report.held).toEqual([
      {
        workerId: "b-w29",
        what: "commission on b-j062",
        reason: "job not complete",
      },
    ]);
    const b29 = (x: typeof r) =>
      x.report.payouts.find((p) => p.workerId === "b-w29")?.amountCents ?? 0;
    expect(b29(r)).toBeLessThan(b29(base));
  });
});
