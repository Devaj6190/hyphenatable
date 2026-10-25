// QuickBooks "Transaction Detail by Account" (.xlsx, or a zip of workbooks), Company R's layout (built from a
// description, tested on synthetic replicas only): title rows (company, report name, dates), a header
// (Transaction date, Transaction type, Num, Name, Description, Split, Amount, Balance), then lines grouped by
// account: an account header row, its lines, "Total for <account>" (groups can nest), and a grand TOTAL.
// Kept: date, type, account (the innermost open group), split account, amount, payee name (raw, for the
// anonymizer), a coarse category of the description. Never read: Num, Balance; the description text itself.
// Completeness: every line parsed; per account, its lines (and its sub-accounts) == its "Total for" row.

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
import { type Category, categoryOf, looseMoney } from "./keywords.ts";
import { workbookGrids } from "./xlsx.ts";

type Key = "date" | "type" | "name" | "description" | "split" | "amount";
export const TDA_COLUMNS: Mapping<Key> = {
  date: ["Transaction date", "Date"],
  type: ["Transaction type", "Type"],
  name: ["Name", "Payee"],
  description: ["Description", "Memo/Description", "Memo"],
  split: ["Split", "Split account"],
  amount: ["Amount"],
};

export interface LedgerLine {
  sheet: number;
  rowNumber: number;
  date: string;
  txnType: string | null;
  accountName: string | null;
  splitAccount: string | null;
  /** real for Company R: anonymize before use */
  payeeName: string | null;
  amountCents: number;
  category: Category | null;
}

const asDate = (c: Cell | null): string | null => {
  try {
    return c === null ? null : cellDate(c);
  } catch {
    return null;
  }
};
const money = (c: Cell | null) =>
  typeof c === "number" ? toCents(c) : toCents(looseMoney(text(c)));

/** Label shape for --diagnose: letters -> A / a, digits -> 9, the rest kept. Never the label itself. */
export const labelShape = (s: string): string =>
  s
    .replace(/\p{Lu}/gu, "A")
    .replace(/\p{Ll}/gu, "a")
    .replace(/\p{Nd}/gu, "9");

/** QBO: "Total for X" covers X's own lines; "Total for X with sub-accounts" covers X and its sub-accounts. */
const WITH_SUBS = /\s+with\s+sub-?\s*accounts?\s*$/i;

/** "6000 Payroll expenses:6010 Manager pay (deleted)" -> "payroll expenses:manager pay" */
const accountKey = (s: string): string =>
  s
    .replace(WITH_SUBS, "")
    .split(":")
    .map((seg) =>
      seg
        .replace(/\(deleted\)/gi, "")
        .replace(/^\s*\d[\d.-]*\s*[·-]?\s+/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .join(":");
const leaf = (k: string) => k.slice(k.lastIndexOf(":") + 1);
/** A total closes a group when its label is the group's full path, its leaf, or a path ending in it. */
const closes = (group: string, total: string): boolean => {
  const g = accountKey(group);
  const t = accountKey(total);
  return (
    g === t || leaf(g) === leaf(t) || g.endsWith(`:${t}`) || t.endsWith(`:${g}`)
  );
};

export async function readQboTransactionDetailXlsx(
  input: string | { bytes: Uint8Array; fileName: string },
  opts: {
    companyId: string;
    now?: () => Date;
    /** prints label SHAPES (never labels) of total rows that close nothing and of groups never closed */
    diagnose?: (line: string) => void;
  },
): Promise<ExportResult<LedgerLine>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const bytes =
    typeof input === "string"
      ? new Uint8Array(await readFile(input))
      : input.bytes;
  const problems: string[] = [];
  const notes: string[] = [];
  const rows: LedgerLine[] = [];
  let dataRows = 0;
  let sheetNo = 0;
  for (const s of await workbookGrids(bytes)) {
    let header: ReturnType<typeof locateHeader<Key>>;
    try {
      header = locateHeader<Key>(s.grid, TDA_COLUMNS, [
        ["date"],
        ["amount"],
        ["split"],
      ]);
    } catch {
      continue; // not this report
    }
    sheetNo++;
    const where = `sheet ${sheetNo}`;
    const { headerRow, cols } = header;
    const at = (row: Cell[], k: Key) =>
      cols[k] === undefined ? null : (row[cols[k] as number] ?? null);
    // ownClosed: its own-lines total was seen; it stays as the parent of the sub-accounts that follow
    type Group = { name: string; sum: number; row: number; ownClosed: boolean };
    const stack: Group[] = [];
    const openShapes = (gs: Group[] = stack) =>
      gs
        .map(
          (g) =>
            `row ${g.row} "${labelShape(g.name)}"${g.ownClosed ? " (own total seen)" : ""}`,
        )
        .join(" > ") || "(none)";
    let all = 0;
    for (let r = headerRow + 1; r < s.grid.length; r++) {
      const row = s.grid[r] ?? [];
      if (isBlank(row)) continue;
      const first = text(row.find((c) => text(c) !== null) ?? null) ?? "";
      const totalFor = /^total for (.+)$/i.exec(first);
      try {
        if (totalFor) {
          const name = (totalFor[1] ?? "").trim();
          const withSubs = WITH_SUBS.test(name);
          // innermost open group this total names (full path, leaf, number prefix or "(deleted)" aside); a
          // plain total never names a group whose own total was already seen
          let idx = stack.length - 1;
          while (idx >= 0) {
            const g = stack[idx] as Group;
            if (closes(g.name, name) && (withSubs || !g.ownClosed)) break;
            idx--;
          }
          const total = money(at(row, "amount"));
          if (idx < 0) {
            opts.diagnose?.(
              `${where} row ${r + 1}: starts with "Total for": yes; label "${labelShape(first)}"; open: ${openShapes()}`,
            );
            problems.push(
              `${where} row ${r + 1}: a total row with no open account`,
            );
            continue;
          }
          // groups opened after it (sub-accounts) fold into it
          while (stack.length - 1 > idx) {
            const child = stack.pop() as Group;
            (stack[stack.length - 1] as Group).sum += child.sum;
          }
          const g = stack[idx] as Group;
          if (total !== null && total !== g.sum)
            problems.push(
              `${where} row ${r + 1}: account lines ${g.sum}¢ vs its total row ${total}¢`,
            );
          if (!withSubs) {
            // own lines checked; sub-accounts may follow, closed by "Total for X with sub-accounts"
            g.ownClosed = true;
            continue;
          }
          stack.pop();
          const parent = stack[stack.length - 1];
          if (parent) parent.sum += g.sum;
          continue;
        }
        if (/^total$/i.test(first)) {
          const total = money(at(row, "amount"));
          if (total !== null && total !== all)
            problems.push(`${where}: lines ${all}¢ vs grand TOTAL ${total}¢`);
          break; // the footer (basis, run time) follows
        }
        if (/^(cash|accrual) basis\b/i.test(first)) break;
        const date = asDate(at(row, "date"));
        if (!date && /^beginning balance$/i.test(first)) continue; // balance-sheet accounts open with one
        if (!date) {
          // an account header: text and no amount
          if (money(at(row, "amount")) === null && first) {
            stack.push({ name: first, sum: 0, row: r + 1, ownClosed: false });
            continue;
          }
          dataRows++;
          problems.push(`${where} row ${r + 1}: unreadable date`);
          continue;
        }
        dataRows++;
        const amount = money(at(row, "amount"));
        if (amount === null) throw new Error("amount");
        const top = stack[stack.length - 1];
        if (top) top.sum += amount;
        all += amount;
        rows.push({
          sheet: sheetNo,
          rowNumber: r + 1,
          date,
          txnType: text(at(row, "type")),
          accountName: top?.name ?? null,
          splitAccount: text(at(row, "split")),
          payeeName: text(at(row, "name")),
          amountCents: amount,
          category: categoryOf(text(at(row, "description"))),
        });
      } catch {
        problems.push(`${where} row ${r + 1}: unreadable amount`);
      }
    }
    const unclosed = stack.filter((g) => !g.ownClosed);
    if (unclosed.length)
      opts.diagnose?.(`${where} groups never closed: ${openShapes(unclosed)}`);
    if (unclosed.length)
      notes.push(
        `${where}: ${unclosed.length} account group(s) without a total row`,
      );
  }
  if (!sheetNo)
    problems.push(
      "no Transaction Detail by Account sheet (date, split, amount header)",
    );
  return {
    rows,
    namesAnonymized: false,
    syncRun: exportSyncRun(
      opts.companyId,
      "qboLedger",
      `export qbo-transaction-detail ${fileName}`,
      startedAt,
      now().toISOString(),
      rows.length,
      dataRows,
      problems,
      notes,
    ),
  };
}
