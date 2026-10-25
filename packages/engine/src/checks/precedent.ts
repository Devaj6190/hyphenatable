import type { CheckId, Flag, Rule, RuleType } from "../schemas";

/**
 * Which rule types count as precedent for a check. Later PRs append. CHK-14..22 follow the a-c06
 * answer key's `resolvableByRuleType`.
 */
export const CHECK_RULE_TYPES: Partial<Record<CheckId, RuleType[]>> = {
  "CHK-03": ["long_shift_threshold"],
  "CHK-14": ["vendor_job_hint"],
  "CHK-16": ["disposal_parent_link"],
  "CHK-17": ["expense_account_kind"],
  "CHK-18": ["pay_rate"],
  "CHK-19": ["deposit_vs_final"],
  "CHK-20": ["in_person_quoter"],
  "CHK-22": ["venmo_rate"],
};

/**
 * Rule types whose relevance depends on a record's text (vendor, account, job title), which a flag
 * does not carry. Only the check that matched the rule can cite one; the lookup below never guesses.
 */
const RECORD_KEYED: RuleType[] = [
  "vendor_job_hint",
  "disposal_parent_link",
  "expense_account_kind",
  "in_person_quoter",
];

/** `rule: <params.statement>` if it is a non-blank string, else `rule: <type>`. */
export function rulePrecedent(rule: Rule): NonNullable<Flag["precedent"]> {
  const statement = rule.params.statement;
  const text =
    typeof statement === "string" && statement.trim() ? statement : rule.type;
  return { ruleId: rule.id, flagId: null, note: `rule: ${text}` };
}

const approvedAt = (r: Rule) =>
  r.provenance.approvedAt ? Date.parse(r.provenance.approvedAt) : -Infinity;

/**
 * Why a flag looks like something seen before. A rule the check itself cited wins. Else the most
 * recently approved active rule of a matching type that fits the subject (a rule naming a worker
 * fits only that worker's flags; a rule never approved counts as oldest; ties go to the later one),
 * else the last corrected past flag with the same check and worker (`pastFlags` is in
 * chronological order; flags have no timestamp), else "no precedent".
 */
export function precedentFor(
  flag: Flag,
  ctx: { rules: Rule[]; pastFlags: Flag[] },
): NonNullable<Flag["precedent"]> {
  if (flag.precedent?.ruleId) return flag.precedent;
  const types = CHECK_RULE_TYPES[flag.checkId] ?? [];
  let rule: Rule | undefined;
  for (const r of ctx.rules) {
    if (r.status !== "active" || r.companyId !== flag.companyId) continue;
    if (!types.includes(r.type) || RECORD_KEYED.includes(r.type)) continue;
    const w = r.params.workerId;
    if (typeof w === "string" && w !== flag.subject.workerId) continue;
    if (!rule || approvedAt(r) >= approvedAt(rule)) rule = r;
  }
  if (rule) return rulePrecedent(rule);

  const workerId = flag.subject.workerId;
  const past =
    workerId === null
      ? undefined
      : ctx.pastFlags
          .filter(
            (p) =>
              p.id !== flag.id &&
              p.companyId === flag.companyId &&
              p.checkId === flag.checkId &&
              p.status === "corrected" &&
              p.subject.workerId === workerId,
          )
          .at(-1);
  if (past)
    return { ruleId: null, flagId: past.id, note: `same as flag ${past.id}` };

  return { ruleId: null, flagId: null, note: "no precedent" };
}
