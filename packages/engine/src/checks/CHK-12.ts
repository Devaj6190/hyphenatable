import type { Flag, Rule } from "../schemas";
import type { Check, CheckInput } from "./types";
import { companyWorkers, hasHours, workerFlag } from "./worker";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  // Informational only: route none. This must never create a question or a payroll hold.
  return companyWorkers(input)
    .filter((w) => w.payType !== "hourly" && hasHours(input, w))
    .map((w) =>
      workerFlag(
        input,
        w,
        "CHK-12",
        "none",
        `Worker ${w.id} is outside the hourly sync; the payroll engine handles this pay type.`,
      ),
    );
}
export default { id: "CHK-12", run } satisfies Check;
