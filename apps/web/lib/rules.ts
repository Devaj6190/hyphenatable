import { formatCents } from "@/lib/money";
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

export type Cycle = {
  id: string;
  number: number;
  periodStart: string;
  periodEnd: string;
  stage: string;
  questionsAsked: number;
};

export type SyncRun = {
  id: string;
  cycleId: string;
  source: string;
  object: string;
  pulled: number;
  expected: number;
  complete: boolean;
};

export const closedOf = (cycles: Cycle[]) =>
  cycles.filter((c) => c.stage === "closed");

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});
export const shortDate = (iso: string) => day.format(new Date(iso));

export const cycleLabel = (c: Cycle) =>
  `Cycle ${c.number} · ${shortDate(c.periodStart)} – ${shortDate(c.periodEnd)}`;

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
export function groupRules<R extends Rule>(rules: R[]) {
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

const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * The rule in plain words, built from its typed params. Restates, never computes:
 * amounts are the cents already stored on the rule. Managers get no pay amounts. Shared by the fixture view
 * (lib/server/fixtures.ts) and the live one (Convex rules.list), so both read the same.
 */
export function ruleInWords(
  rule: Rule,
  showMoney: boolean,
  nameOf: (workerId: string) => string,
): string {
  const p = rule.params;
  const who = (k: string) => nameOf(str(p[k]));
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
      // Free text can state amounts, so only the owner gets it.
      return showMoney && typeof p.text === "string"
        ? p.text
        : "Rule details not shown.";
  }
}
