import type { Flag, Rule } from "../schemas";
import type { Check, CheckInput } from "./types";
import { companyWorkers, workerFlag } from "./worker";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  return companyWorkers(input)
    .filter(
      (w) => w.payType === "contractor_venmo" && w.venmoRateCents === null,
    )
    .map((w) =>
      workerFlag(
        input,
        w,
        "CHK-11",
        "owner",
        `Worker ${w.id} is paid through Venmo but has no recorded rate.`,
      ),
    );
}
export default { id: "CHK-11", run } satisfies Check;
