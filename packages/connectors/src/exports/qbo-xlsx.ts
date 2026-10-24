// QuickBooks Online Excel export (P1): a transaction-list style report (.xlsx, or the zip of workbooks from
// "Export data"). Reads expense-type rows: one row per transaction line, amounts to cents.
// Layout and column names are UNVERIFIED until a real file arrives: adjust QBO_COLUMNS / EXPENSE_TYPES only.
// Payee and customer names are real for Company R (customers are clients): anonymize before use.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { toCents } from "../money.ts";
import {
  type Cell,
  cellDate,
  type ExportResult,
  exportSyncRun,
  isBlank,
  locateHeader,
  type Mapping,
  text,
} from "./common.ts";
import { workbookGrids } from "./xlsx.ts";

type Key =
  | "date"
  | "type"
  | "num"
  | "name"
  | "memo"
  | "account"
  | "split"
  | "customer"
  | "amount";
export const QBO_COLUMNS: Mapping<Key> = {
  date: ["Date", "Transaction Date", "Txn Date"],
  type: ["Transaction Type", "Type", "Txn Type"],
  num: ["Num", "No.", "Number", "Doc Number", "Ref No."],
  name: ["Name", "Payee", "Vendor", "Supplier"],
  memo: ["Memo/Description", "Memo", "Description", "Line Description"],
  account: ["Account", "Expense Account", "Category", "Account Name"],
  split: ["Split", "Split Account"],
  customer: ["Customer", "Customer/Project", "Customer:Job", "Customer Name"],
  amount: ["Amount", "Total", "Amount (USD)"],
};

/** QBO transaction types that are expenses (Purchase / Bill equivalents). Others in the list are skipped, not errors. */
export const EXPENSE_TYPES = [
  "expense",
  "check",
  "credit card expense",
  "cash expense",
  "bill",
  "credit card credit",
  "purchase",
];

/** One expense line. payeeName / customerName are real for Company R: anonymize before use. */
export interface QboExportRow {
  workbook: string;
  sheet: string;
  rowNumber: number;
  date: string;
  txnType: string | null;
  num: string | null;
  payeeName: string | null;
  memo: string | null;
  accountName: string | null;
  customerName: string | null;
  amountCents: number;
}

const isDate = (c: Cell): boolean => {
  try {
    cellDate(c);
    return true;
  } catch {
    return false;
  }
};

export async function readQboXlsx(
  input: string | { bytes: Uint8Array; fileName: string },
  opts: { companyId: string; now?: () => Date },
): Promise<ExportResult<QboExportRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const bytes =
    typeof input === "string"
      ? new Uint8Array(await readFile(input))
      : input.bytes;
  const method = (where: string) => `export qbo-xlsx ${fileName}${where}`;
  const sheets = await workbookGrids(bytes);

  const rows: QboExportRow[] = [];
  const problems: string[] = [];
  const used: string[] = [];
  let dataRows = 0;
  for (const s of sheets) {
    let header: ReturnType<typeof locateHeader<Key>>;
    try {
      header = locateHeader<Key>(s.grid, QBO_COLUMNS, [["date"], ["amount"]]);
    } catch {
      continue; // not a transaction sheet (P&L, lists, notes)
    }
    used.push(`${s.workbook ? `${s.workbook}#` : ""}${s.sheet}`);
    const { headerRow, cols } = header;
    const at = (row: Cell[], k: Key) =>
      cols[k] === undefined ? null : (row[cols[k] as number] ?? null);
    let sheetSum = 0;
    let skippedByType = 0;
    let reportTotal: number | null = null;
    for (let r = headerRow + 1; r < s.grid.length; r++) {
      const row = s.grid[r] ?? [];
      if (isBlank(row)) continue;
      const first = text(row.find((c) => text(c) !== null));
      const amountText = text(at(row, "amount"));
      // structure, not data: group headings (no amount), "Total for <group>" subtotals, the grand total
      if (first && /^total\b/i.test(first)) {
        if (/^total\s*$/i.test(first) && amountText !== null)
          reportTotal = toCents(amountText);
        continue;
      }
      // no amount and no real date (e.g. a "Materials" group heading in the date column): structure.
      // A dated line with no amount is data and fails as unreadable below.
      if (amountText === null && !isDate(at(row, "date"))) continue;
      const type = text(at(row, "type"));
      if (
        cols.type !== undefined &&
        (!type || !EXPENSE_TYPES.includes(type.toLowerCase()))
      ) {
        skippedByType++;
        continue;
      }
      dataRows++;
      const where = `${s.sheet} row ${r + 1}`;
      let field = "date";
      try {
        const date = cellDate(at(row, "date"));
        field = "amount";
        const amountCents = toCents(
          typeof at(row, "amount") === "number"
            ? (at(row, "amount") as number)
            : amountText,
        );
        if (amountCents === null) throw new Error("empty");
        sheetSum += amountCents;
        rows.push({
          workbook: s.workbook,
          sheet: s.sheet,
          rowNumber: r + 1,
          date,
          txnType: type,
          num: text(at(row, "num")),
          payeeName: text(at(row, "name")),
          memo: text(at(row, "memo")),
          accountName: text(at(row, "account")) ?? text(at(row, "split")),
          customerName: text(at(row, "customer")),
          amountCents,
        });
      } catch {
        problems.push(`${where}: unreadable ${field}`);
      }
    }
    // the report's own total only means something when every line was kept
    if (
      reportTotal !== null &&
      skippedByType === 0 &&
      reportTotal !== sheetSum
    ) {
      problems.push(
        `${s.sheet}: amount sum ${sheetSum}¢ vs report total ${reportTotal}¢`,
      );
    }
  }
  if (!used.length)
    problems.push("no sheet with a transaction header (date, amount)");
  return {
    rows,
    namesAnonymized: false,
    syncRun: exportSyncRun(
      opts.companyId,
      "qboExpenses",
      method(used.length ? ` sheets ${used.join(", ")}` : ""),
      startedAt,
      now().toISOString(),
      rows.length,
      dataRows,
      problems,
    ),
  };
}
