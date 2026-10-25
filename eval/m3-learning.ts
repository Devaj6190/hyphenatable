// M3 learning curve: what still needs a person before Gate 1, per cycle, as the company's rules grow.
//   day0       no rules at all
//   onboarding the rules onboarding proposes from past payrolls (rules.json), owner-approved
//   learned    onboarding + the rules cycle 1's answers teach, each backtested over the past cycles
// The same cycle-2 data with and without the learned rules is the clean measure of "asks less next time".
//
// Rule extraction is an oracle: LEARNED below is what a correct Analyst would write from each cycle-1
// answer (answer-key row → rule). Everything after extraction is the product's code: backtest, approval,
// checks, settling and routing. Swap LEARNED for the Analyst's real output to grade the agent too.
import { backtest, type PastCycle } from "@payrollpilot/engine/lessons/lessons";
import type { Flag, Rule } from "@payrollpilot/engine/schemas";
import {
  approve,
  type EngineFixtures,
  engineFlags,
  inputFor,
  type Outcome,
  outcome,
} from "./engine";
import type { AnswerKeyRow } from "./lib/types";

type Candidate = Pick<Rule, "type" | "params"> & { fromKeyRow: string };

/** Company A cycle 1 (a-c05): the answer-key row each rule is learned from. */
export const LEARNED_A: Candidate[] = [
  {
    fromKeyRow: "a-ak-06",
    type: "pay_rate",
    params: {
      workerId: "a-w02",
      rateCents: 2600,
      paymentUnit: "Hour",
      costRateCentsPerHour: 2600,
    },
  },
  {
    fromKeyRow: "a-ak-07",
    type: "venmo_rate",
    params: { workerId: "a-w10", rateCents: 2200 },
  },
  {
    fromKeyRow: "a-ak-08",
    type: "vendor_job_hint",
    params: { vendor: "Cedar Creek Supply", jobKind: "irrigation" },
  },
  {
    fromKeyRow: "a-ak-23",
    type: "expense_account_kind",
    params: { accountName: "Fuel", kind: "overhead" },
  },
];

/** Same type and same subject (worker, vendor or account): the later rule would only repeat it. */
const sameSubject = (a: Pick<Rule, "type" | "params">, b: Candidate) =>
  a.type === b.type &&
  ["workerId", "vendor", "accountName", "titlePrefix", "titleKeyword"].every(
    (k) => a.params[k] === b.params[k],
  );

/**
 * Past cycles with what was actually paid, as apps/web/convex/lessons.ts pastCycles builds them. The
 * lesson's own cycle is left out.
 */
export function pastCycles(
  fx: EngineFixtures,
  rules: Rule[],
  except: string,
): PastCycle[] {
  return fx.cycles
    .filter(
      (c) => c.id !== except && fx.pastPayrolls.some((p) => p.cycleId === c.id),
    )
    .map((cycle) => {
      const checks = inputFor(fx, cycle.id, rules);
      const paid: Record<string, number> = {};
      for (const p of fx.pastPayrolls)
        if (p.cycleId === cycle.id)
          paid[p.workerId] = (paid[p.workerId] ?? 0) + p.grossCents;
      return {
        checks,
        pay: [
          cycle,
          fx.base.timeEntries.filter((e) => e.cycleId === cycle.id),
          fx.base.workers,
          rules,
          { company: fx.base.company, expenses: fx.base.expenses },
        ] as unknown as PastCycle["pay"],
        paid,
      };
    });
}

export type Learned = {
  fromKeyRow: string;
  type: string;
  verdict: "approved" | "duplicate" | "rejected_by_backtest";
  ruleId: string | null;
  backtest: { cycles: number; agree: number; disagree: number } | null;
};

/** The learning contract's code steps over the candidates: dedupe, backtest, owner approval. */
export function learn(
  fx: EngineFixtures,
  known: Rule[],
  candidates: Candidate[],
  fromCycle: string,
): { rules: Rule[]; learned: Learned[] } {
  const rules = [...known];
  const learned: Learned[] = [];
  for (const [i, c] of candidates.entries()) {
    const dup = rules.find((r) => sameSubject(r, c));
    if (dup) {
      learned.push({
        fromKeyRow: c.fromKeyRow,
        type: c.type,
        verdict: "duplicate",
        ruleId: dup.id,
        backtest: null,
      });
      continue;
    }
    const rule: Rule = approve({
      id: `${fx.base.company.id}-learned-${String(i + 1).padStart(2, "0")}`,
      companyId: fx.base.company.id,
      type: c.type,
      params: c.params,
      status: "proposed",
      source: "answer",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: "manager",
        approvedBy: null,
        approvedAt: null,
        evidence: [c.fromKeyRow],
      },
      backtest: null,
      confidence: 0.9,
    } as Rule);
    const bt = backtest(rule, pastCycles(fx, rules, fromCycle));
    const ok = bt === null || bt.disagree === 0;
    if (ok) rules.push({ ...rule, backtest: bt });
    learned.push({
      fromKeyRow: c.fromKeyRow,
      type: c.type,
      verdict: ok ? "approved" : "rejected_by_backtest",
      ruleId: ok ? rule.id : null,
      backtest: bt,
    });
  }
  return { rules, learned };
}

export type CycleRun = {
  cycleId: string;
  rules: number;
  flags: number;
  outcomes: Record<Outcome, number>;
};

export function runCycle(
  fx: EngineFixtures,
  cycleId: string,
  rules: Rule[],
): { run: CycleRun; flags: Flag[] } {
  const flags = engineFlags(inputFor(fx, cycleId, rules));
  const outcomes: Record<Outcome, number> = {
    needs_person: 0,
    rule_backed: 0,
    settled: 0,
    note: 0,
  };
  for (const f of flags) outcomes[outcome(f, rules)]++;
  return {
    run: { cycleId, rules: rules.length, flags: flags.length, outcomes },
    flags,
  };
}

/** For each a-c06 row the key says a learned rule settles: did it stop needing a person? */
export function resolvedRows(
  key: AnswerKeyRow[],
  flags: Flag[],
  rules: Rule[],
): {
  id: string;
  checkId: string;
  expected: string;
  outcome: Outcome | "not_flagged";
}[] {
  const ids = (s: AnswerKeyRow["subject"]) =>
    [s.workerId, s.jobId, ...s.entryIds, ...s.expenseIds].filter(Boolean);
  return key
    .filter((k) => k.resolvableByRuleType)
    .map((k) => {
      const f = flags.find(
        (x) =>
          x.checkId === k.checkId &&
          ids(k.subject).some((id) => ids(x.subject).includes(id)),
      );
      return {
        id: k.id,
        checkId: k.checkId,
        expected: k.resolvableByRuleType as string,
        outcome: f ? outcome(f, rules) : "not_flagged",
      };
    });
}

/** The whole curve for one company: day0 and onboarding on both cycles, then cycle 2 after learning. */
export function learningCurve(
  fx: EngineFixtures,
  key: AnswerKeyRow[],
  candidates: Candidate[],
  [first, next]: [string, string],
) {
  const onboarding = fx.onboardingRules.map(approve);
  const { rules, learned } = learn(fx, onboarding, candidates, first);
  const curve = (
    [
      ["day0", [], first],
      ["day0", [], next],
      ["onboarding", onboarding, first],
      ["onboarding", onboarding, next],
      ["learned", rules, next],
    ] as const
  ).map(([scenario, r, cycleId]) => ({
    scenario,
    ...runCycle(fx, cycleId, [...r]).run,
  }));
  const after = runCycle(fx, next, rules).flags;
  return {
    extraction:
      "oracle: each learned rule is what a correct Analyst writes from one cycle-1 answer-key row; backtest, approval, checks, settling and routing are the product's code",
    curve,
    learned,
    resolvedRows: resolvedRows(
      key.filter((k) => k.cycleId === next),
      after,
      rules,
    ),
  };
}
