import { describe, expect, test } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import { toRule } from "@/lib/live/adapt";
import { type Rule, ruleWords } from "@/lib/rules";

const doc = {
  _id: "k1rule",
  _creationTime: 1,
  companyId: "j1company",
  type: "pay_rate",
  params: { workerId: "k1worker", rateCents: 2800, paymentUnit: "Hour" },
  status: "proposed",
  source: "history",
  provenance: {
    lessonId: null,
    flagId: null,
    answeredBy: null,
    approvedBy: null,
    approvedAt: null,
    evidence: ["r-c03"],
  },
  backtest: null,
  confidence: 0.9,
} as unknown as Doc<"rules">;

const nameOf = (id: string) => ({ k1worker: "Rowan Vale" })[id] ?? id;

describe("live rules", () => {
  test("toRule keeps the row, keyed by the dashboard's company letter", () => {
    const rule = toRule(doc, "r");
    expect(rule).toMatchObject({
      id: "k1rule",
      companyId: "r",
      type: "pay_rate",
      status: "proposed",
      backtest: null,
    });
  });

  test("ruleWords names the worker from the roster; the owner sees the rate", () => {
    expect(ruleWords(toRule(doc, "r"), true, nameOf)).toBe(
      "Rowan Vale is paid $28.00 an hour in Gusto.",
    );
  });

  test("without money the words carry no amount", () => {
    const words = ruleWords(toRule(doc, "r"), false, nameOf);
    expect(words).toBe("Rowan Vale is paid by the hour in Gusto.");
    expect(words).not.toMatch(/\$\d/);
  });

  test("an unknown worker id is shown as the id, never dropped", () => {
    const rule: Rule = { ...toRule(doc, "r"), params: { workerId: "k9x" } };
    expect(ruleWords(rule, false, nameOf)).toContain("k9x");
  });
});
