// Jobber report exports as CSV (Company R; built from layout descriptions, tested on synthetic replicas only):
// Expense Report, Transaction List (legacy), Invoices Report, Quotes Report, One-off / Recurring Jobs Reports.
// One generic reader driven by a spec per report: header found by alias table, data rows until the end,
// "Report totals:" line compared when the report has one. Only mapped columns are read: addresses, postal
// codes, job descriptions and other free text are never read, except fields named in `categoryFrom`, which are
// reduced to a coarse category at read time. People and client names are kept raw for the anonymizer only
// (results are namesAnonymized: false). Errors name row numbers and column keys, never cell text.

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
  parseCsv,
  text,
} from "./common.ts";
import {
  type Category,
  categoryOf,
  datePart,
  jobNumberOf,
  looseMoney,
} from "./keywords.ts";

export interface ReportSpec<K extends string> {
  /** report label in SyncRun.method */
  name: string;
  /** SyncRun.object */
  object: string;
  columns: Mapping<K>;
  required: K[][];
  money?: K[];
  dates?: K[];
  /** job number columns ("#527"; a list "#527, #530" keeps every number) */
  jobs?: K[];
  /** short coded values kept as they are (status, type, method, document numbers) */
  keep?: K[];
  /** people / clients: raw for the anonymizer only; "N/A" is null */
  names?: K[];
  /** free text whose only kept trace is whether it is filled (e.g. expense Details -> hasDetails) */
  presence?: K[];
  /** free text reduced to a category, never kept */
  categoryFrom?: K[];
  /** money column summed and compared with the "Report totals:" line (and the preamble total) */
  totalKey?: K;
  /** preamble line holding the report's grand total, e.g. "Total Expense Value,<n>" */
  preambleTotal?: RegExp;
}

export interface ReportRow<K extends string> {
  rowNumber: number;
  money: Partial<Record<K, number | null>>;
  dates: Partial<Record<K, string | null>>;
  jobs: Partial<Record<K, number[]>>;
  keep: Partial<Record<K, string | null>>;
  names: Partial<Record<K, string | null>>;
  present: Partial<Record<K, boolean>>;
  category: Category | null;
}

const NA = /^n\/?a$/i;

export async function readJobberReportCsv<K extends string>(
  spec: ReportSpec<K>,
  input: string | { text: string; fileName: string },
  opts: { companyId: string; now?: () => Date },
): Promise<ExportResult<ReportRow<K>>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const grid: Cell[][] = parseCsv(
    typeof input === "string" ? await readFile(input, "utf8") : input.text,
  );
  const method = `export jobber-${spec.name}-csv ${fileName}`;
  const problems: string[] = [];
  const done = (rows: ReportRow<K>[], expected: number) => ({
    rows,
    namesAnonymized: false as const,
    syncRun: exportSyncRun(
      opts.companyId,
      spec.object,
      method,
      startedAt,
      now().toISOString(),
      rows.length,
      expected,
      problems,
    ),
  });

  let header: ReturnType<typeof locateHeader<K>>;
  try {
    header = locateHeader<K>(grid, spec.columns, spec.required, 60);
  } catch (e) {
    problems.push((e as Error).message);
    return done([], 0);
  }
  // preamble total ("Total Expense Value,<n>")
  let preamble: number | null = null;
  if (spec.preambleTotal) {
    for (let r = 0; r < header.headerRow; r++) {
      const row = grid[r] ?? [];
      if (spec.preambleTotal.test(text(row[0]) ?? "")) {
        try {
          preamble = toCents(looseMoney(text(row[1])));
        } catch {
          problems.push(`row ${r + 1}: unreadable preamble total`);
        }
      }
    }
    if (preamble === null) problems.push("no preamble total line");
  }

  const { headerRow, cols } = header;
  const at = (row: Cell[], k: K) =>
    cols[k] === undefined ? null : text(row[cols[k] as number] ?? null);
  const rows: ReportRow<K>[] = [];
  let dataRows = 0;
  let sum = 0;
  let reportTotal: number | null = null;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (isBlank(row)) continue;
    if (/^report totals?:?$/i.test(text(row[0]) ?? "")) {
      if (spec.totalKey) {
        try {
          reportTotal = toCents(looseMoney(at(row, spec.totalKey)));
        } catch {
          problems.push(`row ${r + 1}: unreadable report total`);
        }
      }
      continue;
    }
    dataRows++;
    let field: string = "row";
    try {
      const out: ReportRow<K> = {
        rowNumber: r + 1,
        money: {},
        dates: {},
        jobs: {},
        keep: {},
        names: {},
        present: {},
        category: null,
      };
      for (const k of spec.money ?? []) {
        field = k;
        out.money[k] = toCents(looseMoney(at(row, k)));
      }
      for (const k of spec.dates ?? []) {
        field = k;
        const raw = at(row, k);
        const d = datePart(raw);
        if (raw !== null && !d) throw new Error("unreadable date");
        out.dates[k] = d ? cellDate(d) : null;
      }
      for (const k of spec.jobs ?? []) {
        const v = at(row, k);
        out.jobs[k] = v
          ? v
              .split(/[,;]/)
              .map((s) => jobNumberOf(s))
              .filter((n): n is number => n !== null)
          : [];
      }
      for (const k of spec.keep ?? []) out.keep[k] = at(row, k);
      for (const k of spec.presence ?? []) out.present[k] = at(row, k) !== null;
      for (const k of spec.names ?? []) {
        const v = at(row, k);
        out.names[k] = v && !NA.test(v) ? v : null;
      }
      out.category = categoryOf(
        ...(spec.categoryFrom ?? []).map((k) => at(row, k)),
      );
      if (spec.totalKey) sum += out.money[spec.totalKey] ?? 0;
      rows.push(out);
    } catch {
      problems.push(`row ${r + 1}: unreadable ${field}`);
    }
  }
  if (spec.totalKey) {
    if (reportTotal !== null && reportTotal !== sum)
      problems.push(`rows sum ${sum}¢ vs Report totals ${reportTotal}¢`);
    if (preamble !== null && preamble !== sum)
      problems.push(`rows sum ${sum}¢ vs preamble total ${preamble}¢`);
  }
  return done(rows, dataRows);
}

// ---------------------------------------------------------------- the specs (aliases: adjust to real headers)

export const EXPENSE_REPORT = {
  name: "expense-report",
  object: "jobberExpenses",
  columns: {
    item: ["Item name", "Item"],
    details: ["Details"],
    total: ["Total $", "Total", "Amount"],
    enteredBy: ["Entered by"],
    reimbursableTo: ["Reimbursable to"],
    job: ["Job #", "Job number"],
    date: ["Date"],
    client: ["Client name", "Client"],
  },
  required: [["item"], ["total"], ["date"]],
  money: ["total"],
  dates: ["date"],
  jobs: ["job"],
  names: ["enteredBy", "reimbursableTo", "client"],
  presence: ["details"],
  categoryFrom: ["item", "details"],
  totalKey: "total",
  preambleTotal: /^total expense value$/i,
} satisfies ReportSpec<
  | "item"
  | "details"
  | "total"
  | "enteredBy"
  | "reimbursableTo"
  | "job"
  | "date"
  | "client"
>;

export const TRANSACTION_LIST = {
  name: "transaction-list",
  object: "jobberTransactions",
  columns: {
    client: ["Client name", "Client"],
    date: ["Date"],
    type: ["Type"],
    total: ["Total $", "Total", "Amount"],
    method: ["Method", "Payment method"],
    job: ["Job #", "Job number", "Job numbers"],
  },
  required: [["date"], ["type"], ["total"]],
  money: ["total"],
  dates: ["date"],
  jobs: ["job"],
  keep: ["type", "method"],
  names: ["client"],
} satisfies ReportSpec<"client" | "date" | "type" | "total" | "method" | "job">;

export const INVOICES_REPORT = {
  name: "invoices-report",
  object: "jobberInvoices",
  columns: {
    invoice: ["Invoice #", "Invoice number", "Invoice"],
    client: ["Client name", "Client"],
    job: ["Job #", "Job number", "Job numbers", "Jobs"],
    created: ["Created date", "Created"],
    issued: ["Issued date", "Issue date", "Issued"],
    due: ["Due date", "Due"],
    paid: ["Marked paid date", "Paid date", "Marked paid", "Paid on"],
    salesperson: ["Salesperson"],
    subtotal: ["Subtotal $", "Subtotal"],
    tax: ["Tax $", "Tax amount", "Tax"],
    total: ["Total $", "Total", "Invoice total"],
    balance: ["Balance $", "Balance", "Balance owing"],
    deposit: ["Deposit $", "Deposit"],
    status: ["Status", "Invoice status"],
    subject: ["Subject", "Title"],
  },
  required: [["invoice"], ["total"]],
  money: ["subtotal", "tax", "total", "balance", "deposit"],
  dates: ["created", "issued", "due", "paid"],
  jobs: ["job"],
  keep: ["invoice", "status"],
  names: ["client", "salesperson"],
  categoryFrom: ["subject"],
  totalKey: "total",
} satisfies ReportSpec<
  | "invoice"
  | "client"
  | "job"
  | "created"
  | "issued"
  | "due"
  | "paid"
  | "salesperson"
  | "subtotal"
  | "tax"
  | "total"
  | "balance"
  | "deposit"
  | "status"
  | "subject"
>;

export const QUOTES_REPORT = {
  name: "quotes-report",
  object: "jobberQuotes",
  columns: {
    quote: ["Quote #", "Quote number", "Quote"],
    client: ["Client name", "Client"],
    salesperson: ["Salesperson"],
    drafted: ["Drafted date", "Drafted", "Created date"],
    sent: ["Sent date", "Sent"],
    approved: ["Approved date", "Approved"],
    converted: ["Converted date", "Converted"],
    total: ["Total $", "Total", "Quote total"],
    deposit: ["Required deposit $", "Deposit $", "Deposit"],
    status: ["Status", "Quote status"],
    job: ["Job #", "Job number", "Job numbers", "Jobs"],
    title: ["Title", "Quote title"],
  },
  required: [["quote"], ["total"]],
  money: ["total", "deposit"],
  dates: ["drafted", "sent", "approved", "converted"],
  jobs: ["job"],
  keep: ["quote", "status"],
  names: ["client", "salesperson"],
  categoryFrom: ["title"],
  totalKey: "total",
} satisfies ReportSpec<
  | "quote"
  | "client"
  | "salesperson"
  | "drafted"
  | "sent"
  | "approved"
  | "converted"
  | "total"
  | "deposit"
  | "status"
  | "job"
  | "title"
>;

export const JOBS_REPORT = {
  name: "jobs-report",
  object: "jobberJobs",
  columns: {
    job: ["Job #", "Job number"],
    client: ["Client name", "Client"],
    title: ["Title", "Job title"],
    created: ["Created date", "Created"],
    start: ["Start date", "Schedule start", "Starts"],
    end: ["End date", "Ends"],
    closed: ["Closed date", "Completed date", "Completed", "Closed"],
    total: ["Total $", "Total", "Job value", "Value"],
    status: ["Status", "Job status"],
    salesperson: ["Salesperson"],
  },
  required: [["job"]],
  money: ["total"],
  dates: ["created", "start", "end", "closed"],
  jobs: ["job"],
  keep: ["status"],
  names: ["client", "salesperson"],
  categoryFrom: ["title"],
  totalKey: "total",
} satisfies ReportSpec<
  | "job"
  | "client"
  | "title"
  | "created"
  | "start"
  | "end"
  | "closed"
  | "total"
  | "status"
  | "salesperson"
>;

export type ExpenseRow = ReportRow<keyof typeof EXPENSE_REPORT.columns>;
export type TransactionRow = ReportRow<keyof typeof TRANSACTION_LIST.columns>;
export type InvoiceReportRow = ReportRow<keyof typeof INVOICES_REPORT.columns>;
export type QuoteReportRow = ReportRow<keyof typeof QUOTES_REPORT.columns>;
export type JobReportRow = ReportRow<keyof typeof JOBS_REPORT.columns>;

/** The details column carries a "8 h x $25"-style line: a person's labor paid as an expense. */
export const expenseKind = (
  r: ExpenseRow,
): "labor_paid_as_expense" | "expense" =>
  r.category === "labor" ? "labor_paid_as_expense" : "expense";

/** Transaction List type -> what the record is. Payment amounts are positive here (the export shows them negative). */
export function transactionKind(
  type: string | null,
): "deposit" | "final" | "invoice" | "refund" | "unknown" {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("deposit")) return "deposit";
  if (t.startsWith("payment")) return "final";
  if (t.startsWith("invoice")) return "invoice";
  if (t.startsWith("refund")) return "refund";
  return "unknown";
}
