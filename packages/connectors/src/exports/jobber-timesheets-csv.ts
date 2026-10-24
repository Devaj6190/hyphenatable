// Jobber Timesheets report exported as CSV (the layout Company R's real export has; never read here in tests:
// replicas in __fixtures__ are synthetic). Layout:
//   Totals / (blank) / Total Hours,<h> / <name>,<h> per user / (blank) /
//   Name,Date,Start time,End time,Hours,Working on,Note,Client name / detail rows / Report totals:,,,,<h>,,,
// Names: trimmed, trailing " Team Leader" stripped (kept as a flag); name variants of one person are one
// worker in the output. Completeness per Jobber ACCOUNT (exact raw total-line name, role suffix removed,
// trailing spaces kept): every detail row parsed and matched to an account; each account total == its rows
// and the grand totals == all rows, within per-row rounding (Jobber rounds rows to 0.01 h, totals come from
// exact seconds: up to 0.005 h per row is a note, more is a problem). Errors carry row numbers and user
// ordinals, never names.

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

  // ---- summary block above the header: Total Hours and one total per Jobber account ----
  // Keyed by the RAW name (role suffix removed, trailing spaces kept): "X" and "X " can be two Jobber
  // accounts of one person, each with its own total line.
  let totalHours: number | null = null;
  const accounts: {
    key: string;
    norm: string;
    hundredths: number;
    ordinal: number;
  }[] = [];
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
        const key = accountKey(String(row[0] ?? ""));
        const prev = accounts.find((a) => a.key === key);
        if (prev) prev.hundredths += h;
        else
          accounts.push({
            key,
            norm: normalizeWorkerName(key).name,
            hundredths: h,
            ordinal: accounts.length + 1,
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
  const detail: { key: string; norm: string; h: number }[] = [];
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
      const raw = at(row, "name");
      const rawName = text(raw);
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
      detail.push({ key: accountKey(String(raw ?? "")), norm: name, h });
      detailSum += h;
      rows.push({
        rowNumber: r + 1,
        // variants of one person ("X", "X ", "X Team Leader") are ONE worker in the output
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

  // ---- reconciliation ----
  // Jobber rounds each detail row to 0.01 h while totals come from exact seconds: a total may differ from
  // its rows by up to 0.005 h per row. Within that, the drift is a note; beyond it, a problem.
  const notes: string[] = [];
  const perAccount = new Map<string, { h: number; rows: number }>();
  let unmatched = 0;
  const notInTotals = new Map<string, { rows: number; h: number }>();
  const exactKeys = new Set(
    detail.map((d) => d.key).filter((k) => accounts.some((a) => a.key === k)),
  );
  for (const d of detail) {
    // exact raw spelling first; else the one account of that person whose spelling no detail row uses
    let acct = accounts.find((a) => a.key === d.key);
    if (
      !acct &&
      [...exactKeys].some((k) => normalizeWorkerName(k).name === d.norm)
    ) {
      // live finding: a second Jobber account of a person whose other spelling has the only total line.
      // That total covers its exact spelling only; these rows are reported, not compared (still merged in output)
      const v = notInTotals.get(d.key) ?? { rows: 0, h: 0 };
      notInTotals.set(d.key, { rows: v.rows + 1, h: v.h + d.h });
      continue;
    }
    if (!acct) {
      const same = accounts.filter((a) => a.norm === d.norm);
      acct =
        same.length === 1
          ? same[0]
          : same.filter((a) => !exactKeys.has(a.key)).length === 1
            ? same.find((a) => !exactKeys.has(a.key))
            : undefined;
    }
    if (!acct) {
      unmatched++;
      continue;
    }
    const p = perAccount.get(acct.key) ?? { h: 0, rows: 0 };
    perAccount.set(acct.key, { h: p.h + d.h, rows: p.rows + 1 });
  }
  let drifting = 0;
  for (const a of accounts) {
    const p = perAccount.get(a.key) ?? { h: 0, rows: 0 };
    const diff = Math.abs(p.h - a.hundredths);
    // tolerance in hundredths: 0.5 per row, i.e. |diff| * 2 <= rows
    if (diff * 2 > p.rows)
      problems.push(
        `user #${a.ordinal}: detail ${fmt(p.h)} h vs total row ${fmt(a.hundredths)} h`,
      );
    else if (diff) drifting++;
  }
  if (accounts.length && unmatched)
    problems.push(`${unmatched} detail row(s) without a matching total row`);
  const people = new Set(accounts.map((a) => a.norm));
  const merged = [...people].filter(
    (n) => accounts.filter((a) => a.norm === n).length > 1,
  ).length;
  if (merged)
    notes.push(
      `${merged} worker(s) have 2+ Jobber accounts (name variants); merged into one worker in the output (mergedAccounts ${merged})`,
    );
  const grand = (label: string, total: number | null) => {
    if (total === null) return problems.push(`no ${label} line`);
    const diff = Math.abs(detailSum - total);
    if (diff * 2 > dataRows)
      problems.push(
        `detail sum ${fmt(detailSum)} h vs ${label} ${fmt(total)} h`,
      );
    else if (diff)
      notes.push(
        `${label} ${fmt(total)} h vs detail sum ${fmt(detailSum)} h: per-row rounding drift`,
      );
    return 0;
  };
  grand("Total Hours", totalHours);
  grand("Report totals", reportTotal);
  if (drifting)
    notes.push(
      `${drifting} user total(s) differ from their rows by per-row rounding only (within 0.005 h per row)`,
    );
  if (notInTotals.size) {
    const n = [...notInTotals.values()].reduce(
      (s, v) => ({ rows: s.rows + v.rows, h: s.h + v.h }),
      { rows: 0, h: 0 },
    );
    notes.push(
      `account not in totals block: ${notInTotals.size} name variant(s) of listed workers, ${n.rows} row(s), ${fmt(n.h)} h (merged into their worker in the output)`,
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
      notes,
    ),
  };
}

/** The account key: the raw name with a trailing " Team Leader" removed, NOT otherwise trimmed. */
export function accountKey(raw: string): string {
  return raw.replace(/\s+team\s+leader(\s*)$/i, "$1");
}
