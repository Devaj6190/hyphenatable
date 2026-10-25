import type { Flag, Rule } from "../schemas";
import { reconcileCycle } from "./flag";
import { rulePrecedent } from "./precedent";
import type { Check, CheckInput } from "./types";
import { companyWorkers, workerFlag } from "./worker";

/** Stage 2: Jobber costs labor at a rate that differs from the active pay_rate rule's cost rate. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const workers = new Map(companyWorkers(input).map((w) => [w.id, w]));
  const rules = new Map(input.rules.map((r) => [r.id, r]));
  return reconcileCycle(input).staleRates.flatMap((s) => {
    const worker = workers.get(s.workerId);
    const rule = rules.get(s.ruleId);
    if (!worker || !rule) return [];
    const flag = workerFlag(
      input,
      worker,
      "CHK-18",
      "owner",
      `Jobber costs labor for ${worker.id} at a rate that differs from pay_rate rule ${rule.id}; this cycle's job profit is off by the difference.`,
    );
    return [
      {
        ...flag,
        precedent: rulePrecedent(rule),
        affects: { ...flag.affects, dollarsCents: s.overstatementCents },
      },
    ];
  });
}
export default { id: "CHK-18", run } satisfies Check;
