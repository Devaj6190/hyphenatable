import { describe, expect, it } from "vitest";
import type { GustoPayroll } from "../normalize.ts";
import { formatSummary, summarizePayrolls } from "../summary.ts";

type Emp = NonNullable<GustoPayroll["employees"]>[number];
const emp = (uuid: string, over: Partial<Emp> = {}): Emp => ({
  workerId: `gusto:employee:${uuid}`,
  employeeUuid: uuid,
  excluded: false,
  grossCents: 123456,
  netCents: 99999,
  hourly: [
    { name: "Regular Hours", hours: 80, amountCents: 123456, jobUuid: null },
  ],
  fixed: [],
  ...over,
});
const payroll = (
  n: number,
  start: string,
  end: string,
  employees: Emp[] | null,
  over: Partial<GustoPayroll> = {},
): GustoPayroll => ({
  id: `gusto:payroll:fake-pr-${n}`,
  companyId: "a",
  sourceId: `fake-pr-${n}`,
  processed: true,
  payrollType: "regular",
  offCycleReason: null,
  periodStart: start,
  periodEnd: end,
  checkDate: null,
  grossCents: 555555,
  employees,
  ...over,
});

const history: GustoPayroll[] = [
  payroll(1, "2026-08-15", "2026-08-28", [emp("e1"), emp("e2"), emp("e3")]),
  payroll(2, "2026-08-29", "2026-09-11", [
    emp("e1"),
    emp("e2"),
    emp("e3", { excluded: true }),
  ]),
  payroll(3, "2026-09-12", "2026-09-25", [
    emp("e1"),
    emp("e2", { grossCents: null }),
  ]),
  payroll(4, "2026-09-26", "2026-10-09", [emp("e1"), emp("e4")]),
  payroll(
    5,
    "2026-10-01",
    "2026-10-09",
    [
      emp("e1", {
        hourly: [],
        fixed: [{ name: "Bonus", amountCents: 50000, jobUuid: null }],
      }),
    ],
    { payrollType: "off_cycle", offCycleReason: "Bonus" },
  ),
  payroll(6, "2026-10-10", "2026-10-23", null, { processed: false }),
];

describe("summarizePayrolls", () => {
  it("counts the history shape for onboarding and CHK-22", () => {
    expect(summarizePayrolls(history)).toEqual({
      payrolls: 6,
      processed: 5,
      byType: { regular: 5, off_cycle: 1 },
      offCycleReasons: { Bonus: 1 },
      firstPeriodStart: "2026-08-15",
      lastPeriodEnd: "2026-10-23",
      regularPeriodDays: { "14": 5 },
      withoutDetail: 1,
      employeesPerPayroll: { min: 1, max: 3 },
      distinctEmployees: 4,
      // e1: 4 regular with gross; e2: 2 (one has no gross); e3: 1 (+1 excluded); e4: 1
      employeesWith3RegularPayrolls: 1,
      employeeRows: 11,
      employeeRowsExcluded: 1,
      employeeRowsWithoutGross: 1,
      earningNames: { "Regular Hours": 10, Bonus: 1 },
    });
  });

  it("an empty history is zeros and nulls, not invented values", () => {
    const s = summarizePayrolls([]);
    expect([
      s.payrolls,
      s.firstPeriodStart,
      s.employeesPerPayroll,
      s.employeesWith3RegularPayrolls,
    ]).toEqual([0, null, null, 0]);
  });

  it("formats counts only: no uuids, no money", () => {
    const text = formatSummary(summarizePayrolls(history));
    expect(text).toContain(
      "payrolls 6 (processed 5; regular 5, off-cycle 1: Bonus 1)",
    );
    expect(text).toContain("1 with >= 3 regular payrolls (CHK-22 comparable)");
    expect(text).not.toMatch(/fake-pr|e1|1234|5555|9999/);
  });
});
