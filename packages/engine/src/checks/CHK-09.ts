import type { Flag, Rule } from "../schemas";
import type { Check, CheckInput } from "./types";
import { companyWorkers, hasHours, workerFlag } from "./worker";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  return companyWorkers(input)
    .filter((w) => w.gusto?.onboarded === false && hasHours(input, w))
    .map((w) =>
      workerFlag(
        input,
        w,
        "CHK-09",
        "owner",
        `Worker ${w.id} has hours but Gusto onboarding is incomplete.`,
      ),
    );
}
export default { id: "CHK-09", run } satisfies Check;
