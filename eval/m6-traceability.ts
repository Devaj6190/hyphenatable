// M6 traceability: the share of flags with at least one `where` ref AND a rule or model-call id.
// A deterministic check (confidence "certain") is its own rule: its checkId is the id. A judged flag needs a
// precedent ruleId or a model-call id from the audit log (passed in when B's audit export exists).
import type { FlagLike, Ratio } from "./lib/types";
import { ratio } from "./lib/types";

export type M6 = {
  traceable: Ratio;
  withWhere: Ratio;
  withRuleOrModel: Ratio;
  untraceableFlagIds: string[];
};

export function m6(
  flags: FlagLike[],
  modelCallFlagIds: Set<string> = new Set(),
): M6 {
  const where = (f: FlagLike) => f.where.length > 0;
  const ruleOrModel = (f: FlagLike) =>
    f.confidence === "certain" ||
    Boolean(f.precedent?.ruleId) ||
    modelCallFlagIds.has(f.id);
  const ok = (f: FlagLike) => where(f) && ruleOrModel(f);
  return {
    traceable: ratio(flags.filter(ok).length, flags.length),
    withWhere: ratio(flags.filter(where).length, flags.length),
    withRuleOrModel: ratio(flags.filter(ruleOrModel).length, flags.length),
    untraceableFlagIds: flags.filter((f) => !ok(f)).map((f) => f.id),
  };
}
