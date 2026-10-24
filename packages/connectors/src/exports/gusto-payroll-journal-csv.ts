// Gusto Payroll Journal report (CSV): per-employee gross and earnings by type for one or more payrolls.
// Used for Company R's M4 backtest (what was actually paid). Columns UNVERIFIED until the first real file:
// adjust JOURNAL_COLUMNS / EARNING_COLUMNS / HOUR_COLUMNS only. Taxes, deductions, SSNs, bank and
// address columns are never read: only mapped columns are.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseScaled, toCents } from "../money.ts";
import {
  type Cell,
  cellDate,
  type ExportResult,
  exportSyncRun,
  isBlank,
  isTotalRow,
  locateHeader,
  type Mapping,
  parseCsv,
  text,
} from "./common.ts";

export const EARNING_COLUMNS = {
  "Regular Hours": ["Regular Earnings", "Regular Wages", "Regular"],
  Overtime: ["Overtime Earnings", "Overtime Wages", "Overtime"],
  "Double Overtime": ["Double Overtime Earnings", "Double Overtime"],
  Bonus: ["Bonus"],
  Commission: ["Commission"],
  "Paycheck Tips": ["Paycheck Tips"],
  "Cash Tips": ["Cash Tips"],
  Reimbursement: ["Reimbursement", "Reimbursements"],
  "Correction Payment": ["Correction Payment"],
} as const;
export const HOUR_COLUMNS = {
  "Regular Hours": ["Regular Hours"],
  Overtime: ["Overtime Hours", "OT Hours"],
  "Double Overtime": ["Double Overtime Hours"],
} as const;

type EarnKey = `earn:${keyof typeof EARNING_COLUMNS}`;
type HourKey = `hours:${keyof typeof HOUR_COLUMNS}`;
type Key =
  | "employee"
  | "firstName"
  | "lastName"
  | "periodStart"
  | "periodEnd"
  | "checkDate"
  | "gross"
  | "net"
  | EarnKey
  | HourKey;

export const JOURNAL_COLUMNS = {
  employee: ["Employee", "Employee Name", "Name"],
  firstName: ["Employee First Name", "First Name"],
  lastName: ["Employee Last Name", "Last Name"],
  periodStart: ["Pay Period Start", "Pay Period Start Date", "Period Start"],
  periodEnd: ["Pay Period End", "Pay Period End Date", "Period End"],
  checkDate: ["Check Date", "Pay Date", "Payday"],
  gross: ["Gross Earnings", "Gross Pay", "Gross"],
  net: ["Net Pay", "Net"],
  ...Object.fromEntries(
    Object.entries(EARNING_COLUMNS).map(([k, v]) => [`earn:${k}`, [...v]]),
  ),
  ...Object.fromEntries(
    Object.entries(HOUR_COLUMNS).map(([k, v]) => [`hours:${k}`, [...v]]),
  ),
} as Mapping<Key>;

/** One employee on one payroll. employeeName is real for Company R: anonymize before use. */
export interface PayrollJournalRow {
  rowNumber: number;
  employeeName: string;
  periodStart: string | null;
  periodEnd: string | null;
  checkDate: string | null;
  grossCents: number;
  netCents: number | null;
  /** Gusto earning name (same names as Draft lines) -> cents, only for columns present and non-empty. */
  earningsCents: Record<string, number>;
  hours: Record<string, number>;
  /** sectioned Payroll Journal: which payroll this row belongs to (titles are never kept: free text) */
  sectionKind?: "regular" | "off_cycle" | "other";
  section?: number;
  employeeType?: string | null;
  /** per pay-type rate in cents, when the report gives one */
  ratesCents?: Record<string, number>;
}

const optDate = (c: Cell | undefined) =>
  text(c) === null ? null : cellDate(c ?? null);

export async function readGustoPayrollJournalCsv(
  input: string | { text: string; fileName: string },
  opts: { companyId: string; now?: () => Date },
): Promise<ExportResult<PayrollJournalRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const grid: Cell[][] = parseCsv(
    typeof input === "string" ? await readFile(input, "utf8") : input.text,
  );
  const method = `export gusto-payroll-journal-csv ${fileName}`;
  let header: ReturnType<typeof locateHeader<Key>>;
  try {
    header = locateHeader<Key>(grid, JOURNAL_COLUMNS, [
      ["employee", "lastName"],
      ["gross"],
    ]);
  } catch (e) {
    return {
      rows: [],
      namesAnonymized: false,
      syncRun: exportSyncRun(
        opts.companyId,
        "payrollJournal",
        method,
        startedAt,
        now().toISOString(),
        0,
        0,
        [(e as Error).message],
      ),
    };
  }
  const { headerRow, cols } = header;
  const at = (row: Cell[], k: Key) =>
    cols[k] === undefined ? null : (row[cols[k] as number] ?? null);

  const rows: PayrollJournalRow[] = [];
  const problems: string[] = [];
  let dataRows = 0;
  let totalGross: number | null = null;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (isBlank(row)) continue;
    if (isTotalRow(row)) {
      totalGross = toCents(text(at(row, "gross")));
      continue;
    }
    dataRows++;
    let field = "employee";
    try {
      const employeeName =
        text(at(row, "employee")) ??
        [text(at(row, "firstName")), text(at(row, "lastName"))]
          .filter(Boolean)
          .join(" ");
      if (!employeeName) throw new Error("empty");
      field = "dates";
      const periodStart = optDate(at(row, "periodStart"));
      const periodEnd = optDate(at(row, "periodEnd"));
      const checkDate = optDate(at(row, "checkDate"));
      field = "gross";
      const grossCents = toCents(text(at(row, "gross")));
      if (grossCents === null) throw new Error("empty"); // a row without gross is unreadable, never 0
      field = "net";
      const netCents = toCents(text(at(row, "net")));
      field = "earnings";
      const earningsCents: Record<string, number> = {};
      for (const name of Object.keys(EARNING_COLUMNS)) {
        const v = toCents(text(at(row, `earn:${name}` as EarnKey)));
        if (v !== null) earningsCents[name] = v;
      }
      field = "hours";
      const hours: Record<string, number> = {};
      for (const name of Object.keys(HOUR_COLUMNS)) {
        const v = parseScaled(text(at(row, `hours:${name}` as HourKey)), 3);
        if (v !== null) hours[name] = v / 1000;
      }
      rows.push({
        rowNumber: r + 1,
        employeeName,
        periodStart,
        periodEnd,
        checkDate,
        grossCents,
        netCents,
        earningsCents,
        hours,
      });
    } catch {
      problems.push(`row ${r + 1}: unreadable ${field}`);
    }
  }
  if (totalGross !== null) {
    const sum = rows.reduce((s, x) => s + x.grossCents, 0);
    if (sum !== totalGross)
      problems.push(`gross sum ${sum}¢ vs report total ${totalGross}¢`);
  }
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
      dataRows,
      problems,
    ),
  };
}
