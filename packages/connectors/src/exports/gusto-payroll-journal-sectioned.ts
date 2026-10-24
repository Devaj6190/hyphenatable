// Gusto "Payroll Journal Report" CSV, sectioned layout (Company R's real export; tested only on synthetic
// replicas). Preamble lines, then per payroll:
//   <title>  /  Pay period, MM/DD/YYYY - MM/DD/YYYY  /  Pay day, MM/DD/YYYY  /  30-column header  /
//   employee rows (first row: Last, First, ..., Employee Type; continuation rows: blank names, one Pay Type each,
//   sometimes a "Gross" line)  /  Payroll Totals ...
// Read ONLY: names, employee type, pay type, hours, rate, amount; period, pay day, section kind. Payment (the
// payment METHOD), tax columns, Work Address, Net Pay, Check Amount, Employer Cost and Donations are never read
// (only mapped columns are indexed).
// Gross per employee = the sum of their pay-type Amounts, excluding a "Gross" line; a Gross line, when present,
// must equal that sum. An employee row with no pay lines at all is gross 0 from the source (a note). Section
// total = the Payroll Totals row's Amount (or its Gross line), compared to the sum of employee gross.
// "Owner's Draw" pay lines / "Owner’s draw" employees are owner draws (payKind owner_draw).

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseScaled, toCents } from "../money.ts";
import {
  type Cell,
  cellDate,
  type ExportResult,
  exportSyncRun,
  isBlank,
  locateHeader,
  type Mapping,
  parseCsv,
  text,
} from "./common.ts";
import type { PayrollJournalRow } from "./gusto-payroll-journal-csv.ts";

type Key =
  | "last"
  | "first"
  | "employeeType"
  | "payType"
  | "hours"
  | "rate"
  | "amount";
export const SECTIONED_COLUMNS: Mapping<Key> = {
  last: ["Last Name"],
  first: ["First Name"],
  employeeType: ["Employee Type"],
  payType: ["Pay Type"],
  hours: ["Hours"],
  rate: ["Rate"],
  amount: ["Amount"],
};

export type SectionKind = "regular" | "off_cycle" | "other";
export const sectionKind = (title: string): SectionKind =>
  /^regular\b/i.test(title.trim())
    ? "regular"
    : /off-/i.test(title)
      ? "off_cycle"
      : "other";

const US_DATE = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
const isOwnerDraw = (s: string | null) =>
  !!s && /owner.?s\s*draw/i.test(s.replace(/[’']/g, "'"));
const dateAfter = (row: Cell[], i: number): string | undefined =>
  row
    .slice(i)
    .map((c) => text(c) ?? "")
    .join(" ")
    .match(US_DATE)?.[0];

export async function readGustoPayrollJournalSectionedCsv(
  input: string | { text: string; fileName: string },
  opts: { companyId: string; now?: () => Date },
): Promise<ExportResult<PayrollJournalRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const grid: Cell[][] = parseCsv(
    typeof input === "string" ? await readFile(input, "utf8") : input.text,
  );
  const method = `export gusto-payroll-journal-sectioned ${fileName}`;
  const problems: string[] = [];
  const rows: PayrollJournalRow[] = [];
  let expected = 0;
  let sections = 0;
  let zeroGross = 0;

  const lastTitle = (before: number): string => {
    for (let i = before - 1; i >= 0; i--) {
      const row = grid[i] ?? [];
      if (!isBlank(row)) return text(row[0]) ?? "";
    }
    return "";
  };

  let r = 0;
  while (r < grid.length) {
    const row = grid[r] ?? [];
    if (!/^pay period$/i.test(text(row[0]) ?? "")) {
      r++;
      continue;
    }
    // ---- a section ----
    sections++;
    const section = sections;
    const kind = sectionKind(lastTitle(r));
    const where = `section ${section}`;
    const period =
      row
        .slice(1)
        .map((c) => text(c) ?? "")
        .join(" ")
        .match(US_DATE) ?? [];
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    try {
      periodStart = period[0] ? cellDate(period[0]) : null;
      periodEnd = period[1] ? cellDate(period[1]) : null;
    } catch {
      problems.push(`${where}: unreadable pay period`);
    }
    r++;
    let payDay: string | null = null;
    while (r < grid.length && isBlank(grid[r])) r++;
    if (/^pay day$/i.test(text(grid[r]?.[0]) ?? "")) {
      const d = dateAfter(grid[r] ?? [], 1);
      try {
        payDay = d ? cellDate(d) : null;
      } catch {
        problems.push(`${where}: unreadable pay day`);
      }
      r++;
    }
    let header: ReturnType<typeof locateHeader<Key>>;
    try {
      header = locateHeader<Key>(grid.slice(r, r + 5), SECTIONED_COLUMNS, [
        ["last"],
        ["first"],
        ["payType"],
        ["amount"],
      ]);
    } catch {
      problems.push(`${where}: no employee header`);
      continue;
    }
    const cols = header.cols;
    const at = (x: Cell[], k: Key) =>
      cols[k] === undefined ? null : (x[cols[k] as number] ?? null);
    r += header.headerRow + 1;

    let current: PayrollJournalRow | null = null;
    let lineSum = 0;
    let lines = 0;
    let grossLine: number | null = null;
    let sectionGross = 0;
    let totals: number | null = null;
    // the totals block may itemize by pay type instead of giving one Gross amount
    let totalsItemized: number | null = null;
    const addItem = (a: number | null) => {
      if (a !== null) totalsItemized = (totalsItemized ?? 0) + a;
    };
    let inTotals = false;
    const finish = () => {
      if (current) {
        if (grossLine !== null && lines > 0 && grossLine !== lineSum) {
          problems.push(
            `${where} row ${current.rowNumber}: Gross line ${grossLine}¢ vs pay lines ${lineSum}¢`,
          );
        }
        // only a Gross line (no itemized lines): that is the gross
        current.grossCents = lines > 0 ? lineSum : (grossLine ?? 0);
        if (lines === 0 && grossLine === null) zeroGross++;
        sectionGross += current.grossCents;
        rows.push(current);
      }
      current = null;
      lineSum = 0;
      lines = 0;
      grossLine = null;
    };
    for (; r < grid.length; r++) {
      const x = grid[r] ?? [];
      if (isBlank(x)) continue;
      const first0 = text(x[0]);
      if (first0 && /^pay period$/i.test(first0)) break; // next section without a totals row
      const last = text(at(x, "last"));
      const firstName = text(at(x, "first"));
      const type = text(at(x, "payType"));
      if (last && /^payroll totals?$/i.test(last)) {
        finish();
        inTotals = true;
        try {
          // the totals row's own Amount (with or without a Gross pay type)
          const amount = toCents(text(at(x, "amount")));
          if (amount !== null && (!type || /^gross$/i.test(type)))
            totals = amount;
          else addItem(amount);
        } catch {
          problems.push(`${where}: unreadable Payroll Totals`);
        }
        continue;
      }
      if (inTotals) {
        if (last || firstName || (!type && first0)) break; // something else began: the section is over
        try {
          if (type && /^gross$/i.test(type))
            totals = toCents(text(at(x, "amount")));
          else if (type) addItem(toCents(text(at(x, "amount"))));
        } catch {
          problems.push(`${where}: unreadable Payroll Totals gross`);
        }
        continue;
      }
      if (last || firstName) {
        finish();
        expected++;
        const employeeType = text(at(x, "employeeType"));
        current = {
          rowNumber: r + 1,
          employeeName: [firstName, last].filter(Boolean).join(" "),
          periodStart,
          periodEnd,
          checkDate: payDay,
          grossCents: 0,
          netCents: null,
          earningsCents: {},
          hours: {},
          sectionKind: kind,
          section,
          employeeType,
          payKind: isOwnerDraw(employeeType) ? "owner_draw" : "wage",
          ratesCents: {},
        };
      }
      if (!type) continue;
      if (!current) {
        problems.push(`${where} row ${r + 1}: pay line before any employee`);
        continue;
      }
      const cur = current as PayrollJournalRow;
      try {
        const amount = toCents(text(at(x, "amount")));
        if (/^gross$/i.test(type)) {
          grossLine = amount;
          continue;
        }
        if (isOwnerDraw(type)) cur.payKind = "owner_draw";
        if (amount !== null) {
          cur.earningsCents[type] = (cur.earningsCents[type] ?? 0) + amount;
          lineSum += amount;
          lines++;
        }
        const h = parseScaled(text(at(x, "hours")), 3);
        if (h !== null) cur.hours[type] = (cur.hours[type] ?? 0) + h / 1000;
        const rate = toCents(text(at(x, "rate")));
        if (rate !== null && cur.ratesCents) cur.ratesCents[type] = rate;
      } catch {
        problems.push(`${where} row ${r + 1}: unreadable pay line`);
      }
    }
    finish();
    if (totals === null) totals = totalsItemized;
    if (totals === null) problems.push(`${where}: no Payroll Totals amount`);
    else if (totals !== sectionGross)
      problems.push(
        `${where}: employee gross sum ${sectionGross}¢ vs Payroll Totals ${totals}¢`,
      );
  }
  if (!sections) problems.push("no payroll sections (no 'Pay period' line)");
  const notes = zeroGross
    ? [
        `${zeroGross} employee row(s) with no pay lines: gross 0 from the source`,
      ]
    : [];
  return {
    rows,
    namesAnonymized: false,
    syncRun: exportSyncRun(
      opts.companyId,
      "payrollJournal",
      method,
      startedAt,
      now().toISOString(),
      rows.length,
      expected,
      problems,
      notes,
    ),
  };
}

/** True when a CSV looks like the sectioned journal (a "Pay period" line). */
export const isSectionedJournal = (csvText: string): boolean =>
  /^\s*"?pay period"?\s*,/im.test(csvText);
