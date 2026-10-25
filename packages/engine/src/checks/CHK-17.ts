import type { Flag, Rule } from "../schemas";
import {
  activeRules,
  cycleExpenses,
  dollars,
  expenseWhere,
  norm,
  recordFlag,
} from "./flag";
import type { Check, CheckInput } from "./types";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const known = new Set(
    activeRules(input, "expense_account_kind")
      .map((r) => r.params.accountName)
      .filter((a): a is string => typeof a === "string")
      .map(norm),
  );
  // Jobber expenses have no account (null); they are never this check's subject.
  return cycleExpenses(input)
    .filter((x) => norm(x.accountName) && !known.has(norm(x.accountName)))
    .map((x) =>
      recordFlag(
        input,
        "CHK-17",
        "owner",
        x.id,
        { expenseIds: [x.id] },
        `Expense ${x.id}${x.amountCents === null ? "" : ` (${dollars(x.amountCents)})`} is on account "${x.accountName}", which has no job-cost or overhead rule.`,
        [expenseWhere(x)],
        { dollarsCents: x.amountCents },
      ),
    );
}
export default { id: "CHK-17", run } satisfies Check;
