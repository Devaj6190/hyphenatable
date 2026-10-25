// Jobber report CSV layouts, on SYNTHETIC replicas only.
import { describe, expect, it } from "vitest";
import {
  EXPENSE_REPORT_CSV,
  INVOICES_REPORT_CSV,
  ONE_OFF_JOBS_CSV,
  QUOTES_REPORT_CSV,
  RECURRING_JOBS_CSV,
  TRANSACTION_LIST_CSV,
} from "../__fixtures__/make-r-report-replicas.ts";
import {
  EXPENSE_REPORT,
  expenseKind,
  INVOICES_REPORT,
  JOBS_REPORT,
  QUOTES_REPORT,
  readJobberReportCsv,
  TRANSACTION_LIST,
  transactionKind,
} from "../jobber-reports.ts";
import { categoryOf, datePart, jobNumberOf, looseMoney } from "../keywords.ts";

const opts = { companyId: "r", now: () => new Date("2026-10-24T12:00:00Z") };
const read = <K extends string>(
  spec: Parameters<typeof readJobberReportCsv<K>>[0],
  text: string,
) => readJobberReportCsv(spec, { text, fileName: "x.csv" }, opts);

describe("helpers", () => {
  it("categories, job numbers, money and dates", () => {
    expect([
      categoryOf("Mulch", "3 yards"),
      categoryOf("Gas"),
      categoryOf("Helper", "6 hours x $25"),
      categoryOf("Hedge trim"),
      categoryOf(null, ""),
    ]).toEqual(["mulch", "fuel", "labor", "other", null]);
    expect([
      jobNumberOf("#527"),
      jobNumberOf("527"),
      jobNumberOf("Job #12"),
      jobNumberOf(""),
      jobNumberOf("N/A"),
    ]).toEqual([527, 527, 12, null, null]);
    expect([
      looseMoney("- $55.71"),
      looseMoney("+ $250.00"),
      looseMoney("  "),
    ]).toEqual(["-$55.71", "+$250.00", null]);
    expect([
      datePart("Sep 25, 2026 4:12 PM"),
      datePart("09/21/2026 5:00pm"),
      datePart("2026-09-21T10:00"),
      datePart("soon"),
    ]).toEqual(["Sep 25, 2026", "09/21/2026", "2026-09-21", null]);
  });
});

describe("Expense Report", () => {
  it("reads amount, date, job, people and a category; free text is dropped; totals reconcile", async () => {
    const r = await read(EXPENSE_REPORT, EXPENSE_REPORT_CSV);
    expect(r.syncRun).toMatchObject({
      object: "jobberExpenses",
      pulled: 3,
      expected: 3,
      complete: true,
      error: null,
    });
    expect(
      r.rows.map((x) => [
        x.money.total,
        x.dates.date,
        x.jobs.job,
        x.names.enteredBy,
        x.names.reimbursableTo,
        x.present.details,
        x.category,
        expenseKind(x),
      ]),
    ).toEqual([
      [
        21437,
        "2026-09-21",
        [527],
        "Avery Reed",
        null,
        true,
        "mulch",
        "expense",
      ],
      [
        4800,
        "2026-09-22",
        [],
        "Jordan Ellis",
        "Jordan Ellis",
        false,
        "fuel",
        "expense",
      ],
      [
        15000,
        "2026-09-23",
        [530],
        "Avery Reed",
        null,
        true,
        "labor",
        "labor_paid_as_expense",
      ],
    ]);
    const json = JSON.stringify(r);
    for (const s of [
      "3 yards",
      "Fake Lane",
      "Spring cleanup for",
      "Pat Quinlan",
      "Helper",
      "Mulch install",
    ])
      expect(json).not.toContain(s);
  });

  it("a total that disagrees makes the run incomplete", async () => {
    const r = await read(
      EXPENSE_REPORT,
      EXPENSE_REPORT_CSV.replace(
        "Total Expense Value,$412.37",
        "Total Expense Value,$400.00",
      ),
    );
    expect(r.syncRun).toMatchObject({
      complete: false,
      error: "rows sum 41237¢ vs preamble total 40000¢",
    });
  });
});

describe("Transaction List", () => {
  it("reads type, amount, method and job; postal code and check numbers are never read", async () => {
    const r = await read(TRANSACTION_LIST, TRANSACTION_LIST_CSV);
    expect(r.syncRun).toMatchObject({ pulled: 4, expected: 4, complete: true });
    expect(
      r.rows.map((x) => [
        x.keep.type,
        transactionKind(x.keep.type ?? null),
        x.money.total,
        x.keep.method,
        x.jobs.job,
      ]),
    ).toEqual([
      ["Invoice", "invoice", 125040, null, [527]],
      ["Payment", "final", -95040, "Check", [527]],
      ["Deposit", "deposit", -30000, "Credit card", [527]],
      ["Refund", "refund", 5000, "Cash", []],
    ]);
    expect(JSON.stringify(r)).not.toMatch(/02134|1042/);
  });
});

describe("Invoices, Quotes and Jobs reports", () => {
  it("invoices: numbers, dates (date-times too), money, status, salesperson; subject reduced to a category", async () => {
    const r = await read(INVOICES_REPORT, INVOICES_REPORT_CSV);
    expect(r.syncRun).toMatchObject({ pulled: 2, expected: 2, complete: true });
    expect(r.rows[0]).toMatchObject({
      keep: { invoice: "1042", status: "Paid" },
      dates: {
        created: "2026-09-20",
        issued: "2026-09-21",
        due: "2026-10-05",
        paid: "2026-09-25",
      },
      money: { subtotal: 120000, tax: 5040, total: 125040, balance: 0 },
      jobs: { job: [527] },
      names: { salesperson: "Jordan Ellis", client: "Brookside Dental" },
    });
    expect(JSON.stringify(r)).not.toContain("Spring cleanup at");
    // "Tax (%)" is never the tax column (it carries a jurisdiction word); "-" is an empty cell
    expect(r.rows[1]).toMatchObject({
      dates: { paid: null },
      money: { subtotal: 60000, tax: 0, total: 60000 },
    });
    expect(JSON.stringify(r)).not.toContain("Fakecounty");
  });

  it("quotes and jobs reconcile with their Report totals", async () => {
    const q = await read(QUOTES_REPORT, QUOTES_REPORT_CSV);
    expect(q.syncRun).toMatchObject({ pulled: 2, complete: true });
    expect(q.rows[1]).toMatchObject({
      keep: { quote: "89", status: "Draft" },
      dates: { sent: null, approved: null, converted: null },
      money: { total: 90000 },
      jobs: { job: [] },
    });
    const j = await read(JOBS_REPORT, ONE_OFF_JOBS_CSV);
    expect(j.syncRun).toMatchObject({ pulled: 2, complete: true });
    expect(
      j.rows.map((x) => [
        x.jobs.job,
        x.keep.status,
        x.money.total,
        x.dates.closed,
      ]),
    ).toEqual([
      [[527], "Archived", 125040, "2026-09-25"],
      [[530], "Requires invoicing", 60000, null],
    ]);
    const rec = await read(JOBS_REPORT, RECURRING_JOBS_CSV);
    expect(rec.syncRun).toMatchObject({ pulled: 1, complete: true });
    expect(rec.rows[0]?.dates.closed).toBeNull();
    const bad = await read(
      JOBS_REPORT,
      RECURRING_JOBS_CSV.replace('"$3,200.00",Active', '"$3,100.00",Active'),
    );
    expect(bad.syncRun.error).toBe("rows sum 310000¢ vs Report totals 320000¢");
  });

  it("an unreadable value names row and column only", async () => {
    const r = await read(
      INVOICES_REPORT,
      INVOICES_REPORT_CSV.replace('"Sep 29, 2026"', '"someday"'),
    );
    expect(r.syncRun).toMatchObject({
      complete: false,
      pulled: 1,
      expected: 2,
    });
    expect(r.syncRun.error).toContain("row 3: unreadable issued");
    expect(r.syncRun.error).not.toMatch(/Maple|someday/);
  });
});
