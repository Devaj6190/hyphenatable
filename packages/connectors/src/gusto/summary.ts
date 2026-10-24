// Counts-only summary of Gusto payroll history, for onboarding and CHK-22 (gross change vs the mean of the
// last 3 cycles). No money, no names, no uuids: what the history looks like, not what it contains.

import type { GustoPayroll } from "./normalize.ts";

export interface PayrollHistorySummary {
  payrolls: number;
  processed: number;
  byType: { regular: number; off_cycle: number };
  /** off-cycle reasons as Gusto names them (Bonus, Correction, ...) */
  offCycleReasons: Record<string, number>;
  firstPeriodStart: string | null;
  lastPeriodEnd: string | null;
  /** regular payrolls by period length in days (14 = biweekly, 7 = weekly) */
  regularPeriodDays: Record<string, number>;
  /** payrolls listed without detail (no employee_compensations) */
  withoutDetail: number;
  employeesPerPayroll: { min: number; max: number } | null;
  distinctEmployees: number;
  /** employees with a gross figure on at least 3 regular payrolls: the ones CHK-22 can compare */
  employeesWith3RegularPayrolls: number;
  employeeRows: number;
  employeeRowsExcluded: number;
  /** rows whose gross is missing (null): never counted as 0 */
  employeeRowsWithoutGross: number;
  /** earning names seen (Regular Hours, Overtime, Bonus, ...) with row counts */
  earningNames: Record<string, number>;
}

const days = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  ) + 1;
const bump = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1;
};

export function summarizePayrolls(
  payrolls: GustoPayroll[],
): PayrollHistorySummary {
  const s: PayrollHistorySummary = {
    payrolls: payrolls.length,
    processed: 0,
    byType: { regular: 0, off_cycle: 0 },
    offCycleReasons: {},
    firstPeriodStart: null,
    lastPeriodEnd: null,
    regularPeriodDays: {},
    withoutDetail: 0,
    employeesPerPayroll: null,
    distinctEmployees: 0,
    employeesWith3RegularPayrolls: 0,
    employeeRows: 0,
    employeeRowsExcluded: 0,
    employeeRowsWithoutGross: 0,
    earningNames: {},
  };
  const regularPerEmployee = new Map<string, number>();
  const everyone = new Set<string>();
  for (const p of payrolls) {
    if (p.processed) s.processed++;
    s.byType[p.payrollType]++;
    if (p.payrollType === "off_cycle")
      bump(s.offCycleReasons, p.offCycleReason ?? "unknown");
    if (
      p.periodStart &&
      (!s.firstPeriodStart || p.periodStart < s.firstPeriodStart)
    )
      s.firstPeriodStart = p.periodStart;
    if (p.periodEnd && (!s.lastPeriodEnd || p.periodEnd > s.lastPeriodEnd))
      s.lastPeriodEnd = p.periodEnd;
    if (p.payrollType === "regular" && p.periodStart && p.periodEnd)
      bump(s.regularPeriodDays, String(days(p.periodStart, p.periodEnd)));
    if (!p.employees) {
      s.withoutDetail++;
      continue;
    }
    const n = p.employees.length;
    s.employeesPerPayroll = s.employeesPerPayroll
      ? {
          min: Math.min(s.employeesPerPayroll.min, n),
          max: Math.max(s.employeesPerPayroll.max, n),
        }
      : { min: n, max: n };
    for (const e of p.employees) {
      s.employeeRows++;
      everyone.add(e.employeeUuid);
      if (e.excluded) s.employeeRowsExcluded++;
      if (e.grossCents === null) s.employeeRowsWithoutGross++;
      for (const line of [...e.hourly, ...e.fixed])
        bump(s.earningNames, line.name);
      // CHK-22 needs a gross figure: excluded rows and rows without gross do not count
      if (p.payrollType === "regular" && !e.excluded && e.grossCents !== null)
        regularPerEmployee.set(
          e.employeeUuid,
          (regularPerEmployee.get(e.employeeUuid) ?? 0) + 1,
        );
    }
  }
  s.distinctEmployees = everyone.size;
  s.employeesWith3RegularPayrolls = [...regularPerEmployee.values()].filter(
    (n) => n >= 3,
  ).length;
  return s;
}

export function formatSummary(s: PayrollHistorySummary): string {
  const kv = (m: Record<string, number>) =>
    Object.entries(m)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "none";
  return [
    `payrolls ${s.payrolls} (processed ${s.processed}; regular ${s.byType.regular}, off-cycle ${s.byType.off_cycle}${s.byType.off_cycle ? `: ${kv(s.offCycleReasons)}` : ""})`,
    `periods ${s.firstPeriodStart ?? "?"} .. ${s.lastPeriodEnd ?? "?"}; regular period length (days): ${kv(s.regularPeriodDays)}`,
    `detail: ${s.payrolls - s.withoutDetail} with employee lines, ${s.withoutDetail} without; employees per payroll ${s.employeesPerPayroll ? `${s.employeesPerPayroll.min}..${s.employeesPerPayroll.max}` : "n/a"}`,
    `employees ${s.distinctEmployees} distinct; ${s.employeesWith3RegularPayrolls} with >= 3 regular payrolls (CHK-22 comparable)`,
    `employee rows ${s.employeeRows}: excluded ${s.employeeRowsExcluded}, without gross ${s.employeeRowsWithoutGross}`,
    `earning names: ${kv(s.earningNames)}`,
  ].join("\n");
}
