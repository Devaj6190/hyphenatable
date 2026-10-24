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
