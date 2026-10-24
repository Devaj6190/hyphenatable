// Reimbursements: Jobber expenses a worker paid for (reimbursableToWorkerId) that are still
// PENDING_REIMBURSEMENT become a fixed `Reimbursement` on that worker's line. An unknown amount is held.
import type { Expense } from "./types";

export type Reimbursement = {
  workerId: string;
  expenseId: string;
  amountCents: number | null;
};

export function pendingReimbursements(
  expenses: Expense[],
  periodEndDay: string,
): Reimbursement[] {
  return expenses
    .filter(
      (x) =>
        x.source === "jobber" &&
        x.reimbursableToWorkerId &&
        x.reimbursementStatus === "PENDING_REIMBURSEMENT" &&
        x.date.slice(0, 10) <= periodEndDay,
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((x) => ({
      workerId: x.reimbursableToWorkerId as string,
      expenseId: x.id,
      amountCents:
        typeof x.amountCents === "number" &&
        Number.isSafeInteger(x.amountCents) &&
        x.amountCents > 0
          ? x.amountCents
          : null,
    }));
}
