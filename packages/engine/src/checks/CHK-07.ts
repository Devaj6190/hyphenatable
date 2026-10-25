import type { Flag, Rule } from "../schemas";
import { cycleEntries } from "./flag";
import type { Check, CheckInput } from "./types";
import { companyWorkers, workerFlag } from "./worker";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const present = new Set(cycleEntries(input).map((e) => e.workerId));
  return companyWorkers(input)
    .filter(
      (w) =>
        w.status === "active" && w.payType === "hourly" && !present.has(w.id),
    )
    .map((w) =>
      workerFlag(
        input,
        w,
        "CHK-07",
        "manager",
        `Active hourly worker ${w.id} has no entries in this cycle.`,
      ),
    );
}
export default { id: "CHK-07", run } satisfies Check;
