// Shared pieces for the export readers: header mapping, CSV parsing, cell coercion, the export SyncRun.
// Column names in real exports are UNVERIFIED until a real file arrives: each reader keeps its aliases in
// one mapping table. Only mapped columns are read; everything else in a file is ignored.
// Rows hold real names (Company R): results are marked namesAnonymized: false and must pass through
// anonymize.ts before leaving the process. Error messages carry row numbers and column keys, never cell text.

import type { SyncRun } from "../types.ts";

export type Cell = string | number | boolean | Date | null;
export type Mapping<K extends string> = Record<K, string[]>;

export interface ExportResult<R> {
  rows: R[];
  syncRun: SyncRun;
  /** Always false from a reader. ingest-r refuses results that were not anonymized. */
  namesAnonymized: false;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Find the header row (first 25 rows) containing every required key; return column index per key. */
export function locateHeader<K extends string>(
  rows: Cell[][],
  mapping: Mapping<K>,
  required: K[][],
  /** rows scanned for the header (title blocks; the Jobber CSV has one line per user above it) */
  maxRows = 25,
): { headerRow: number; cols: Partial<Record<K, number>> } {
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const cells = (rows[r] ?? []).map((c) => norm(String(c ?? "")));
    const cols: Partial<Record<K, number>> = {};
    for (const key of Object.keys(mapping) as K[]) {
      const idx = cells.findIndex(
        (c) => c !== "" && mapping[key].some((alias) => norm(alias) === c),
      );
      if (idx >= 0) cols[key] = idx;
    }
    // each inner array is "any of these"; all groups must be satisfied
    if (required.every((group) => group.some((k) => cols[k] !== undefined)))
      return { headerRow: r, cols };
  }
  throw new Error(
    `no header row with columns ${required.map((g) => g.join("|")).join(", ")}`,
  );
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  const endRow = () => {
    row.push(field);
    out.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length) endRow();
  return out;
}

export const isBlank = (row: Cell[] | undefined) =>
  !row || row.every((c) => c === null || String(c).trim() === "");
/** A report total row: its first non-empty cell is "Total(s)" / "Grand total". A job named "Total care" in a later column is not one. */
export const isTotalRow = (row: Cell[]) => {
  const first = row.find((c) => text(c) !== null);
  return (
    typeof first === "string" && /^\s*(grand\s+)?totals?:?\s*$/i.test(first)
  );
};
export const text = (c: Cell | undefined): string | null =>
  c === null || c === undefined || String(c).trim() === ""
    ? null
    : String(c).trim();

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const pad = (n: number) => String(n).padStart(2, "0");

/** A date cell -> YYYY-MM-DD. Excel dates arrive as Date at UTC wall clock, or as serial numbers. */
export function cellDate(c: Cell | undefined): string {
  const d = rawCellDate(c);
  // reject impossible dates such as 13/45/2026 instead of letting them roll over
  if (new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d)
    throw new Error("unreadable date");
  return d;
}

function rawCellDate(c: Cell | undefined): string {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (typeof c === "number")
    return new Date(Math.round((c - 25569) * 86400000))
      .toISOString()
      .slice(0, 10);
  const s = text(c) ?? "";
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s); // US exports: M/D/YYYY
  if (m)
    return `${m[3]?.length === 2 ? `20${m[3]}` : m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  m = /^(?:\w+,\s*)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s); // "Oct 12, 2026", "Mon, Oct 12, 2026"
  const mon = m ? MONTHS.indexOf((m[1] ?? "").toLowerCase()) : -1;
  if (m && mon >= 0) return `${m[3]}-${pad(mon + 1)}-${pad(Number(m[2]))}`;
  throw new Error("unreadable date");
}

/** A time cell -> minutes after midnight, or null when empty. */
export function cellTime(c: Cell | undefined): number | null {
  if (
    c === null ||
    c === undefined ||
    (typeof c === "string" && c.trim() === "")
  )
    return null;
  if (c instanceof Date) return c.getUTCHours() * 60 + c.getUTCMinutes();
  if (typeof c === "number" && c >= 0 && c < 1) return Math.round(c * 1440);
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(
    String(c).trim(),
  );
  if (!m) throw new Error("unreadable time");
  let h = Number(m[1]);
  const ap = m[3]?.[0]?.toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) throw new Error("unreadable time");
  return h * 60 + Number(m[2]);
}

export function exportSyncRun(
  companyId: string,
  object: string,
  method: string,
  startedAt: string,
  finishedAt: string,
  pulled: number,
  expected: number,
  problems: string[],
  /** observations that do not make the run incomplete (printed after the problems, prefixed "note:") */
  notes: string[] = [],
): SyncRun {
  return {
    id: `${companyId}:export:${object}:${startedAt}`,
    companyId,
    cycleId: null,
    source: "export",
    object,
    startedAt,
    finishedAt,
    pulled,
    expected,
    complete: problems.length === 0,
    method,
    error:
      problems.length || notes.length
        ? [...problems, ...notes.map((n) => `note: ${n}`)].join("; ")
        : null,
  };
}
