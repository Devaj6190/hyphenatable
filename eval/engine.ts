// The product's checks engine over the fixtures, run the way the backend runs it (apps/web/convex/checks.ts
// checks.run): runAll, then an owner-approved rule that already decides a flag settles it, else the flag gets
// its precedent. Then, as questions.draftForCycle does, a flag whose precedent is an active rule goes to the
// owner as a one-tap decision instead of a question. Pure apart from reading the fixtures.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pastGross } from "@payrollpilot/engine/checks/CHK-22";
import { runAll } from "@payrollpilot/engine/checks/index";
import {
  precedentFor,
  rulePrecedent,
  settlingRule,
} from "@payrollpilot/engine/checks/precedent";
import type { CheckInput } from "@payrollpilot/engine/checks/types";
import {
  Company,
  Cycle,
  Expense,
  type Flag,
  Invoice,
  Job,
  PastPayroll,
  Payment,
  Quote,
  Rule,
  SyncRun,
  TimeEntry,
  Visit,
  Worker,
} from "@payrollpilot/engine/schemas";
import { REPO } from "./lib/io";

/** When the eval's owner approves a rule; fixed so results are reproducible. */
const APPROVED_AT = "2026-10-09T12:00:00.000Z";

/** A rule the owner approved: active, with an approver, so it may settle flags. */
export const approve = (r: Rule): Rule => ({
  ...r,
  status: "active",
  provenance: {
    ...r.provenance,
    approvedBy: r.provenance.approvedBy ?? "owner",
    approvedAt: r.provenance.approvedAt ?? APPROVED_AT,
  },
});

export type EngineFixtures = {
  base: Omit<CheckInput, "cycle" | "pastCycles" | "rules" | "syncRuns">;
  cycles: Cycle[];
  pastPayrolls: PastPayroll[];
  syncRuns: SyncRun[];
  /** What onboarding should propose (data/fixtures/<co>/rules.json), all `proposed`. Never shown to a model. */
  onboardingRules: Rule[];
};

/** data/fixtures/<company> plus its cycles/<id> extension folders, parsed through the contract schemas. */
export function loadEngineFixtures(company: string): EngineFixtures {
  const dir = join(REPO, "data/fixtures", company);
  const ext = join(dir, "cycles");
  const exts = existsSync(ext) ? readdirSync(ext).sort() : [];
  const raw = (file: string): unknown[] => {
    const read = (d: string) => {
      try {
        return [
          JSON.parse(readFileSync(join(d, `${file}.json`), "utf8")),
        ].flat();
      } catch {
        return [];
      }
    };
    return [read(dir), ...exts.map((e) => read(join(dir, "cycles", e)))].flat();
  };
  return {
    base: {
      company: Company.parse(raw("company")[0]),
      workers: Worker.array().parse(raw("workers")),
      timeEntries: TimeEntry.array().parse(raw("timeEntries")),
      jobs: Job.array().parse(raw("jobs")),
      visits: Visit.array().parse(raw("visits")),
      quotes: Quote.array().parse(raw("quotes")),
      invoices: Invoice.array().parse(raw("invoices")),
      payments: Payment.array().parse(raw("payments")),
      expenses: Expense.array().parse(raw("expenses")),
    },
    cycles: Cycle.array().parse(raw("cycles")),
    pastPayrolls: PastPayroll.array().parse(raw("pastPayrolls")),
    syncRuns: SyncRun.array().parse(raw("syncRuns")),
    onboardingRules: Rule.array().parse(raw("rules")),
  };
}

export function inputFor(
  fx: EngineFixtures,
  cycleId: string,
  rules: Rule[],
): CheckInput {
  const cycle = fx.cycles.find((c) => c.id === cycleId);
  if (!cycle) throw new Error(`no cycle ${cycleId}`);
  return {
    ...fx.base,
    cycle,
    pastCycles: { gross: pastGross(cycle, fx.cycles, fx.pastPayrolls) },
    rules,
    syncRuns: fx.syncRuns.filter((s) => s.cycleId === cycleId),
  };
}

/** checks.run's insert step: settled flags are dismissed with the rule cited; the rest get a precedent. */
export function engineFlags(input: CheckInput, pastFlags: Flag[] = []): Flag[] {
  return runAll(input).map((flag) => {
    const settledBy = settlingRule(flag, input);
    return {
      ...flag,
      status: settledBy ? "dismissed" : flag.status,
      precedent: settledBy
        ? rulePrecedent(settledBy)
        : precedentFor(flag, { rules: input.rules, pastFlags }),
    };
  });
}

/** Where each flag ends up before Gate 1. */
export type Outcome = "settled" | "rule_backed" | "note" | "needs_person";

export function outcome(f: Flag, rules: Rule[]): Outcome {
  if (f.status === "dismissed") return "settled";
  if (f.routeTo === "none") return "note";
  const rule = f.precedent?.ruleId
    ? rules.find((r) => r.id === f.precedent?.ruleId)
    : undefined;
  return rule?.status === "active" ? "rule_backed" : "needs_person";
}
