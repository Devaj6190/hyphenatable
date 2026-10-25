import type { Expense, Flag, Rule } from "../schemas";
import {
  cycleExpenses,
  dollars,
  expenseWhere,
  norm,
  recordFlag,
  sourceDay,
} from "./flag";
import type { Check, CheckInput } from "./types";

const DAY_MS = 86_400_000;

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const xs = cycleExpenses(input);
  const d = (x: Expense) => sourceDay(input, x.date);
  const flags: Flag[] = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const [a, b] = [xs[i], xs[j]];
      if (a.amountCents === null || b.amountCents === null) continue;
      if (Math.abs(a.amountCents - b.amountCents) > 1) continue;
      if (Math.abs(Date.parse(d(a)) - Date.parse(d(b))) > DAY_MS) continue;
      const sameVendor = a.vendor !== null && norm(a.vendor) === norm(b.vendor);
      if (!sameVendor && a.source === b.source) continue;
      const identical =
        a.source === b.source &&
        a.amountCents === b.amountCents &&
        d(a) === d(b) &&
        a.vendor === b.vendor &&
        a.description === b.description &&
        a.accountName === b.accountName;
      const jobs = [a.matchedJobId, b.matchedJobId].filter((j) => j !== null);
      flags.push(
        recordFlag(
          input,
          "CHK-15",
          "owner",
          `${a.id},${b.id}`,
          {
            jobId: jobs.every((j) => j === jobs[0]) ? (jobs[0] ?? null) : null,
            expenseIds: [a.id, b.id],
          },
          `Expenses ${a.id} (${a.source}) and ${b.id} (${b.source}) look like the same ${dollars(Math.min(a.amountCents, b.amountCents))} purchase.`,
          [expenseWhere(a), expenseWhere(b)],
          {
            confidence: identical ? "certain" : 0.9,
            dollarsCents: Math.min(a.amountCents, b.amountCents),
          },
        ),
      );
    }
  return flags;
}
export default { id: "CHK-15", run } satisfies Check;
