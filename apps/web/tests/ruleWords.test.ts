import { describe, expect, test } from "vitest";
import { type Rule, ruleInWords } from "../lib/rules";

const rule = (type: Rule["type"], params: Record<string, unknown>): Rule => ({
  id: "ru1",
  companyId: "r",
  type,
  params,
  status: "active",
  source: "history",
  provenance: {
    lessonId: null,
    flagId: null,
    answeredBy: null,
    approvedBy: null,
    approvedAt: null,
    evidence: [],
  },
  backtest: null,
  confidence: 1,
});
const nameOf = (id: string) => (id === "w1" ? "Avery Reed" : id);

describe("ruleInWords", () => {
  test("restates a pay rule with its stored amount for the owner", () => {
    expect(
      ruleInWords(
        rule("pay_rate", {
          workerId: "w1",
          rateCents: 2600,
          paymentUnit: "Hour",
        }),
        true,
        nameOf,
      ),
    ).toBe("Avery Reed is paid $26.00 an hour in Gusto.");
  });

  test("never shows an amount without showMoney", () => {
    for (const r of [
      rule("pay_rate", {
        workerId: "w1",
        rateCents: 2600,
        paymentUnit: "Hour",
      }),
      rule("venmo_rate", { workerId: "w1", rateCents: 2000 }),
      rule(null, { text: "Pay the crew lead $500 extra" }),
    ])
      expect(ruleInWords(r, false, nameOf)).not.toMatch(/\$\d/);
  });

  test("uses the name lookup it is given, so live and fixture views read the same", () => {
    expect(
      ruleInWords(
        rule("in_person_quoter", { workerId: "w1", titleKeyword: "patio" }),
        true,
        nameOf,
      ),
    ).toBe("Avery Reed quotes “patio” jobs in person.");
  });
});
