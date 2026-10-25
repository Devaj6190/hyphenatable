import type { Flag, Rule } from "../schemas";
import {
  activeRules,
  cycleExpenses,
  dollars,
  expenseWhere,
  norm,
  recordFlag,
} from "./flag";
import { rulePrecedent } from "./precedent";
import type { Check, CheckInput } from "./types";

/** Below this matching score a match is a question, not a fact (plan B-07). */
export const MATCH_ASK_BELOW = 0.85;

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const hints = activeRules(input, "vendor_job_hint");
  return cycleExpenses(input)
    .filter(
      (x) =>
        x.kind === "job_cost" &&
        (x.matchedJobId === null ||
          (x.matchConfidence !== null && x.matchConfidence < MATCH_ASK_BELOW)),
    )
    .map((x) => {
      const hint = x.vendor
        ? hints.find(
            (r) =>
              typeof r.params.vendor === "string" &&
              norm(r.params.vendor) === norm(x.vendor),
          )
        : undefined;
      const amount =
        x.amountCents === null ? "" : ` (${dollars(x.amountCents)})`;
      return recordFlag(
        input,
        "CHK-14",
        "manager",
        x.id,
        { expenseIds: [x.id] },
        x.matchedJobId === null
          ? `Job-cost expense ${x.id}${amount} has no job.`
          : `Job-cost expense ${x.id}${amount} matched job ${x.matchedJobId} with score ${x.matchConfidence}, below ${MATCH_ASK_BELOW}.`,
        [expenseWhere(x)],
        {
          confidence: x.matchConfidence ?? "certain",
          dollarsCents: x.amountCents,
          precedent: hint ? rulePrecedent(hint) : null,
        },
      );
    });
}
export default { id: "CHK-14", run } satisfies Check;
