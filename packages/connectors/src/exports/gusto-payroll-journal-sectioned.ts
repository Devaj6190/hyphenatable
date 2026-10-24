// Gusto "Payroll Journal Report" CSV, sectioned layout (Company R's real export; tested only on synthetic
// replicas). Preamble lines, then per payroll:
//   <title>  /  Pay period, MM/DD/YYYY - MM/DD/YYYY  /  Pay day, MM/DD/YYYY  /  30-column header  /
//   employee rows (first row: Last, First, ..., Employee Type; continuation rows: blank names, one Pay Type each,
//   including a "Gross" line)  /  Payroll Totals ...
// Read ONLY: names, employee type, pay type, hours, rate, amount; period, pay day, section kind. Tax columns,
// Work Address, Net Pay, Check Amount, Employer Cost and Donations are never read (only mapped columns are).
// Gross: the Payment column of the employee's first row (Gross line only as fallback); "Owner’s draw"
// rows are owner draws (payKind owner_draw). Completeness: every employee has a gross; per section, the sum of
// employee gross == the Payroll Totals Payment.

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
  | "amount"
  | "payment";
export const SECTIONED_COLUMNS: Mapping<Key> = {
  last: ["Last Name"],
  first: ["First Name"],
  employeeType: ["Employee Type"],
  payType: ["Pay Type"],
  hours: ["Hours"],
  rate: ["Rate"],
  amount: ["Amount"],
  // only for the Payroll Totals row when it has no Gross line of its own
  payment: ["Payment"],
};

export type SectionKind = "regular" | "off_cycle" | "other";
export const sectionKind = (title: string): SectionKind =>
  /^regular\b/i.test(title.trim())
    ? "regular"
    : /off-/i.test(title)
      ? "off_cycle"
      : "other";

const US_DATE = /(\d{1,2}\/\d{1,2}\/\d{4})/g;

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

  let r = 0;
  const lastTitle = (before: number): string => {
    for (let i = before - 1; i >= 0; i--) {
      const row = grid[i] ?? [];
      if (isBlank(row)) continue;
      return text(row[0]) ?? "";
    }
    return "";
  };
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
      String(
        row
          .slice(1)
          .map((c) => text(c) ?? "")
          .join(" "),
      ).match(US_DATE) ?? [];
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
      const d = String(
        (grid[r] ?? [])
          .slice(1)
          .map((c) => text(c) ?? "")
          .join(" "),
      ).match(US_DATE)?.[0];
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

    // Gross per employee: the Payment column of the employee's first row (live finding: most employees have
    // no Gross pay-type line); a Gross line is the fallback only when Payment is empty. Section total: the
    // Payroll Totals row's Payment column (a Gross line is the fallback).
    let current: PayrollJournalRow | null = null;
    let currentPayment: number | null = null;
    let currentGrossLine: number | null = null;
    let sectionGross = 0;
    let totalsPayment: number | null = null;
    let totalsGrossLine: number | null = null;
    let inTotals = false;
    const finish = () => {
      if (current) {
        const gross = currentPayment ?? currentGrossLine;
        if (gross === null)
          problems.push(
            `${where} row ${current.rowNumber}: employee without Payment or a Gross line`,
          );
        else {
          if (
            currentPayment !== null &&
            currentGrossLine !== null &&
            currentPayment !== currentGrossLine
          ) {
            problems.push(
              `${where} row ${current.rowNumber}: Payment ${currentPayment}¢ vs Gross line ${currentGrossLine}¢`,
            );
          }
          current.grossCents = gross;
          sectionGross += gross;
          rows.push(current);
        }
      }
      current = null;
      currentPayment = null;
      currentGrossLine = null;
    };
    for (; r < grid.length; r++) {
      const x = grid[r] ?? [];
      if (isBlank(x)) continue;
      const first0 = text(x[0]);
      if (first0 && /^pay period$/i.test(first0)) break; // next section without a totals row
      const last = text(at(x, "last"));
      const firstName = text(at(x, "first"));
      if (last && /^payroll totals?$/i.test(last)) {
        finish();
        inTotals = true;
        const type = text(at(x, "payType"));
        try {
          totalsPayment = toCents(text(at(x, "payment")));
          if (type && /^gross$/i.test(type))
            totalsGrossLine = toCents(text(at(x, "amount")));
        } catch {
          problems.push(`${where}: unreadable Payroll Totals`);
        }
        continue;
      }
      if (inTotals) {
        // continuation lines of the totals block (a Gross line there is the fallback total)
        const type = text(at(x, "payType"));
        if (last || firstName || (!type && first0)) break; // something else began: the section is over
        try {
          if (type && /^gross$/i.test(type))
            totalsGrossLine = toCents(text(at(x, "amount")));
        } catch {
          problems.push(`${where}: unreadable Payroll Totals gross`);
        }
        continue;
      }
      if (last || firstName) {
        finish();
        expected++;
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
          employeeType: text(at(x, "employeeType")),
          payKind: /owner/i.test(text(at(x, "employeeType")) ?? "")
            ? "owner_draw"
            : "wage",
          ratesCents: {},
        };
        try {
          currentPayment = toCents(text(at(x, "payment")));
        } catch {
          problems.push(`${where} row ${r + 1}: unreadable Payment`);
        }
      }
      const type = text(at(x, "payType"));
      if (!type) continue;
      if (!current) {
        problems.push(`${where} row ${r + 1}: pay line before any employee`);
        continue;
      }
      const cur = current as PayrollJournalRow;
      try {
        const amount = toCents(text(at(x, "amount")));
        if (/^gross$/i.test(type)) {
          if (amount === null) throw new Error("no gross");
          currentGrossLine = amount;
          continue;
        }
        if (amount !== null)
          cur.earningsCents[type] = (cur.earningsCents[type] ?? 0) + amount;
        const h = parseScaled(text(at(x, "hours")), 3);
        if (h !== null) cur.hours[type] = (cur.hours[type] ?? 0) + h / 1000;
        const rate = toCents(text(at(x, "rate")));
        if (rate !== null && cur.ratesCents) cur.ratesCents[type] = rate;
      } catch {
        problems.push(`${where} row ${r + 1}: unreadable pay line`);
      }
    }
    finish();
    const totalsGross = totalsPayment ?? totalsGrossLine;
    if (totalsGross === null)
      problems.push(
        `${where}: no Payroll Totals gross (Payment or Gross line)`,
      );
    else if (totalsGross !== sectionGross)
      problems.push(
        `${where}: employee gross sum ${sectionGross}¢ vs Payroll Totals ${totalsGross}¢`,
      );
  }
  if (!sections) problems.push("no payroll sections (no 'Pay period' line)");
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
    ),
  };
}

/** True when a CSV looks like the sectioned journal (a "Pay period" line). */
export const isSectionedJournal = (csvText: string): boolean =>
  /^\s*"?pay period"?\s*,/im.test(csvText);
