// Salaried pay: a fixed amount per pay period from the compensation; hours are listed for information only.
import { divHalfUp } from "./money";

export const PERIODS_PER_YEAR = { weekly: 52, biweekly: 26 } as const;

/** Per-period salary in cents, or null when the unit cannot be turned into a period amount. */
export function salaryPerPeriod(
  rateCents: number,
  unit: string,
  payFrequency: keyof typeof PERIODS_PER_YEAR,
): number | null {
  const n = PERIODS_PER_YEAR[payFrequency];
  switch (unit) {
    case "Year":
      return divHalfUp(rateCents, n);
    case "Month":
      return divHalfUp(rateCents * 12, n);
    case "Week":
      return divHalfUp(rateCents * 52, n);
    case "Paycheck":
      return rateCents;
    default:
      return null;
  }
}
