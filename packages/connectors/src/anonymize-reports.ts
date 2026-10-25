// Company R Jobber report exports -> anonymized records. Names become worker / client ids from the shared
// anonymizer (one person = one worker across every source); job numbers become the same r:j: job ids the
// timesheets use; free text never arrives here (readers keep only categories and presence flags).

import {
  type ExpenseRow,
  expenseKind,
  type InvoiceReportRow,
  type JobReportRow,
  type QuoteReportRow,
  type TransactionRow,
  transactionKind,
} from "./exports/jobber-reports.ts";
import type { Category } from "./exports/keywords.ts";

export interface ReportHelpers {
  worker: (realName: string) => string;
  client: (realName: string) => string;
  /** job id (and roster entry) for a Jobber job number */
  jobOf: (jobNumber: number) => string;
}
const w = (h: ReportHelpers, n: string | null | undefined) =>
  n ? h.worker(n) : null;
const c = (h: ReportHelpers, n: string | null | undefined) =>
  n ? h.client(n) : null;
const firstJob = (h: ReportHelpers, ns: number[] | undefined) =>
  ns?.[0] !== undefined ? h.jobOf(ns[0]) : null;

export interface AnonJobberExpense {
  id: string;
  sourceId: string;
  date: string | null;
  amountCents: number | null;
  jobId: string | null;
  enteredByWorkerId: string | null;
  reimbursableToWorkerId: string | null;
  clientRef: string | null;
  hasDetails: boolean;
  category: Category | null;
  kind: "labor_paid_as_expense" | "expense";
}
export interface AnonTransaction {
  id: string;
  sourceId: string;
  date: string | null;
  type: string | null;
  kind: ReturnType<typeof transactionKind>;
  amountCents: number | null;
  jobIds: string[];
  method: string | null;
  clientRef: string | null;
}
export interface AnonInvoiceReport {
  id: string;
  sourceId: string;
  invoiceNumber: string | null;
  jobIds: string[];
  clientRef: string | null;
  salespersonWorkerId: string | null;
  createdDate: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  balanceCents: number | null;
  depositCents: number | null;
  status: string | null;
  category: Category | null;
}
export interface AnonQuoteReport {
  id: string;
  sourceId: string;
  quoteNumber: string | null;
  jobIds: string[];
  clientRef: string | null;
  salespersonWorkerId: string | null;
  draftedDate: string | null;
  sentDate: string | null;
  approvedDate: string | null;
  convertedDate: string | null;
  totalCents: number | null;
  depositCents: number | null;
  status: string | null;
  category: Category | null;
}
export interface AnonJobReport {
  id: string;
  sourceId: string;
  jobId: string | null;
  kind: "one_off" | "recurring";
  clientRef: string | null;
  salespersonWorkerId: string | null;
  createdDate: string | null;
  startDate: string | null;
  endDate: string | null;
  closedDate: string | null;
  totalCents: number | null;
  status: string | null;
  category: Category | null;
}

export interface ReportInputs {
  jobberExpenses?: { fileTag: string; rows: ExpenseRow[] }[];
  transactions?: { fileTag: string; rows: TransactionRow[] }[];
  invoices?: { fileTag: string; rows: InvoiceReportRow[] }[];
  quotes?: { fileTag: string; rows: QuoteReportRow[] }[];
  jobsReports?: {
    fileTag: string;
    kind: "one_off" | "recurring";
    rows: JobReportRow[];
  }[];
}

/** Every real name in the report inputs (for Anonymizer.reserve). */
export function reportNames(i: ReportInputs): string[] {
  const n: (string | null | undefined)[] = [];
  for (const f of i.jobberExpenses ?? [])
    for (const r of f.rows)
      n.push(r.names.enteredBy, r.names.reimbursableTo, r.names.client);
  for (const f of i.transactions ?? [])
    for (const r of f.rows) n.push(r.names.client);
  for (const f of i.invoices ?? [])
    for (const r of f.rows) n.push(r.names.client, r.names.salesperson);
  for (const f of i.quotes ?? [])
    for (const r of f.rows) n.push(r.names.client, r.names.salesperson);
  for (const f of i.jobsReports ?? [])
    for (const r of f.rows) n.push(r.names.client, r.names.salesperson);
  return n.filter((s): s is string => !!s);
}

export function anonymizeReports(h: ReportHelpers, i: ReportInputs) {
  const jobberExpenses: AnonJobberExpense[] = (i.jobberExpenses ?? []).flatMap(
    (f) =>
      f.rows.map((r) => ({
        id: `export:jexp:${f.fileTag}:${r.rowNumber}`,
        sourceId: `csv:${f.fileTag}#row${r.rowNumber}`,
        date: r.dates.date ?? null,
        amountCents: r.money.total ?? null,
        jobId: firstJob(h, r.jobs.job),
        enteredByWorkerId: w(h, r.names.enteredBy),
        reimbursableToWorkerId: w(h, r.names.reimbursableTo),
        clientRef: c(h, r.names.client),
        hasDetails: r.present.details ?? false,
        category: r.category,
        kind: expenseKind(r),
      })),
  );
  const transactions: AnonTransaction[] = (i.transactions ?? []).flatMap((f) =>
    f.rows.map((r) => {
      const kind = transactionKind(r.keep.type ?? null);
      const raw = r.money.total ?? null;
      // the export shows payments negative: money received is positive here, refunds negative
      const amountCents =
        raw === null
          ? null
          : kind === "refund"
            ? -Math.abs(raw)
            : Math.abs(raw);
      return {
        id: `export:jtx:${f.fileTag}:${r.rowNumber}`,
        sourceId: `csv:${f.fileTag}#row${r.rowNumber}`,
        date: r.dates.date ?? null,
        type: r.keep.type ?? null,
        kind,
        amountCents,
        jobIds: (r.jobs.job ?? []).map(h.jobOf),
        method: r.keep.method ?? null,
        clientRef: c(h, r.names.client),
      };
    }),
  );
  const invoices: AnonInvoiceReport[] = (i.invoices ?? []).flatMap((f) =>
    f.rows.map((r) => ({
      id: `export:jinv:${f.fileTag}:${r.rowNumber}`,
      sourceId: `csv:${f.fileTag}#row${r.rowNumber}`,
      invoiceNumber: r.keep.invoice ?? null,
      jobIds: (r.jobs.job ?? []).map(h.jobOf),
      clientRef: c(h, r.names.client),
      salespersonWorkerId: w(h, r.names.salesperson),
      createdDate: r.dates.created ?? null,
      issuedDate: r.dates.issued ?? null,
      dueDate: r.dates.due ?? null,
      paidDate: r.dates.paid ?? null,
      subtotalCents: r.money.subtotal ?? null,
      taxCents: r.money.tax ?? null,
      totalCents: r.money.total ?? null,
      balanceCents: r.money.balance ?? null,
      depositCents: r.money.deposit ?? null,
      status: r.keep.status ?? null,
      category: r.category,
    })),
  );
  const quotes: AnonQuoteReport[] = (i.quotes ?? []).flatMap((f) =>
    f.rows.map((r) => ({
      id: `export:jq:${f.fileTag}:${r.rowNumber}`,
      sourceId: `csv:${f.fileTag}#row${r.rowNumber}`,
      quoteNumber: r.keep.quote ?? null,
      jobIds: (r.jobs.job ?? []).map(h.jobOf),
      clientRef: c(h, r.names.client),
      salespersonWorkerId: w(h, r.names.salesperson),
      draftedDate: r.dates.drafted ?? null,
      sentDate: r.dates.sent ?? null,
      approvedDate: r.dates.approved ?? null,
      convertedDate: r.dates.converted ?? null,
      totalCents: r.money.total ?? null,
      depositCents: r.money.deposit ?? null,
      status: r.keep.status ?? null,
      category: r.category,
    })),
  );
  const jobsReport: AnonJobReport[] = (i.jobsReports ?? []).flatMap((f) =>
    f.rows.map((r) => ({
      id: `export:jjob:${f.fileTag}:${r.rowNumber}`,
      sourceId: `csv:${f.fileTag}#row${r.rowNumber}`,
      jobId: firstJob(h, r.jobs.job),
      kind: f.kind,
      clientRef: c(h, r.names.client),
      salespersonWorkerId: w(h, r.names.salesperson),
      createdDate: r.dates.created ?? null,
      startDate: r.dates.start ?? null,
      endDate: r.dates.end ?? null,
      closedDate: r.dates.closed ?? null,
      totalCents: r.money.total ?? null,
      status: r.keep.status ?? null,
      category: r.category,
    })),
  );
  return { jobberExpenses, transactions, invoices, quotes, jobsReport };
}

/** Names the reports give as Jobber users (entered by, reimbursable to, salesperson): workers. */
export function reportWorkerNames(i: ReportInputs): string[] {
  const n: (string | null | undefined)[] = [];
  for (const f of i.jobberExpenses ?? [])
    for (const r of f.rows) n.push(r.names.enteredBy, r.names.reimbursableTo);
  for (const f of i.invoices ?? [])
    for (const r of f.rows) n.push(r.names.salesperson);
  for (const f of i.quotes ?? [])
    for (const r of f.rows) n.push(r.names.salesperson);
  for (const f of i.jobsReports ?? [])
    for (const r of f.rows) n.push(r.names.salesperson);
  return n.filter((s): s is string => !!s);
}
