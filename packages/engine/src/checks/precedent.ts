import type { CheckId, Flag, Rule, RuleType } from "../schemas";

/** Which rule types count as precedent for a check. Later PRs append. */
export const CHECK_RULE_TYPES: Partial<Record<CheckId, RuleType[]>> = {
  "CHK-03": ["long_shift_threshold"],
};

const approvedAt = (r: Rule) =>
  r.provenance.approvedAt ? Date.parse(r.provenance.approvedAt) : -Infinity;

/**
 * Why a flag looks like something seen before. First the most recently approved active rule of
 * a matching type (a rule never approved counts as oldest; ties go to the later one in `rules`),
 * else the last corrected past flag with the same check and worker (`pastFlags` is in
 * chronological order; flags have no timestamp), else "no precedent".
 */
export function precedentFor(
  flag: Flag,
  ctx: { rules: Rule[]; pastFlags: Flag[] },
): NonNullable<Flag["precedent"]> {
  const types = CHECK_RULE_TYPES[flag.checkId] ?? [];
  let rule: Rule | undefined;
  for (const r of ctx.rules) {
    if (r.status !== "active" || r.companyId !== flag.companyId) continue;
    if (!types.includes(r.type)) continue;
    if (!rule || approvedAt(r) >= approvedAt(rule)) rule = r;
  }
  if (rule) {
    const statement = rule.params.statement;
    const text =
      typeof statement === "string" && statement.trim() ? statement : rule.type;
    return { ruleId: rule.id, flagId: null, note: `rule: ${text}` };
  }

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
