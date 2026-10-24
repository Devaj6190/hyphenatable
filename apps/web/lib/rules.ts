import { formatCents } from "@/lib/money";
import cyclesA from "../../../data/fixtures/a/cycles.json";
import pastPayrollsA from "../../../data/fixtures/a/pastPayrolls.json";
import rulesA from "../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../data/fixtures/a/syncRuns.json";
import workersA from "../../../data/fixtures/a/workers.json";

// Mirrors Rule in docs/plans/00-shared-context.md section 6. B's rules.list replaces the fixture.
export type RuleType =
  | "overtime_policy"
  | "pay_rate"
  | "venmo_rate"
  | "long_shift_threshold"
  | "expense_account_kind"
  | "vendor_job_hint"
  | "disposal_parent_link"
  | "in_person_quoter"
  | "commission_plan"
  | "tip_policy"
  | "manager_split"
  | "routing"
  | "worker_mapping"
  | "deposit_vs_final"
  | "catch_all_threshold";

export type Rule = {
  id: string;
  companyId: string;
  /** null only for an owner-stated rule the Analyst has not restated yet. */
  type: RuleType | null;
  params: Record<string, unknown>;
  status: "proposed" | "active" | "off";
  source: "history" | "owner_stated" | "answer";
  provenance: {
    lessonId: string | null;
    flagId: string | null;
    answeredBy: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    evidence: string[];
  };
  backtest: { cycles: number; agree: number; disagree: number } | null;
  confidence: number;
};

type Cycle = {
  id: string;
  number: number;
  periodStart: string;
  periodEnd: string;
  stage: string;
  questionsAsked: number;
};

type SyncRun = {
  id: string;
  cycleId: string;
  source: string;
  object: string;
  pulled: number;
  expected: number;
  complete: boolean;
};

// Only Company A has rule fixtures. B and R show an empty state until rules.list is live.
const fixtures: Record<
  string,
  {
    rules: Rule[];
    cycles: Cycle[];
    workers: { id: string; displayName: string; role: string }[];
    pastPayrolls: { id: string; cycleId: string }[];
    syncRuns: SyncRun[];
  }
> = {
  a: {
    rules: rulesA as Rule[],
    cycles: cyclesA,
    workers: workersA,
    pastPayrolls: pastPayrollsA,
    syncRuns: syncRunsA,
  },
};

export const RULES_SOURCE = "fixture, data/fixtures/a/rules.json";
export const CYCLES_SOURCE = "fixture, data/fixtures/a/cycles.json";

export const fixtureRules = (companyId: string) =>
  fixtures[companyId]?.rules ?? [];
export const fixtureCycles = (companyId: string) =>
  fixtures[companyId]?.cycles ?? [];
export const closedCycles = (companyId: string) =>
  fixtureCycles(companyId).filter((c) => c.stage === "closed");

export function workerLabel(companyId: string, id: string) {
  return (
    fixtures[companyId]?.workers.find((w) => w.id === id)?.displayName ?? id
  );
}

/** The owner's worker id: the approver for every rule in the demo. */
export const ownerId = (companyId: string) =>
  fixtures[companyId]?.workers.find((w) => w.role === "owner")?.id ?? null;

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});
export const shortDate = (iso: string) => day.format(new Date(iso));

export const cycleLabel = (c: Cycle) =>
  `Cycle ${c.number} · ${shortDate(c.periodStart)} – ${shortDate(c.periodEnd)}`;

/** Past-cycle syncs that pulled fewer records than expected. Shown, never smoothed over. */
export const incompleteSyncs = (companyId: string) =>
  (fixtures[companyId]?.syncRuns ?? []).filter(
    (r) =>
      !r.complete && closedCycles(companyId).some((c) => c.id === r.cycleId),
  );

/** Evidence ids are cycle ids ("a-c01") or past payroll records ("a-pp-401"). */
export function evidenceItems(companyId: string, rule: Rule) {
  const cycles = fixtureCycles(companyId);
  const pays = fixtures[companyId]?.pastPayrolls ?? [];
  return rule.provenance.evidence.map((id) => {
    const cycle = cycles.find((c) => c.id === id);
    if (cycle)
      return {
        id,
        kind: "cycle" as const,
        label: cycleLabel(cycle),
        incomplete: incompleteSyncs(companyId).filter((r) => r.cycleId === id),
      };
    const pay = pays.find((p) => p.id === id);
    const payCycle = pay && cycles.find((c) => c.id === pay.cycleId);
    if (pay)
      return {
        id,
        kind: "payroll" as const,
        label: payCycle
          ? `Gusto payroll line, cycle ${payCycle.number}`
          : "Gusto payroll line",
        incomplete: [],
      };
    return { id, kind: "other" as const, label: id, incomplete: [] };
  });
}

/** "Seen in 4 of 4 past cycles" when the evidence is cycles; otherwise names the records. */
export function evidenceSummary(companyId: string, rule: Rule) {
  const items = evidenceItems(companyId, rule);
  const seen = items.filter((i) => i.kind === "cycle").length;
  const of = closedCycles(companyId).length;
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

export type RuleGroup = { id: string; title: string; types: RuleType[] };

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: "hours",
    title: "Hours and overtime",
    types: ["overtime_policy", "long_shift_threshold", "catch_all_threshold"],
  },
  { id: "rates", title: "Pay rates", types: ["pay_rate", "venmo_rate"] },
  {
    id: "commission",
    title: "Commission, tips and splits",
    types: [
      "commission_plan",
      "in_person_quoter",
      "tip_policy",
      "manager_split",
    ],
  },
  {
    id: "jobcost",
    title: "Job cost",
    types: [
      "expense_account_kind",
      "vendor_job_hint",
      "disposal_parent_link",
      "deposit_vs_final",
    ],
  },
  { id: "ask", title: "Who to ask", types: ["routing", "worker_mapping"] },
];

/** Groups in a fixed order; owner-stated rules with no type yet get their own group at the end. */
export function groupRules(rules: Rule[]) {
  const groups = RULE_GROUPS.map((g) => ({
    ...g,
    rules: rules.filter((r) => r.type && g.types.includes(r.type)),
  }));
  const untyped = rules.filter((r) => !r.type);
  if (untyped.length)
    groups.push({
      id: "stated",
      title: "Stated by you",
      types: [],
      rules: untyped,
    });
  return groups.filter((g) => g.rules.length);
}

const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * The rule in plain words, built from its typed params. Restates, never computes:
 * amounts are the cents already stored on the rule. Managers get no pay amounts.
 */
export function plainWords(
  companyId: string,
  rule: Rule,
  showMoney: boolean,
): string {
  const p = rule.params;
  const who = (k: string) => workerLabel(companyId, str(p[k]));
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
      return typeof p.text === "string" ? p.text : JSON.stringify(p);
  }
}

export const sourceWords: Record<Rule["source"], string> = {
  history: "Learned from past payrolls",
  owner_stated: "Stated by owner, not seen in history",
  answer: "From an answer",
};

const systems: Record<string, string> = {
  jobber: "Jobber",
  qbo: "QuickBooks",
  gusto: "Gusto",
};
export const syncWords = (r: SyncRun) =>
  `Incomplete sync: ${systems[r.source] ?? r.source} ${r.object}, ${r.pulled} of ${r.expected}`;
