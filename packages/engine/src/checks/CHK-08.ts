import type { Flag, Rule } from "../schemas";
import { cycleEntries } from "./flag";
import type { Check, CheckInput } from "./types";
import { companyWorkers, workerFlag } from "./worker";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const present = new Set(cycleEntries(input).map((e) => e.workerId));
  // The current contract has no Gusto active status. A Gusto mapping alone cannot prove active employment.
  return companyWorkers(input)
    .filter((w) => w.status === "inactive" && present.has(w.id))
    .map((w) =>
      workerFlag(
        input,
        w,
        "CHK-08",
        "owner",
        `Inactive worker ${w.id} has entries in this cycle.`,
      ),
    );
}
export default { id: "CHK-08", run } satisfies Check;
