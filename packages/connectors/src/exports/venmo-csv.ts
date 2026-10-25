// Venmo statement CSV (one per month), Company R's layout (from a description; tested on synthetic replicas):
// row 1 "Account Statement - (@...)", a header row (",ID,Datetime,Type,Status,Note,From,To,Amount (total),
// Amount (tip),Amount (tax),Amount (fee),...,Funding Source,Destination,Beginning Balance,Ending Balance,..."),
// transaction rows (amounts like "- $55.71" / "+ $250.00", multi-line quoted notes), balance rows, a disclaimer.
// Kept: id, datetime (UTC), type, status, direction, amounts, counterparty name and funding / destination labels
// (raw, for the anonymizer only: they become worker / party ids and bank:A-style tokens), and a coarse class of
// the note. The note text is never kept. Rows without a numeric ID (balances, disclaimer) are not transactions.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { toCents } from "../money.ts";
import {
  type Cell,
  type ExportResult,
  exportSyncRun,
  locateHeader,
  type Mapping,
  parseCsv,
  text,
} from "./common.ts";
import { categoryOf, looseMoney } from "./keywords.ts";

type Key =
  | "id"
  | "datetime"
  | "type"
  | "status"
  | "note"
  | "from"
  | "to"
  | "amount"
  | "tip"
  | "fee"
  | "funding"
  | "destination";
export const VENMO_COLUMNS: Mapping<Key> = {
  id: ["ID"],
  datetime: ["Datetime", "Date"],
  type: ["Type"],
  status: ["Status"],
  note: ["Note"],
  from: ["From"],
  to: ["To"],
  amount: ["Amount (total)", "Amount"],
  tip: ["Amount (tip)"],
  fee: ["Amount (fee)"],
  funding: ["Funding Source"],
  destination: ["Destination"],
};

export type NoteClass =
  | "wage"
  | "reimbursement"
  | "tip"
  | "commission"
  | "referral"
  | "unknown";
const REIMBURSABLE = new Set([
  "fuel",
  "mulch",
  "seed",
  "soil",
  "plants",
  "weed",
  "equipment",
  "disposal",
  "materials",
]);
const DATE_RANGE =
  /\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*(-|–|to)\s*\d{1,2}\/\d{1,2}/i;

/** A coarse class of a payment note; the note itself is dropped. First match wins. */
export function classifyNote(note: string | null): NoteClass {
  const n = (note ?? "").trim();
  if (!n) return "unknown";
  if (/\breferr?al\b/i.test(n)) return "referral";
  if (/%|\bcommission\b/i.test(n)) return "commission";
  if (/\btips?\b/i.test(n)) return "tip";
  const cat = categoryOf(n);
  // "rent" alone is usually personal: only an explicit rental counts
  if (/\breimburs|\brental\b/i.test(n) || (cat && REIMBURSABLE.has(cat)))
    return "reimbursement";
  if (
    DATE_RANGE.test(n) ||
    /\b(pay|payroll|paycheck|wages?|hours?|hrs|weekly|week)\b/i.test(n)
  )
    return "wage";
  return "unknown";
}

export interface VenmoRow {
  rowNumber: number;
  id: string;
  /** ISO UTC */
  datetime: string;
  venmoType: string | null;
  status: string | null;
  direction: "in" | "out";
  amountCents: number;
  tipCents: number | null;
  feeCents: number | null;
  /** real: the other side of the payment (To when paying, From when paid); null for transfers */
  counterpartyName: string | null;
  /** real labels (bank + last4): the anonymizer turns them into tokens */
  fundingRaw: string | null;
  destinationRaw: string | null;
  noteClass: NoteClass;
  hasNote: boolean;
}

const money = (c: string | null) => toCents(looseMoney(c));

export async function readVenmoCsv(
  input: string | { text: string; fileName: string },
  opts: { companyId: string; now?: () => Date },
): Promise<ExportResult<VenmoRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const grid: Cell[][] = parseCsv(
    typeof input === "string" ? await readFile(input, "utf8") : input.text,
  );
  const method = `export venmo-csv ${fileName}`;
  const problems: string[] = [];
  const rows: VenmoRow[] = [];
  let dataRows = 0;
  let header: ReturnType<typeof locateHeader<Key>>;
  try {
    header = locateHeader<Key>(
      grid,
      VENMO_COLUMNS,
      [["id"], ["datetime"], ["amount"]],
      10,
    );
  } catch (e) {
    problems.push((e as Error).message);
    return {
      rows,
      namesAnonymized: false,
      syncRun: exportSyncRun(
        opts.companyId,
        "venmo",
        method,
        startedAt,
        now().toISOString(),
        0,
        0,
        problems,
      ),
    };
  }
  const { headerRow, cols } = header;
  const at = (row: Cell[], k: Key) =>
    cols[k] === undefined ? null : text(row[cols[k] as number] ?? null);
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const id = at(row, "id");
    if (!id || !/^\d+$/.test(id)) continue; // balance rows and the disclaimer
    dataRows++;
    let field = "datetime";
    try {
      const raw = at(row, "datetime") ?? "";
      // Venmo statements give UTC wall time without a zone
      const ms = Date.parse(
        /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`,
      );
      if (Number.isNaN(ms)) throw new Error("datetime");
      field = "amount";
      const amount = money(at(row, "amount"));
      if (amount === null) throw new Error("amount");
      const direction = amount < 0 ? "out" : "in";
      const type = at(row, "type");
      const transfer = /transfer/i.test(type ?? "");
      const note = at(row, "note");
      rows.push({
        rowNumber: r + 1,
        id,
        datetime: new Date(ms).toISOString(),
        venmoType: type,
        status: at(row, "status"),
        direction,
        amountCents: amount,
        tipCents: money(at(row, "tip")),
        feeCents: money(at(row, "fee")),
        counterpartyName: transfer
          ? null
          : direction === "out"
            ? at(row, "to")
            : at(row, "from"),
        fundingRaw: at(row, "funding"),
        destinationRaw: at(row, "destination"),
        noteClass: classifyNote(note),
        hasNote: !!note,
      });
    } catch {
      problems.push(`row ${r + 1}: unreadable ${field}`);
    }
  }
  return {
    rows,
    namesAnonymized: false,
    syncRun: exportSyncRun(
      opts.companyId,
      "venmo",
      method,
      startedAt,
      now().toISOString(),
      rows.length,
      dataRows,
      problems,
    ),
  };
}
