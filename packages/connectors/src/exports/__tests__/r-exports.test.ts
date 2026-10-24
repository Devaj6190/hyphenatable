// Company R export layouts, on SYNTHETIC replicas only (fake names / addresses / amounts).
import { describe, expect, it } from "vitest";
import {
  GUSTO_JOURNAL_SECTIONED_CSV,
  JOBBER_TIMESHEETS_CSV,
} from "../__fixtures__/make-r-replicas.ts";
import {
  isSectionedJournal,
  readGustoPayrollJournalSectionedCsv,
  sectionKind,
} from "../gusto-payroll-journal-sectioned.ts";
import {
  accountKey,
  classifyWorkingOn,
  normalizeWorkerName,
  readJobberTimesheetsCsv,
} from "../jobber-timesheets-csv.ts";

const opts = {
  companyId: "r",
  timezone: "America/New_York",
  now: () => new Date("2026-10-24T12:00:00Z"),
};
const ts = (text = JOBBER_TIMESHEETS_CSV) =>
  readJobberTimesheetsCsv({ text, fileName: "t.csv" }, opts);
const gj = (text = GUSTO_JOURNAL_SECTIONED_CSV) =>
  readGustoPayrollJournalSectionedCsv({ text, fileName: "j.csv" }, opts);

describe("Jobber Timesheets CSV", () => {
  it("normalizes names, keys accounts by raw spelling, classifies Working on", () => {
    expect(normalizeWorkerName("Avery Reed Team Leader ")).toEqual({
      name: "Avery Reed",
      teamLeader: true,
    });
    expect(normalizeWorkerName("Jordan Ellis ")).toEqual({
      name: "Jordan Ellis",
      teamLeader: false,
    });
    expect([
      accountKey("Avery Reed Team Leader"),
      accountKey("Jordan Ellis "),
      accountKey("Jordan Ellis"),
    ]).toEqual(["Avery Reed", "Jordan Ellis ", "Jordan Ellis"]);
    expect(classifyWorkingOn("Job #518 - Brookside Dental")).toEqual({
      jobText: "Job #518",
      category: null,
      label: null,
    });
    expect(classifyWorkingOn("Driving")).toEqual({
      jobText: null,
      category: "DRIVING",
      label: null,
    });
    expect(classifyWorkingOn("Maple Grove HOA - Off-Site")).toEqual({
      jobText: null,
      category: null,
      label: "Maple Grove HOA - Off-Site",
    });
  });

  it("parses every row; rounding drift, merged accounts and an account missing from the totals block are notes", async () => {
    const r = await ts();
    expect(r.namesAnonymized).toBe(false);
    expect(r.syncRun).toMatchObject({
      object: "timeSheetEntries",
      pulled: 7,
      expected: 7,
      complete: true,
    });
    expect(r.syncRun.error).toBe(
      "note: 1 worker(s) have 2+ Jobber accounts (name variants); merged into one worker in the output (mergedAccounts 1); " +
        "note: Total Hours 27.26 h vs detail sum 27.25 h: per-row rounding drift; " +
        "note: Report totals 27.26 h vs detail sum 27.25 h: per-row rounding drift; " +
        "note: 1 user total(s) differ from their rows by per-row rounding only (within 0.005 h per row); " +
        "note: account not in totals block: 1 name variant(s) of listed workers, 2 row(s), 2.00 h (merged into their worker in the output)",
    );
    const [a1, a2, , j2, s0] = r.rows;
    expect(a1).toMatchObject({
      workerName: "Avery Reed",
      teamLeader: true,
      date: "2026-08-31",
      durationSec: 9000,
      startAt: "2026-08-31T13:30:00.000Z",
      endAt: "2026-08-31T16:00:00.000Z",
      jobText: "Job #518",
      clientName: "Brookside Dental",
      approved: null,
      hasNote: false,
    });
    expect(a2).toMatchObject({
      workerName: "Avery Reed",
      category: "GENERAL",
      jobText: null,
    });
    expect(j2).toMatchObject({
      workerName: "Jordan Ellis",
      label: "Maple Grove HOA - Off-Site",
      hasNote: true,
    });
    expect(s0).toMatchObject({
      workerName: "Sam Okafor",
      durationSec: 0,
      label: "Request for hedge quote",
    });
    // every Sam spelling is one worker in the output
    expect(r.rows.filter((x) => x.workerName === "Sam Okafor")).toHaveLength(3);
    expect(r.rows.map((x) => x.jobText).filter(Boolean)).toEqual([
      "Job #518",
      "Job #521",
      "Job #521",
    ]);
  });

  it("a user total beyond rounding is a problem, named by ordinal only", async () => {
    const r = await ts(
      JOBBER_TIMESHEETS_CSV.replace(
        "Sam Okafor,3.50",
        "Sam Okafor,3.60",
      ).replace("Total Hours,27.26", "Total Hours,27.50"),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain(
      "user #4: detail 3.50 h vs total row 3.60 h",
    );
    expect(r.syncRun.error).toContain(
      "detail sum 27.25 h vs Total Hours 27.50 h",
    );
    expect(r.syncRun.error).not.toMatch(/Sam|Okafor/);
  });

  it("two listed accounts of one person are compared separately", async () => {
    const bad = await ts(
      JOBBER_TIMESHEETS_CSV.replace("Jordan Ellis ,5.00", "Jordan Ellis ,9.25"),
    );
    expect(bad.syncRun.error).toContain(
      "user #3: detail 5.00 h vs total row 9.25 h",
    );
    expect(bad.syncRun.error).not.toContain("user #2");
  });

  it("the one listed account is compared to its exact spelling only (the live 77.61 vs 13.58 case)", async () => {
    // Sam's total (3.50) covers "Sam Okafor" only; "Sam Okafor " (2 rows, 2.00 h) is reported, not added
    const r = await ts();
    expect(r.syncRun.error).not.toContain("user #4");
  });

  it("a person whose only spelling differs from the total line falls back to that account", async () => {
    const r = await ts(
      JOBBER_TIMESHEETS_CSV.replaceAll(
        'Avery Reed Team Leader,"',
        'Avery Reed ,"',
      ),
    );
    expect(r.syncRun.complete).toBe(true);
    expect(r.syncRun.error).toContain("1 user total(s) differ");
  });

  it("an unreadable row is counted against completeness", async () => {
    const r = await ts(
      JOBBER_TIMESHEETS_CSV.replace('"Sep 3, 2026"', '"Sepember 3"'),
    );
    expect(r.syncRun).toMatchObject({
      pulled: 6,
      expected: 7,
      complete: false,
    });
    expect(r.syncRun.error).toContain("unreadable date");
  });
});

describe("Gusto Payroll Journal Report (sectioned)", () => {
  it("detects the layout and the section kinds", () => {
    expect(isSectionedJournal(GUSTO_JOURNAL_SECTIONED_CSV)).toBe(true);
    expect(isSectionedJournal("Employee,Gross Earnings\nA,1\n")).toBe(false);
    expect([
      sectionKind("Regular"),
      sectionKind("Regular (Sep 12 - Sep 25)"),
      sectionKind("Off-Cycle (Bonus)"),
      sectionKind("Bonus run"),
    ]).toEqual(["regular", "regular", "off_cycle", "other"]);
  });

  it("gross = Gross line or the itemized sum; Totals subtotals are never added; totals reconcile", async () => {
    const r = await gj();
    expect(r.syncRun).toMatchObject({
      object: "payrollJournal",
      pulled: 6,
      expected: 6,
      complete: true,
      error:
        "note: 1 employee row(s) with no pay lines: gross 0 from the source; note: 2 pay type(s) given only as a Totals line (e.g. Owner's Draw): used as the itemized amount",
    });
    expect(
      r.rows.map((x) => [
        x.section,
        x.sectionKind,
        x.employeeName,
        x.periodStart,
        x.checkDate,
        x.grossCents,
        x.payKind,
      ]),
    ).toEqual([
      [1, "regular", "Avery Reed", "2026-08-29", "2026-09-16", 116250, "wage"],
      [
        1,
        "regular",
        "Sam Okafor",
        "2026-08-29",
        "2026-09-16",
        0, // wage gross: Gusto's Gross excludes owner draws
        "owner_draw",
      ],
      [2, "off_cycle", "Avery Reed", "2026-08-29", "2026-09-18", 20000, "wage"],
      [3, "regular", "Avery Reed", "2026-09-12", "2026-09-30", 100000, "wage"],
      [3, "regular", "Jordan Ellis", "2026-09-12", "2026-09-30", 66000, "wage"],
      [3, "regular", "Pat Quinlan", "2026-09-12", "2026-09-30", 0, "wage"],
    ]);
    const [a] = r.rows;
    // Regular appears on two jobs: earnings summed per pay type, the subtotal line not added
    expect(a?.earningsCents).toEqual({
      Regular: 105000,
      Overtime: 7500,
      "Overtime (adjustment 08/15/26 - 08/28/26)": 3750,
    });
    expect(a?.hours).toEqual({
      Regular: 40,
      Overtime: 2,
      "Overtime (adjustment 08/15/26 - 08/28/26)": 1,
    });
    // two different Regular rates: no single per-type rate; per-job rates live in jobLines
    expect(a?.ratesCents).toEqual({
      Overtime: 3750,
      "Overtime (adjustment 08/15/26 - 08/28/26)": 3750,
    });
    expect(a?.jobLines).toEqual([
      {
        job: "Landscaper",
        payType: "Regular",
        hours: 30,
        rateCents: 2500,
        amountCents: 75000,
      },
      {
        job: "Team Leader",
        payType: "Regular",
        hours: 10,
        rateCents: 3000,
        amountCents: 30000,
      },
      {
        job: null,
        payType: "Overtime",
        hours: 2,
        rateCents: 3750,
        amountCents: 7500,
      },
      {
        job: null,
        payType: "Overtime (adjustment 08/15/26 - 08/28/26)",
        hours: 1,
        rateCents: 3750,
        amountCents: 3750,
      },
    ]);
    expect(r.rows[1]).toMatchObject({
      employeeType: "Owner’s draw",
      earningsCents: { "Owner's Draw": 200000 },
      ownerDrawCents: 200000,
      grossCents: 0,
    });
    expect(r.rows[2]?.earningsCents).toEqual({
      Commission: 15000,
      "Additional Earnings": 5000,
    });
    expect(r.rows[4]?.jobLines).toEqual([
      {
        job: "Truck Hauling",
        payType: "Regular",
        hours: 30,
        rateCents: 2200,
        amountCents: 66000,
      },
    ]);
  });

  it("never reads Payment (the payment method), taxes, addresses, net pay, check amount, employer cost or donations", async () => {
    const json = JSON.stringify(await gj());
    for (const s of [
      "Direct Deposit",
      "Check",
      "901.11",
      "914.44",
      "1234.56",
      "2345.67",
      "777.77",
      "8888.88",
      "5.55",
      "Fake Street",
      "9999.99",
      "Federal",
    ]) {
      expect(json).not.toContain(s);
    }
    for (const n of [90111, 123456, 77777, 888888, 555])
      expect(json).not.toContain(String(n));
  });

  it("a Gross line that disagrees with the itemized lines is a problem", async () => {
    const r = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(
        ",Gross,,,1162.50",
        ",Gross,,,1100.00",
      ),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toMatch(
      /section 1 row \d+: Gross line 110000¢ vs itemized lines excluding owner draws 116250¢/,
    );
  });

  it("a Totals subtotal that disagrees with its pay type's itemized lines is a problem", async () => {
    const r = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(
        "Totals,Regular,40.000,,1050.00",
        "Totals,Regular,40.000,,1000.00",
      ),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toMatch(
      /section 1 row \d+: "Regular" Totals line 100000¢ vs its itemized lines 105000¢/,
    );
  });

  it("employee gross not adding up to the Payroll Totals is incomplete; the totals block is checked the same way", async () => {
    const r = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(
        "Totals,Gross,,,1162.50",
        "Totals,Gross,,,1200.00",
      ),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain(
      "section 1 Payroll Totals: Gross line 120000¢ vs itemized lines excluding owner draws 116250¢",
    );
    expect(r.syncRun.error).toContain(
      "section 1: employee gross sum 116250¢ vs Payroll Totals 120000¢",
    );
  });

  it("owner draws: a Totals-only line is itemized; the Gross line excludes it; draws reconcile on their own", async () => {
    const r = await gj();
    expect(r.syncRun.error).not.toMatch(/Owner's Draw" Totals line/);
    expect(r.syncRun.error).not.toMatch(/owner draws \d+¢ vs/);
    // a section whose employee draws and totals draws disagree
    const bad = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(
        "Totals,Owner's Draw,,,2000.00\n,,,,,,,,,,,,,,,,,,,,,,,,,Totals,Gross,,,0.00",
        "Totals,Owner's Draw,,,1500.00\n,,,,,,,,,,,,,,,,,,,,,,,,,Totals,Gross,,,0.00",
      ),
    );
    expect(bad.syncRun.error).toContain(
      "section 1: employee owner draws 150000¢ vs Payroll Totals owner draws 200000¢",
    );
    // wages and a draw on one employee: wage gross excludes the draw
    const mixed = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(
        ",,Gross,,,1162.50",
        ",,Owner's Draw,,,100.00\n,,,,,,,,,,,,,,,,,,,,,,,,,,Gross,,,1162.50",
      ),
    );
    expect(mixed.rows[0]).toMatchObject({
      grossCents: 116250,
      ownerDrawCents: 10000,
      payKind: "wage",
    });
  });

  it("a section without any totals amount is incomplete", async () => {
    const r = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(
        /\n[^\n]*,Totals,Gross,,,1660\.00/,
        "",
      ),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain("section 3: no Payroll Totals amount");
  });
});
