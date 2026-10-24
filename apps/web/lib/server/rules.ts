import "server-only";
import { formatCents } from "@/lib/money";
import { missedQuestions } from "@/lib/onboardingQuestions";
import type { Viewer } from "@/lib/policy";
import {
  type Cycle,
  closedOf,
  cycleLabel,
  type EvidenceItem,
  type PastQuestion,
  type Rule,
  type RulesViewData,
  type RuleView,
  type SyncRun,
} from "@/lib/rules";
import cyclesA from "../../../../data/fixtures/a/cycles.json";
import pastPayrollsA from "../../../../data/fixtures/a/pastPayrolls.json";
import questionsA from "../../../../data/fixtures/a/questions.json";
import rulesA from "../../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../../data/fixtures/a/syncRuns.json";
import workersA from "../../../../data/fixtures/a/workers.json";

// Rules, onboarding and what-it-learned, in fixture mode, on the server only. Rule params hold pay rates in
// cents, so they never leave this file: screens get plain words, with amounts only for the owner.
// B's rules.list replaces the fixture.

type Fixture = {
  rules: Rule[];
  cycles: Cycle[];
  workers: { id: string; displayName: string; role: string }[];
  pastPayrolls: { id: string; cycleId: string }[];
  syncRuns: SyncRun[];
  questions: PastQuestion[];
};

// Only Company A has rule fixtures. B and R show an empty state until rules.list is live.
const fixtures: Record<string, Fixture> = {
  a: {
    rules: rulesA as Rule[],
    cycles: cyclesA,
    workers: workersA,
    pastPayrolls: pastPayrollsA,
    syncRuns: syncRunsA,
    questions: questionsA,
  },
};

const workerLabel = (f: Fixture, id: string) =>
  f.workers.find((w) => w.id === id)?.displayName ?? id;

/** Past-cycle syncs that pulled fewer records than expected. Shown, never smoothed over. */
const incompleteSyncs = (f: Fixture) =>
  f.syncRuns.filter(
    (r) => !r.complete && closedOf(f.cycles).some((c) => c.id === r.cycleId),
  );

/** Evidence ids are cycle ids ("a-c01") or past payroll records ("a-pp-401"). */
function evidenceItems(f: Fixture, rule: Rule): EvidenceItem[] {
  const gaps = incompleteSyncs(f);
  return rule.provenance.evidence.map((id) => {
    const cycle = f.cycles.find((c) => c.id === id);
    if (cycle)
      return {
        id,
        kind: "cycle",
        label: cycleLabel(cycle),
        incomplete: gaps.filter((r) => r.cycleId === id),
      };
    const pay = f.pastPayrolls.find((p) => p.id === id);
    const payCycle = pay && f.cycles.find((c) => c.id === pay.cycleId);
    if (pay)
      return {
        id,
        kind: "payroll",
        label: payCycle
          ? `Gusto payroll line, cycle ${payCycle.number}`
          : "Gusto payroll line",
        incomplete: [],
      };
    return { id, kind: "other", label: id, incomplete: [] };
  });
}

/** "Seen in 4 of 4 past cycles" when the evidence is cycles; otherwise names the records. */
function evidenceSummary(f: Fixture, items: EvidenceItem[]) {
  const seen = items.filter((i) => i.kind === "cycle").length;
  const of = closedOf(f.cycles).length;
  if (seen && seen === items.length && of)
    return { text: `Seen in ${seen} of ${of} past cycles`, seen, of };
  if (items.length === 1 && items[0].kind === "payroll")
    return { text: `From the ${items[0].label}`, seen: null, of: null };
  return {
    text: `${items.length} source record${items.length === 1 ? "" : "s"}`,
    seen: null,
    of: null,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * The rule in plain words, built from its typed params. Restates, never computes:
 * amounts are the cents already stored on the rule. Managers get no pay amounts.
 */
function plainWords(f: Fixture, rule: Rule, showMoney: boolean): string {
  const p = rule.params;
  const who = (k: string) => workerLabel(f, str(p[k]));
  switch (rule.type) {
    case "overtime_policy":
      return `Overtime starts after ${num(p.weeklyHours)} hours in a week, at ${num(p.multiplier)}×${
        p.dailyHours == null
          ? ", not per day."
          : ` or after ${num(p.dailyHours)} hours in a day.`
      }`;
    case "long_shift_threshold":
      return `A shift longer than ${num(p.hours)} hours gets a question before payroll.`;
    case "pay_rate": {
      const yearly = p.paymentUnit === "Year";
      if (!showMoney)
        return `${who("workerId")} is paid ${yearly ? "a salary" : "by the hour"} in Gusto.`;
      return `${who("workerId")} is paid ${formatCents(num(p.rateCents))} ${yearly ? "a year" : "an hour"} in Gusto${
        yearly
          ? `, costed at ${formatCents(num(p.costRateCentsPerHour))} an hour on jobs.`
          : "."
      }`;
    }
    case "venmo_rate":
      return `${who("workerId")} is paid by Venmo, outside Gusto, ${
        showMoney
          ? `at ${formatCents(num(p.rateCents))} an hour`
          : "by the hour"
      }.`;
    case "expense_account_kind":
      return `QuickBooks “${str(p.accountName)}” purchases count as ${
        p.kind === "job_cost" ? "a job cost" : "overhead"
      }.`;
    case "commission_plan":
      return `Whoever quotes a job in person earns ${num(p.pctOfJobTotal)}% of the job total.`;
    case "tip_policy":
      return p.split === "by_hours_on_job"
        ? "Tips on a job are split by each person’s hours on that job."
        : `Tips are split: ${str(p.split)}.`;
    case "manager_split":
      return `${who("workerId")} earns ${num(p.pctOfJobProfit)}% of job profit.`;
    case "routing":
      return `Ask ${who("jobFacts")} about job facts. Ask ${who("money")} about money.`;
    case "deposit_vs_final":
      return "A payment on a quote is a deposit. A payment on an invoice is the final payment.";
    case "disposal_parent_link":
      return `A “${str(p.titlePrefix).trim()} …” job belongs to the job with the ${str(p.linkBy)}.`;
    case "in_person_quoter":
      return `${who("workerId")} quotes “${str(p.titleKeyword)}” jobs in person.`;
    default:
      return typeof p.text === "string" ? p.text : "Rule details not shown.";
  }
}

export function rulesView(viewer: Viewer, companyId: string): RulesViewData {
  const f = fixtures[companyId];
  if (!f)
    return {
      rules: [],
      ownerId: null,
      names: {},
      cycles: [],
      incompleteSyncs: [],
      pastQuestions: [],
      missedQuestions: [],
    };
  const showMoney = viewer.role === "owner";
  const rules: RuleView[] = f.rules.map((rule) => {
    const evidence =
      rule.source === "owner_stated" ? null : evidenceItems(f, rule);
    return {
      ...rule,
      params: {},
      words: plainWords(f, rule, showMoney),
      evidence,
      summary: evidence && evidenceSummary(f, evidence),
    };
  });
  const ownerId = f.workers.find((w) => w.role === "owner")?.id ?? null;
  const people = new Set(
    rules.flatMap((r) => [r.provenance.answeredBy, r.provenance.approvedBy]),
  );
  if (ownerId) people.add(ownerId);
  const names: Record<string, string> = {};
  for (const id of people) if (id) names[id] = workerLabel(f, id);
  return {
    rules,
    ownerId,
    names,
    cycles: f.cycles,
    incompleteSyncs: incompleteSyncs(f),
    pastQuestions: f.questions.map(({ id, cycleId, toRole, text }) => ({
      id,
      cycleId,
      toRole,
      text,
    })),
    missedQuestions: missedQuestions.filter((q) => q.companyId === companyId),
  };
}
