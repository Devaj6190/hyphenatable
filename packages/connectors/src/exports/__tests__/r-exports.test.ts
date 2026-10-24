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
  it("normalizes names and the Team Leader suffix; classifies Working on", () => {
    expect(normalizeWorkerName("Avery Reed Team Leader ")).toEqual({
      name: "Avery Reed",
      teamLeader: true,
    });
    expect(normalizeWorkerName("Jordan Ellis ")).toEqual({
      name: "Jordan Ellis",
      teamLeader: false,
    });
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

  it("parses every detail row and reconciles per-user, Total Hours and Report totals", async () => {
    const r = await ts();
    expect(r.namesAnonymized).toBe(false);
    expect(r.syncRun).toMatchObject({
      object: "timeSheetEntries",
      pulled: 6,
      expected: 6,
      complete: true,
      error: null,
    });
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
      teamLeader: false,
      category: "GENERAL",
      jobText: null,
    });
    expect(j2).toMatchObject({
      workerName: "Jordan Ellis",
      label: "Maple Grove HOA - Off-Site",
      hasNote: true,
    });
    expect(s0).toMatchObject({
      durationSec: 0,
      label: "Request for hedge quote",
    });
    // the job's client name never travels in jobText
    expect(r.rows.map((x) => x.jobText).filter(Boolean)).toEqual([
      "Job #518",
      "Job #521",
    ]);
  });

  it("a user total that disagrees makes the run incomplete, naming the user by ordinal only", async () => {
    const r = await ts(
      JOBBER_TIMESHEETS_CSV.replace(
        "Jordan Ellis ,9.25",
        "Jordan Ellis ,9.50",
      ).replace("Total Hours,25.25", "Total Hours,25.50"),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain(
      "user #2: detail 9.25 h vs total row 9.50 h",
    );
    expect(r.syncRun.error).toContain(
      "detail sum 25.25 h vs Total Hours 25.50 h",
    );
    expect(r.syncRun.error).not.toMatch(/Jordan|Ellis/);
  });

  it("an unreadable row is counted against completeness", async () => {
    const r = await ts(
      JOBBER_TIMESHEETS_CSV.replace('"Sep 3, 2026"', '"Sepember 3"'),
    );
    expect(r.syncRun).toMatchObject({
      pulled: 5,
      expected: 6,
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

  it("reads employees per section with pay-type lines and Gross; totals reconcile", async () => {
    const r = await gj();
    expect(r.syncRun).toMatchObject({
      object: "payrollJournal",
      pulled: 5,
      expected: 5,
      complete: true,
      error: null,
    });
    expect(
      r.rows.map((x) => [
        x.section,
        x.sectionKind,
        x.employeeName,
        x.periodStart,
        x.checkDate,
        x.grossCents,
      ]),
    ).toEqual([
      [1, "regular", "Avery Reed", "2026-08-29", "2026-09-16", 111250],
      [1, "regular", "Sam Okafor", "2026-08-29", "2026-09-16", 200000],
      [2, "off_cycle", "Avery Reed", "2026-08-29", "2026-09-18", 20000],
      [3, "regular", "Avery Reed", "2026-09-12", "2026-09-30", 100000],
      [3, "regular", "Jordan Ellis", "2026-09-12", "2026-09-30", 66000],
    ]);
    expect(r.rows[0]).toMatchObject({
      employeeType: "Paid by the hour",
      netCents: null,
      earningsCents: {
        Regular: 100000,
        Overtime: 7500,
        "Overtime (adjustment 08/15/26 - 08/28/26)": 3750,
      },
      hours: {
        Regular: 40,
        Overtime: 2,
        "Overtime (adjustment 08/15/26 - 08/28/26)": 1,
      },
      ratesCents: { Regular: 2500, Overtime: 3750 },
    });
    expect(r.rows[1]).toMatchObject({
      employeeType: "Owner’s draw",
      earningsCents: { "Owner's Draw": 200000 },
    });
    expect(r.rows[2]?.earningsCents).toEqual({
      Commission: 15000,
      "Additional Earnings": 5000,
    });
  });

  it("never reads taxes, addresses, net pay, check amount, employer cost or donations", async () => {
    const json = JSON.stringify(await gj());
    for (const s of [
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
    ])
      expect(json).not.toContain(s);
    for (const n of [90111, 123456, 77777, 888888, 555])
      expect(json).not.toContain(String(n));
  });

  it("a section whose Gross lines do not add up to Payroll Totals is incomplete", async () => {
    const r = await gj(
      GUSTO_JOURNAL_SECTIONED_CSV.replace(',"1,112.50"\n', ',"1,100.00"\n'),
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain(
      "section 1: employee Gross sum 310000¢ vs Payroll Totals 311250¢",
    );
  });
});
