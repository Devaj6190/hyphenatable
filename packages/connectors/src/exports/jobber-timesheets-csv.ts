// Jobber Timesheets report exported as CSV (the layout Company R's real export has; never read here in tests:
// replicas in __fixtures__ are synthetic). Layout:
//   Totals / (blank) / Total Hours,<h> / <name>,<h> per user / (blank) /
//   Name,Date,Start time,End time,Hours,Working on,Note,Client name / detail rows / Report totals:,,,,<h>,,,
// Names: trimmed, trailing " Team Leader" stripped (kept as a flag). Hours: decimal, 2 dp, compared exactly
// in hundredths. Completeness: every detail row parsed; per-user detail sum == that user's total row;
// detail sum == Total Hours == Report totals. Errors carry row numbers and user ordinals, never names.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseScaled } from "../money.ts";
import { zonedWallClock } from "../time.ts";
import {
  type Cell,
  cellDate,
  cellTime,
  type ExportResult,
  exportSyncRun,
  isBlank,
  locateHeader,
  type Mapping,
  parseCsv,
  text,
} from "./common.ts";
import type { TimesheetRow } from "./jobber-timesheets-xlsx.ts";

type Key =
  | "name"
  | "date"
  | "start"
  | "end"
  | "hours"
  | "workingOn"
  | "note"
  | "client";
export const TIMESHEET_CSV_COLUMNS: Mapping<Key> = {
  name: ["Name"],
  date: ["Date"],
  start: ["Start time", "Start"],
  end: ["End time", "End"],
  hours: ["Hours"],
  workingOn: ["Working on"],
  note: ["Note", "Notes"],
  client: ["Client name", "Client"],
};
/** "Working on" values that are Jobber time categories, not jobs or free text */
const CATEGORIES: Record<string, string> = {
  general: "GENERAL",
  driving: "DRIVING",
  office: "OFFICE",
  break: "BREAK",
  supplies: "SUPPLIES",
};

/** Trim, strip a trailing " Team Leader" role suffix (any case), keep the flag. */
export function normalizeWorkerName(raw: string): {
  name: string;
  teamLeader: boolean;
} {
  const t = raw.trim().replace(/\s+/g, " ");
  const m = /^(.*?)\s+team\s+leader$/i.exec(t);
  return m?.[1]
    ? { name: m[1].trim(), teamLeader: true }
    : { name: t, teamLeader: false };
}

/** "Job #518 - <client>" -> "Job #518" (the client part is dropped); General/Driving -> category; else label. */
export function classifyWorkingOn(v: string | null): {
  jobText: string | null;
  category: string | null;
  label: string | null;
} {
  if (!v) return { jobText: null, category: null, label: null };
  const job = /^\s*job\s*#\s*(\d+)\b/i.exec(v);
  if (job) return { jobText: `Job #${job[1]}`, category: null, label: null };
  const cat = CATEGORIES[v.trim().toLowerCase()];
  if (cat) return { jobText: null, category: cat, label: null };
  return { jobText: null, category: null, label: v.trim() };
}

const hundredths = (c: Cell | undefined): number | null =>
  parseScaled(typeof c === "number" || typeof c === "string" ? c : null, 2);
const fmt = (h: number) => (h / 100).toFixed(2);

export async function readJobberTimesheetsCsv(
  input: string | { text: string; fileName: string },
  opts: { companyId: string; timezone: string; now?: () => Date },
): Promise<ExportResult<TimesheetRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const grid: Cell[][] = parseCsv(
    typeof input === "string" ? await readFile(input, "utf8") : input.text,
  );
  const method = `export jobber-timesheets-csv ${fileName}`;
  const problems: string[] = [];

  let header: ReturnType<typeof locateHeader<Key>>;
  try {
    header = locateHeader<Key>(
      grid,
      TIMESHEET_CSV_COLUMNS,
      [["name"], ["date"], ["hours"]],
      1000,
    );
  } catch (e) {
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
        [(e as Error).message],
      ),
    };
  }

  // ---- summary block above the header: Total Hours and one total per user ----
  let totalHours: number | null = null;
  const userTotals = new Map<string, { hundredths: number; ordinal: number }>();
  for (let r = 0; r < header.headerRow; r++) {
    const row = grid[r] ?? [];
    if (isBlank(row)) continue;
    const first = text(row[0]);
    if (!first || /^totals?$/i.test(first)) continue;
    try {
      const h = hundredths(row[1]);
      if (h === null) continue;
      if (/^total hours$/i.test(first)) totalHours = h;
      else {
        const { name } = normalizeWorkerName(first);
        const prev = userTotals.get(name);
        userTotals.set(name, {
          hundredths: (prev?.hundredths ?? 0) + h,
          ordinal: prev?.ordinal ?? userTotals.size + 1,
        });
      }
    } catch {
      problems.push(`summary row ${r + 1}: unreadable hours`);
    }
  }

  // ---- detail rows ----
  const { headerRow, cols } = header;
  const at = (row: Cell[], k: Key) =>
    cols[k] === undefined ? null : (row[cols[k] as number] ?? null);
  const rows: TimesheetRow[] = [];
  const perUser = new Map<string, number>();
  let dataRows = 0;
  let detailSum = 0;
  let reportTotal: number | null = null;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (isBlank(row)) continue;
    const first = text(row[0]);
    if (first && /^report totals?:?$/i.test(first)) {
      try {
        reportTotal = hundredths(at(row, "hours"));
      } catch {
        problems.push(`row ${r + 1}: unreadable report total`);
      }
      continue;
    }
    dataRows++;
    let field = "name";
    try {
      const rawName = text(at(row, "name"));
      if (!rawName) throw new Error("empty");
      const { name, teamLeader } = normalizeWorkerName(rawName);
      field = "date";
      const date = cellDate(at(row, "date"));
      field = "start/end";
      const startMin = cellTime(at(row, "start"));
      const endMin = cellTime(at(row, "end"));
      field = "hours";
      const h = hundredths(at(row, "hours"));
      if (h === null) throw new Error("empty");
      const startMs =
        startMin === null
          ? null
          : zonedWallClock(date, startMin, opts.timezone);
      const endMs =
        endMin === null ? null : zonedWallClock(date, endMin, opts.timezone);
      const work = classifyWorkingOn(text(at(row, "workingOn")));
      perUser.set(name, (perUser.get(name) ?? 0) + h);
      detailSum += h;
      rows.push({
        rowNumber: r + 1,
        workerName: name,
        date,
        startAt: startMs === null ? null : new Date(startMs).toISOString(),
        endAt: endMs === null ? null : new Date(endMs).toISOString(),
        durationSec: h * 36, // hundredths of an hour x 36 s
        jobText: work.jobText,
        category: work.category,
        label: work.label,
        clientName: text(at(row, "client")),
        approved: null, // the report has no approval column
        hasNote: text(at(row, "note")) !== null,
        teamLeader,
      });
    } catch {
      problems.push(`row ${r + 1}: unreadable ${field}`);
    }
  }

  // ---- reconciliation (hundredths, exact) ----
  for (const [name, t] of userTotals) {
    const d = perUser.get(name) ?? 0;
    if (d !== t.hundredths)
      problems.push(
        `user #${t.ordinal}: detail ${fmt(d)} h vs total row ${fmt(t.hundredths)} h`,
      );
  }
  const strangers = [...perUser.keys()].filter(
    (n) => !userTotals.has(n),
  ).length;
  if (userTotals.size && strangers)
    problems.push(`${strangers} detail user(s) without a total row`);
  if (totalHours !== null && detailSum !== totalHours)
    problems.push(
      `detail sum ${fmt(detailSum)} h vs Total Hours ${fmt(totalHours)} h`,
    );
  if (reportTotal !== null && detailSum !== reportTotal)
    problems.push(
      `detail sum ${fmt(detailSum)} h vs Report totals ${fmt(reportTotal)} h`,
    );
  if (totalHours === null) problems.push("no Total Hours line");
  if (reportTotal === null) problems.push("no Report totals line");

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
