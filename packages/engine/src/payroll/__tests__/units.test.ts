import { describe, expect, test } from "vitest";
import { bucketHours, localDate, workweekAnchor } from "../hours";
import { centsFor, divHalfUp, hours2 } from "../money";
import { parseOvertimePolicy, splitWeek, worksSevenDays } from "../overtime";
import { payRate, venmoRate } from "../rates";
import { pendingReimbursements } from "../reimbursements";
import { salaryPerPeriod } from "../salaried";
import type { Expense, Rule, TimeEntry, Worker } from "../types";

const H = 3600;
const rule = (
  id: string,
  type: Rule["type"],
  params: Record<string, unknown>,
  status: Rule["status"] = "active",
): Rule => ({
  id,
  companyId: "t",
  type,
  params,
  status,
});
const WEEKLY = rule("r-ot", "overtime_policy", {
  weeklyHours: 40,
  multiplier: 1.5,
  dailyHours: null,
});
const CA = rule("r-ca", "overtime_policy", {
  workweek: "Sunday-Saturday",
  daily: [
    { overHours: 8, multiplier: 1.5 },
    { overHours: 12, multiplier: 2 },
  ],
  weekly: { overHours: 40, multiplier: 1.5 },
  seventhConsecutiveDay: null,
});
const days = (...hours: number[]) =>
  new Map(hours.map((h, i) => [`2026-10-${10 + i}`, h * H]));
const policy = (r: Rule) => {
  const p = parseOvertimePolicy([r]);
  if (!p.ok) throw new Error(p.reason);
  return p.policy;
};

describe("money", () => {
  test("half-up once from unrounded seconds", () => {
    expect(divHalfUp(5, 2)).toBe(3);
    expect(divHalfUp(4, 2)).toBe(2);
    expect(centsFor(277500, 2200)).toBe(169583); // 77.0833 h × $22 = $1,695.833
    expect(centsFor(1800, 2501, 1.5)).toBe(1876); // 0.5 h × 3751.5¢ = 1875.75
    expect(hours2(140700)).toBe(39.08);
    expect(() => centsFor(1, 1, 1.505)).toThrow();
  });
});

describe("hours", () => {
  const e = (
    id: string,
    startAt: string,
    hours: number,
    extra: Partial<TimeEntry> = {},
  ): TimeEntry => ({
    id,
    companyId: "a",
    cycleId: "a-c05",
    sourceId: id,
    workerId: "w",
    jobId: "j",
    visitId: null,
    startAt,
    endAt: null,
    durationSec: hours * H,
    ticking: false,
    approved: true,
    approvedBy: null,
    payable: true,
    category: "GENERAL",
    label: null,
    hasNote: false,
    ...extra,
  });
  const tz = "America/New_York";
  const start = "2026-10-10T04:00:00.000Z"; // Sat 00:00 EDT
  const anchor = workweekAnchor(localDate(start, tz), null).anchor;
  const run = (es: TimeEntry[], held: string[] = []) =>
    bucketHours(es, {
      periodStart: start,
      periodEnd: "2026-10-24T03:59:59.999Z",
      timeZone: tz,
      anchor,
      held: new Set(held),
    });

  test("local day and week, not UTC: Fri 23:30 EDT is week 1, Sat 00:30 EDT is week 2", () => {
    const { byWorker } = run([
      e("fri", "2026-10-17T03:30:00.000Z", 2),
      e("sat", "2026-10-17T04:30:00.000Z", 3),
    ]);
    const weeks = byWorker.get("w")?.weeks;
    expect([...(weeks?.get("2026-10-10") ?? [])]).toEqual([
      ["2026-10-16", 2 * H],
    ]);
    expect([...(weeks?.get("2026-10-17") ?? [])]).toEqual([
      ["2026-10-17", 3 * H],
    ]);
  });
  test("BREAK, not payable, held and out-of-period entries are left out with a reason; nothing is trimmed", () => {
    const { byWorker, skipped } = run(
      [
        e("ok", "2026-10-12T12:00:00.000Z", 13),
        e("brk", "2026-10-12T16:00:00.000Z", 1, { category: "BREAK" }),
        e("np", "2026-10-12T17:00:00.000Z", 1, { payable: false }),
        e("held", "2026-10-13T12:00:00.000Z", 8),
        e("late", "2026-10-24T12:00:00.000Z", 8),
      ],
      ["held"],
    );
    expect(byWorker.get("w")?.seconds).toBe(13 * H);
    expect(skipped.map((s) => s.entryId)).toEqual([
      "brk",
      "np",
      "held",
      "late",
    ]);
  });
  test("a rule workweek overrides the period start", () => {
    // Period starts Saturday 2026-10-10; a Sunday-Saturday workweek starts Sunday 2026-10-04.
    expect(workweekAnchor("2026-10-10", "Sunday-Saturday").anchor).toBe(
      Date.UTC(2026, 9, 4) / 86_400_000,
    );
  });
});

describe("overtime", () => {
  test("weekly: over 40 h at 1.5x, no daily OT", () => {
    expect(splitWeek(days(13, 10, 10, 9.5), policy(WEEKLY))).toEqual({
      "Regular Hours": 40 * H,
      Overtime: 2.5 * H,
      "Double Overtime": 0,
    });
  });
  test("California: 13 h day is 8 / 4 at 1.5x / 1 at 2x", () => {
    expect(splitWeek(days(13), policy(CA))).toEqual({
      "Regular Hours": 8 * H,
      Overtime: 4 * H,
      "Double Overtime": 1 * H,
    });
  });
  test("California: daily OT hours do not count toward the weekly 40", () => {
    // 6 days × 9 h: 6 × 8 = 48 regular → 40 regular + 8 weekly OT; plus 6 × 1 daily OT.
    expect(splitWeek(days(9, 9, 9, 9, 9, 9), policy(CA))).toEqual({
      "Regular Hours": 40 * H,
      Overtime: 14 * H,
      "Double Overtime": 0,
    });
    expect(worksSevenDays(days(1, 1, 1, 1, 1, 1, 1))).toBe(true);
  });
  test("unknown or unsupported policies are refused with a reason", () => {
    expect(parseOvertimePolicy([])).toEqual({
      ok: false,
      reason: "no active overtime_policy rule",
    });
    expect(parseOvertimePolicy([{ ...WEEKLY, status: "proposed" }]).ok).toBe(
      false,
    );
    expect(parseOvertimePolicy([WEEKLY, CA]).ok).toBe(false);
    expect(
      parseOvertimePolicy([
        rule("x", "overtime_policy", { weeklyHours: 40, multiplier: 1.75 }),
      ]).ok,
    ).toBe(false);
    expect(
      parseOvertimePolicy([
        rule("x", "overtime_policy", {
          ...CA.params,
          seventhConsecutiveDay: { multiplier: 1.5 },
        }),
      ]).ok,
    ).toBe(false);
  });
});

describe("rates", () => {
  const worker = (
    gustoRate: number | null,
    venmo: number | null = null,
  ): Worker => ({
    id: "w",
    companyId: "t",
    displayName: "Test Worker",
    role: "field",
    payType: "hourly",
    status: "active",
    managerId: null,
    contactRef: null,
    jobber: null,
    gusto: {
      employeeUuid: "u",
      contractorUuid: null,
      jobUuid: null,
      rateCents: gustoRate,
      paymentUnit: "Hour",
      flsaStatus: "Nonexempt",
      onboarded: true,
    },
    venmoRateCents: venmo,
  });
  const pr = rule("r-p", "pay_rate", {
    workerId: "w",
    rateCents: 2600,
    paymentUnit: "Hour",
  });
  test("an active pay_rate rule overrides Gusto; a proposed one does not", () => {
    expect(payRate(worker(2500), [pr])).toMatchObject({
      ok: true,
      rateCents: 2600,
    });
    expect(
      payRate(worker(2500), [{ ...pr, status: "proposed" }]),
    ).toMatchObject({ ok: true, rateCents: 2500 });
  });
  test("no rate anywhere, or conflicting rules → no rate, never a default", () => {
    expect(payRate(worker(null), []).ok).toBe(false);
    expect(payRate(worker(2500), [pr, { ...pr, id: "r-p2" }]).ok).toBe(false);
    expect(venmoRate(worker(null, null), []).ok).toBe(false);
    expect(venmoRate(worker(null, 2200), [])).toMatchObject({
      ok: true,
      rateCents: 2200,
    });
  });
});

describe("salaried and reimbursements", () => {
  test("salary per period", () => {
    expect(salaryPerPeriod(6760000, "Year", "biweekly")).toBe(260000);
    expect(salaryPerPeriod(4160000, "Year", "weekly")).toBe(80000);
    expect(salaryPerPeriod(100, "Fortnight", "weekly")).toBeNull();
  });
  test("only pending Jobber reimbursements; an unknown amount stays unknown", () => {
    const x: Expense = {
      id: "x1",
      companyId: "a",
      source: "jobber",
      sourceId: "x1",
      date: "2026-10-15T17:00:00.000Z",
      amountCents: 4321,
      vendor: null,
      description: null,
      accountName: null,
      customerRef: null,
      paymentType: null,
      kind: "unknown",
      matchedJobId: null,
      matchConfidence: null,
      reimbursableToWorkerId: "w",
      reimbursementStatus: "PENDING_REIMBURSEMENT",
    };
    const got = pendingReimbursements(
      [
        x,
        { ...x, id: "x2", reimbursementStatus: "PAID" },
        { ...x, id: "x3", amountCents: null },
        { ...x, id: "x4", source: "qbo" },
      ],
      "2026-10-23",
    );
    expect(got).toEqual([
      { workerId: "w", expenseId: "x1", amountCents: 4321 },
      { workerId: "w", expenseId: "x3", amountCents: null },
    ]);
  });
});
