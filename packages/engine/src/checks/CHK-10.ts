import type { Flag, Rule } from "../schemas";
import type { Check, CheckInput } from "./types";
import { companyWorkers, workerFlag } from "./worker";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  return companyWorkers(input)
    .filter(
      (w) =>
        w.payType === "hourly" &&
        w.jobber?.labourRateCents != null &&
        w.gusto?.rateCents != null &&
        w.jobber.labourRateCents !== w.gusto.rateCents,
    )
    .map((w) =>
      workerFlag(
        input,
        w,
        "CHK-10",
        "owner",
        `Worker ${w.id} has different hourly rates in Jobber and Gusto.`,
      ),
    );
}
export default { id: "CHK-10", run } satisfies Check;
