import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTimesheetsXlsx, SAMPLE_ROWS } from "../__fixtures__/make-samples.ts";
import { cellDate, cellTime, isTotalRow, parseCsv } from "../common.ts";
import { readGustoPayrollJournalCsv } from "../gusto-payroll-journal-csv.ts";
import { readJobberTimesheetsXlsx } from "../jobber-timesheets-xlsx.ts";

const fx = (name: string) => fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const opts = { companyId: "r", timezone: "America/Los_Angeles", now: () => new Date("2026-10-24T12:00:00Z") };

describe("common", () => {
  it("parses RFC 4180 CSV", () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n1,,3\n')).toEqual([["a", "b,c", 'say "hi"'], ["1", "", "3"]]);
    expect(() => parseCsv('a,"open')).toThrow();
  });
  it("reads dates and times in the formats exports use", () => {
    expect(["2026-10-12", "10/12/2026", "Oct 12, 2026", "Mon, Oct 12, 2026"].map(cellDate)).toEqual(Array(4).fill("2026-10-12"));
    expect(cellDate(new Date(Date.UTC(2026, 9, 12)))).toBe("2026-10-12");
    expect(cellDate(46307)).toBe("2026-10-12"); // Excel serial
    expect([cellTime("8:00 AM"), cellTime("12:15 am"), cellTime("4:30 PM"), cellTime("07:30"), cellTime(0.5), cellTime(null)]).toEqual([480, 15, 990, 450, 720, null]);
    expect(() => cellDate("someday")).toThrow();
    expect(() => cellTime("25:00")).toThrow();
  });
  it("a total row is one whose first cell says Total", () => {
    expect(isTotalRow(["Total", null, 21.42])).toBe(true);
    expect(isTotalRow(["2026-10-13", "Avery Reed", "Job #102 - Total care"])).toBe(false);
  });
});

describe("readJobberTimesheetsXlsx", () => {
  it("parses the committed sample: header found under title rows, every row, total checked", async () => {
    const r = await readJobberTimesheetsXlsx(fx("jobber-timesheets.sample.xlsx"), opts);
    expect(r.namesAnonymized).toBe(false);
    expect(r.syncRun).toMatchObject({ source: "export", object: "timeSheetEntries", pulled: 4, expected: 4, complete: true, error: null });
    expect(r.syncRun.method).toBe('export jobber-timesheets-xlsx jobber-timesheets.sample.xlsx sheet "Timesheets"');
    const [a, b, c, d] = r.rows;
    expect(a).toEqual({
      rowNumber: 5, workerName: "Avery Reed", date: "2026-10-12", startAt: "2026-10-12T15:00:00.000Z", endAt: "2026-10-12T23:30:00.000Z",
      durationSec: 30600, jobText: "Job #101 - Spring cleanup", clientName: "Brookside Dental", category: "General", approved: true, hasNote: false,
    });
    expect(b).toMatchObject({ durationSec: 29700, hasNote: true, jobText: "Job #102 - Total care" });
    // no hours value: duration from start/end; no job; not approved
    expect(c).toMatchObject({ date: "2026-10-14", durationSec: 5400, jobText: null, approved: false });
    // decimal hours exactly: 3.17 h = 11412 s; no start/end
    expect(d).toMatchObject({ date: "2026-10-15", durationSec: 11412, startAt: null, approved: false });
    expect(JSON.stringify(r)).not.toContain("fake note");
  });

  it("an unreadable row makes the run incomplete, naming the row and column only", async () => {
    const rows = [...SAMPLE_ROWS, ["13/45/2026", "Secret Name", null, null, null, null, null, 2, "Yes", null]];
    const r = await readJobberTimesheetsXlsx(await buildTimesheetsXlsx(rows, null), opts);
    expect(r.syncRun).toMatchObject({ pulled: 4, expected: 5, complete: false, error: "row 9: unreadable date" });
    expect(r.syncRun.error).not.toContain("Secret");
  });

  it("rows that disagree with the report total make the run incomplete", async () => {
    const r = await readJobberTimesheetsXlsx(await buildTimesheetsXlsx(SAMPLE_ROWS, 25), opts);
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toBe("row hours sum 21.42 h vs report total 25.00 h");
  });

  it("never assumes an overnight shift", async () => {
    const r = await readJobberTimesheetsXlsx(await buildTimesheetsXlsx([["2026-10-16", "Avery Reed", null, null, null, "10:00 PM", "2:00 AM", null, null, null]], null), opts);
    expect(r.syncRun).toMatchObject({ pulled: 0, expected: 1, complete: false, error: "row 5: unreadable hours" });
  });
});

describe("readGustoPayrollJournalCsv", () => {
  it("parses per-employee gross, earnings and hours in cents; ignores tax columns; checks the total", async () => {
    const r = await readGustoPayrollJournalCsv(fx("gusto-payroll-journal.sample.csv"), { companyId: "r", now: opts.now });
    expect(r.syncRun).toMatchObject({ source: "export", object: "payrollJournal", pulled: 3, expected: 3, complete: true, error: null });
    expect(r.rows[0]).toEqual({
      rowNumber: 4, employeeName: "Riley Park", periodStart: "2026-09-27", periodEnd: "2026-10-10", checkDate: "2026-10-15",
      grossCents: 234500, netCents: 189042, earningsCents: { "Regular Hours": 224000, Overtime: 10500 }, hours: { "Regular Hours": 80, Overtime: 2.5 },
    });
    expect(r.rows[1]).toMatchObject({ grossCents: 250000, earningsCents: { "Regular Hours": 240000, Bonus: 10000 }, hours: {} });
    expect(r.rows[2]).toMatchObject({ employeeName: "Sam O'Neil, Jr.", grossCents: 31850, hours: { "Regular Hours": 12.25 } });
    expect(JSON.stringify(r.rows)).not.toContain("454.58"); // employee taxes column is never read
  });

  it("a row without gross is unreadable (never 0) and the total mismatch is reported", async () => {
    const csv = "Employee,Gross Earnings,Net Pay\nRiley Park,100.00,80.00\nCasey Moore,,50.00\nTotal,150.00,130.00\n";
    const r = await readGustoPayrollJournalCsv({ text: csv, fileName: "t.csv" }, { companyId: "r" });
    expect(r.syncRun).toMatchObject({ pulled: 1, expected: 2, complete: false });
    expect(r.syncRun.error).toBe("row 3: unreadable gross; gross sum 10000¢ vs report total 15000¢");
  });

  it("no recognisable header -> incomplete run, no rows", async () => {
    const r = await readGustoPayrollJournalCsv({ text: "a,b\n1,2\n", fileName: "x.csv" }, { companyId: "r" });
    expect(r.rows).toEqual([]);
    expect(r.syncRun.complete).toBe(false);
  });
});
