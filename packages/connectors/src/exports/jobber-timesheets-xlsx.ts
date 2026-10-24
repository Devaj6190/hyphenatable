// Jobber Timesheets report, "Receive Excel Copy" (.xlsx, decimal hours). Columns UNVERIFIED until the
// first real file: adjust TIMESHEET_COLUMNS only. Fallback for the API (A-03) and Company R's past cycles.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ExcelJS from "exceljs";
import { parseScaled } from "../money.ts";
import { zonedWallClock } from "../time.ts";
import {
  type Cell,
  cellDate,
  cellTime,
  type ExportResult,
  exportSyncRun,
  isBlank,
  isTotalRow,
  locateHeader,
  type Mapping,
  text,
} from "./common.ts";
import { plain } from "./xlsx.ts";

export const TIMESHEET_COLUMNS: Mapping<
  | "worker"
  | "date"
  | "start"
  | "end"
  | "hours"
  | "job"
  | "client"
  | "category"
  | "approved"
  | "note"
> = {
  worker: ["Employee", "User", "Team Member", "Name", "Staff"],
  date: ["Date", "Day", "Work Date"],
  start: ["Start", "Start Time", "Clock In", "Started"],
  end: ["End", "End Time", "Clock Out", "Ended"],
  hours: [
    "Hours",
    "Total Hours",
    "Duration",
    "Duration (hours)",
    "Time (hours)",
  ],
  job: ["Job", "Job #", "Job Number", "Visit", "Job / Visit", "Work Item"],
  client: ["Client", "Client Name", "Customer"],
  category: ["Type", "Category", "Activity", "Time Type"],
  approved: ["Approved", "Approval", "Status", "Approval Status"],
  note: ["Note", "Notes", "Comment", "Comments"],
};

/** One parsed report row. workerName / clientName are real for Company R: anonymize before use. */
export interface TimesheetRow {
  rowNumber: number;
  workerName: string;
  date: string;
  startAt: string | null;
  endAt: string | null;
  durationSec: number;
  jobText: string | null;
  clientName: string | null;
  category: string | null;
  approved: boolean | null;
  hasNote: boolean;
  /** CSV export: the name carried a " Team Leader" role suffix (stripped from workerName) */
  teamLeader?: boolean;
  /** free text from "Working on" that is neither a job nor a category (real text: anonymize drops it) */
  label?: string | null;
}

function approvedOf(c: Cell | undefined): boolean | null {
  if (typeof c === "boolean") return c;
  const s = (text(c) ?? "").toLowerCase();
  if (s === "") return null;
  if (["yes", "y", "true", "approved", "✓"].includes(s)) return true;
  if (["no", "n", "false", "pending", "not approved", "unapproved"].includes(s))
    return false;
  throw new Error("unreadable approval");
}

/** Hours (decimal) -> seconds exactly: hundred-thousandths of an hour x 0.036 s. */
const hoursToSec = (c: Cell): number | null => {
  const scaled = parseScaled(
    typeof c === "boolean" || c instanceof Date ? null : c,
    5,
  );
  return scaled === null ? null : Math.round((scaled * 36) / 1000);
};

export async function readJobberTimesheetsXlsx(
  input: string | Buffer | ArrayBuffer,
  opts: {
    companyId: string;
    timezone: string;
    fileName?: string;
    now?: () => Date;
  },
): Promise<ExportResult<TimesheetRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName =
    opts.fileName ??
    (typeof input === "string" ? basename(input) : "upload.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    (typeof input === "string" ? await readFile(input) : input) as ArrayBuffer,
  );

  let sheetName = "";
  let grid: Cell[][] = [];
  let header: ReturnType<
    typeof locateHeader<keyof typeof TIMESHEET_COLUMNS>
  > | null = null;
  for (const ws of wb.worksheets) {
    const g: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      g[n - 1] = Array.from({ length: row.cellCount }, (_, i) =>
        plain(row.getCell(i + 1).value),
      );
    });
    try {
      header = locateHeader(g, TIMESHEET_COLUMNS, [
        ["worker"],
        ["date"],
        ["hours", "start"],
      ]);
      grid = g;
      sheetName = ws.name;
      break;
    } catch {}
  }
  const method = `export jobber-timesheets-xlsx ${fileName}${sheetName ? ` sheet "${sheetName}"` : ""}`;
  if (!header) {
    return {
      rows: [],
      namesAnonymized: false,
      syncRun: exportSyncRun(
        opts.companyId,
        "timeSheetEntries",
        method,
        startedAt,
        now().toISOString(),
        0,
        0,
        ["no sheet with a timesheet header (worker, date, hours|start)"],
      ),
    };
  }

  const { headerRow, cols } = header;
  const at = (row: Cell[], k: keyof typeof TIMESHEET_COLUMNS) =>
    cols[k] === undefined ? null : (row[cols[k] as number] ?? null);
  const rows: TimesheetRow[] = [];
  const problems: string[] = [];
  let dataRows = 0;
  let totalHoursSec: number | null = null;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (isBlank(row)) continue;
    if (isTotalRow(row)) {
      totalHoursSec = hoursToSec(at(row, "hours"));
      continue;
    }
    dataRows++;
    const rowNumber = r + 1;
    let field = "worker";
    try {
      const workerName = text(at(row, "worker"));
      if (!workerName) throw new Error("empty");
      field = "date";
      const date = cellDate(at(row, "date"));
      field = "start/end";
      const startMin = cellTime(at(row, "start"));
      const endMin = cellTime(at(row, "end"));
      const startMs =
        startMin === null
          ? null
          : zonedWallClock(date, startMin, opts.timezone);
      const endMs =
        endMin === null ? null : zonedWallClock(date, endMin, opts.timezone);
      field = "hours";
      let durationSec = hoursToSec(at(row, "hours"));
      if (durationSec === null) {
        // no hours column value: only an end after the start gives a duration (never assume overnight)
        if (startMs === null || endMs === null || endMs < startMs)
          throw new Error("no hours and no start/end span");
        durationSec = (endMs - startMs) / 1000;
      }
      field = "approved";
      const approved = approvedOf(at(row, "approved"));
      rows.push({
        rowNumber,
        workerName,
        date,
        startAt: startMs === null ? null : new Date(startMs).toISOString(),
        endAt: endMs === null ? null : new Date(endMs).toISOString(),
        durationSec,
        jobText: text(at(row, "job")),
        clientName: text(at(row, "client")),
        category: text(at(row, "category")),
        approved,
        hasNote: text(at(row, "note")) !== null,
      });
    } catch {
      problems.push(`row ${rowNumber}: unreadable ${field}`);
    }
  }
  if (totalHoursSec !== null) {
    const sum = rows.reduce((s, x) => s + x.durationSec, 0);
    // the report's own total (rounded to the hour hundredth it prints) must agree with the rows
    if (Math.abs(sum - totalHoursSec) > 36)
      problems.push(
        `row hours sum ${(sum / 3600).toFixed(2)} h vs report total ${(totalHoursSec / 3600).toFixed(2)} h`,
      );
  }
  return {
    rows,
    namesAnonymized: false,
    syncRun: exportSyncRun(
      opts.companyId,
      "timeSheetEntries",
      method,
      startedAt,
      now().toISOString(),
      rows.length,
      dataRows,
      problems,
    ),
  };
}
