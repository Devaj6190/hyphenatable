import { describe, expect, it } from "vitest";
import { fixtures, load } from "../payroll/__tests__/fixtures";
import { type HistoryInput, proposeFromHistory, summarize } from "./history";
import type { PastCycle } from "./lessons";

const A = fixtures("a");
const past = A.cycles.filter((c) => c.id !== "a-c05");
const questions = load<
  {
    id: string;
    cycleId: string;
    toWorkerId: string;
    toRole: string;
    status: string;
  }[]
>("a", "questions");
// Onboarding starts with no rules: proposals must come from the history alone.
const pastCycles: PastCycle[] = past.map((cycle) => ({
  checks: undefined as unknown as PastCycle["checks"],
  pay: [
    cycle,
    A.entries.filter((e) => e.cycleId === cycle.id),
    A.workers,
    [],
    { company: A.company, expenses: A.expenses },
  ],
  paid: Object.fromEntries(
    A.pastPayrolls
      .filter((p) => p.cycleId === cycle.id && p.paidVia === "gusto_regular")
      .map((p) => [p.workerId, p.grossCents]),
  ),
}));
const input: HistoryInput = {
  companyId: A.company.id,
  cycleIds: past.map((c) => c.id),
  paid: A.pastPayrolls.filter((p) => past.some((c) => c.id === p.cycleId)),
  expenses: A.expenses,
  payments: A.payments,
  answered: questions.filter((q) => q.status === "answered"),
  pastCycles,
};

describe("proposeFromHistory on Company A", () => {
  const proposals = proposeFromHistory(input);
  const of = (type: string) =>
    proposals.filter((p) => p.type === type).map((p) => p.params);

  it("learns the overtime policy, backtested against what was paid", () => {
    expect(of("overtime_policy")).toEqual([
      { weeklyHours: 40, multiplier: 1.5, dailyHours: null },
    ]);
  });

  it("learns each hourly worker's constant pay rate", () => {
    expect(of("pay_rate")).toContainEqual({
      workerId: "a-w01",
      rateCents: 2800,
      paymentUnit: "Hour",
      costRateCentsPerHour: 2800,
    });
    expect(of("pay_rate")).toHaveLength(7);
  });

  it("learns the Venmo worker's rate", () => {
    expect(of("venmo_rate")).toEqual([{ workerId: "a-w09", rateCents: 2500 }]);
  });

  it("sorts expense accounts that are always or never job cost, and leaves mixed ones out", () => {
    const kinds = Object.fromEntries(
      of("expense_account_kind").map((p) => [p.accountName, p.kind]),
    );
    expect(kinds).toEqual({
      Materials: "job_cost",
      "Equipment Rental": "job_cost",
      Disposal: "job_cost",
      Software: "overhead",
      Insurance: "overhead",
    });
  });

  it("learns deposits vs finals and who answers what", () => {
    expect(of("deposit_vs_final")).toEqual([
      { quotePayment: "deposit", invoicePayment: "final" },
    ]);
    expect(of("routing")).toEqual([{ jobFacts: "a-w11", money: "a-w12" }]);
  });

  it("gives every proposal evidence ids and its own cycle count", () => {
    for (const p of proposals) {
      expect(p.evidence.length).toBeGreaterThan(0);
      expect(p.seenInCycles).toBeLessThanOrEqual(p.ofCycles);
    }
  });

  it("summarizes with ids only, small enough for the Analyst", () => {
    const s = JSON.stringify(summarize(input));
    expect(s.length).toBeLessThan(20_000);
    for (const w of A.workers) expect(s).not.toContain(w.displayName);
  });
});
