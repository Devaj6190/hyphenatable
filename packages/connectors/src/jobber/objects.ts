// A-03 part 2: visits, quotes, invoices, payment records, expenses for a period, then every job they
// (and the period's time entries) reference. Read-only. Completeness per object.
// Field names validated against the live 2026-09-25 introspection.

import { toCents } from "../money.ts";
import type { Period } from "../time.ts";
import type { Expense, Invoice, Job, Payment, Quote, Visit } from "../types.ts";
import type { JobberClient } from "./client.ts";
import {
  type CompletenessResult,
  connectionCompleteness,
} from "./completeness.ts";
import { jobberRef, toUtcIso } from "./normalize.ts";
import {
  type Connection,
  PAGE_SIZE,
  paginate,
  visibleFields,
} from "./queries.ts";

/** Max nested items fetched per parent (assigned users, quote/invoice jobs). More -> the run is incomplete. */
export const NESTED_FIRST = 10;

const conn = (
  name: string,
  filter: string,
  fields: string,
  filterVars = "$after: String, $first: Int!, $from: ISO8601DateTime!, $to: ISO8601DateTime!",
) => /* GraphQL */ `
  query PayrollPilot_${name}(${filterVars}) {
    ${name}(filter: ${filter}, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { ${fields} }
    }
  }
`;
const range = (field: string) => `{ ${field}: { after: $from, before: $to } }`;
const nestedIds = (field: string) =>
  `${field}(first: ${NESTED_FIRST}) { totalCount nodes { id } }`;

export const VISITS_QUERY = conn(
  "visits",
  range("startAt"),
  `id job { id } startAt endAt isComplete ${nestedIds("assignedUsers")}`,
);
export const QUOTES_QUERY = conn(
  "quotes",
  range("sentAt"),
  `id quoteStatus salesperson { id } sentAt amounts { total } ${nestedIds("jobs")}`,
);
export const INVOICES_QUERY = conn(
  "invoices",
  range("issuedDate"),
  `id invoiceStatus issuedDate dueDate amounts { total } ${nestedIds("jobs")}`,
);
export const PAYMENT_RECORDS_QUERY = conn(
  "paymentRecords",
  range("entryDate"),
  "id amount entryDate paymentType invoice { id } quote { id }",
);
// Expense.accountingCode is hidden from an app without the matching scope (seen live 2026-10-24); requested only when visible.
export const expensesQuery = (withAccountingCode: boolean) =>
  conn(
    "expenses",
    range("date"),
    `id title description date total linkedJob { id }${withAccountingCode ? " accountingCode { code }" : ""} reimbursableTo { id }`,
  );
export const EXPENSES_QUERY = expensesQuery(true);
export const EXPENSES_QUERY_NO_CODE = expensesQuery(false);
/** Expense has no status field; the status exists only as a filter, so ids are pulled per status. */
export const EXPENSE_STATUS_QUERY = /* GraphQL */ `
  query PayrollPilot_expenseStatus($after: String, $first: Int!, $from: ISO8601DateTime!, $to: ISO8601DateTime!, $status: ExpensePaymentStatus!) {
    expenses(filter: { date: { after: $from, before: $to }, paymentStatus: $status }, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { id }
    }
  }
`;
export type ReimbursementStatus = "PENDING_REIMBURSEMENT" | "PAID";
export const JOBS_BY_ID_QUERY = conn(
  "jobs",
  "{ ids: $ids }",
  // the job's quote inline: quotes converted to jobs are often never "sent" (sentAt null), so a sentAt
  // filter alone misses them; every in-scope job brings its quote
  "id jobNumber title jobStatus client { id } salesperson { id } quote { id quoteStatus salesperson { id } sentAt amounts { total } } startAt endAt total",
  "$after: String, $first: Int!, $ids: [EncodedId!]!",
);

type Id = { id: string } | null;
type Nested = { totalCount: number; nodes: { id: string }[] } | null;
export interface RawVisit {
  id: string;
  job: { id: string };
  startAt: string | null;
  endAt: string | null;
  isComplete: boolean;
  assignedUsers: Nested;
}
export interface RawQuote {
  id: string;
  quoteStatus: string;
  salesperson: Id;
  sentAt: string | null;
  amounts: { total: number };
  jobs: Nested;
}
export interface RawInvoice {
  id: string;
  invoiceStatus: string;
  issuedDate: string | null;
  dueDate: string | null;
  amounts: { total: number } | null;
  jobs: Nested;
}
export interface RawPayment {
  id: string;
  amount: number;
  entryDate: string;
  paymentType: string | null;
  invoice: Id;
  quote: Id;
}
export interface RawExpense {
  id: string;
  title: string;
  description: string | null;
  date: string;
  total: number | null;
  linkedJob: Id;
  accountingCode?: { code: string } | null;
  reimbursableTo: Id;
}
export interface RawJob {
  id: string;
  jobNumber: number;
  title: string | null;
  jobStatus: string;
  client: { id: string };
  salesperson: Id;
  quote: (Omit<RawQuote, "jobs"> & { jobs?: Nested }) | null;
  startAt: string | null;
  endAt: string | null;
  total: number;
}

const ref = (n: Id | undefined) => (n?.id ? jobberRef(n.id) : null);
/** The one job a quote/invoice belongs to; null when none or several (never pick one). */
const soleJob = (n: Nested) =>
  n && n.totalCount === 1 && n.nodes[0] ? jobberRef(n.nodes[0].id) : null;

export const normalizeVisit = (r: RawVisit, companyId: string): Visit => ({
  id: jobberRef(r.id),
  companyId,
  jobId: jobberRef(r.job.id),
  sourceId: r.id,
  startAt: toUtcIso(r.startAt),
  endAt: toUtcIso(r.endAt),
  isComplete: r.isComplete,
  assignedWorkerIds: (r.assignedUsers?.nodes ?? []).map((u) => jobberRef(u.id)),
});

export const normalizeQuote = (r: RawQuote, companyId: string): Quote => ({
  id: jobberRef(r.id),
  companyId,
  sourceId: r.id,
  jobId: soleJob(r.jobs),
  salespersonWorkerId: ref(r.salesperson),
  sentAt: toUtcIso(r.sentAt),
  status: r.quoteStatus,
  amountCents: toCents(r.amounts.total),
});

export const normalizeInvoice = (
  r: RawInvoice,
  companyId: string,
): Invoice => ({
  id: jobberRef(r.id),
  companyId,
  sourceId: r.id,
  jobId: soleJob(r.jobs),
  issuedDate: toUtcIso(r.issuedDate),
  dueDate: toUtcIso(r.dueDate),
  status: r.invoiceStatus,
  totalCents: toCents(r.amounts?.total),
});

/** A payment recorded on a quote is a deposit (even once the quote is invoiced); on an invoice only, final. */
export function paymentKind(
  r: Pick<RawPayment, "invoice" | "quote">,
): Payment["kind"] {
  if (r.quote?.id) return "deposit";
  if (r.invoice?.id) return "final";
  return "unknown";
}

export const normalizePayment = (
  r: RawPayment,
  companyId: string,
): Payment => ({
  id: jobberRef(r.id),
  companyId,
  sourceId: r.id,
  invoiceId: ref(r.invoice),
  quoteId: ref(r.quote),
  entryDate: toUtcIso(r.entryDate),
  amountCents: toCents(r.amount),
  paymentType: r.paymentType,
  kind: paymentKind(r),
});

// linkedJob is a link the person made in Jobber, not a scored match: matchedJobId is set, matchConfidence stays null.
// kind is B's classification (expense_account_kind rules), so "unknown" here.
export const normalizeExpense = (
  r: RawExpense,
  companyId: string,
  status: Map<string, ReimbursementStatus> = new Map(),
): Expense => ({
  id: jobberRef(r.id),
  companyId,
  source: "jobber",
  sourceId: r.id,
  date: toUtcIso(r.date),
  amountCents: toCents(r.total),
  vendor: null,
  description:
    [r.title, r.description].filter((s) => s?.trim()).join(" - ") || null,
  accountName: r.accountingCode?.code ?? null,
  customerRef: null,
  paymentType: null,
  kind: "unknown",
  matchedJobId: ref(r.linkedJob),
  matchConfidence: null,
  reimbursableToWorkerId: ref(r.reimbursableTo),
  reimbursementStatus: status.get(r.id) ?? null,
});

export const normalizeJob = (r: RawJob, companyId: string): Job => ({
  id: jobberRef(r.id),
  companyId,
  sourceId: r.id,
  jobNumber: r.jobNumber,
  title: r.title,
  clientRef: jobberRef(r.client.id),
  status: r.jobStatus,
  salespersonWorkerId: ref(r.salesperson),
  quoteId: ref(r.quote),
  parentJobId: null,
  startAt: toUtcIso(r.startAt),
  endAt: toUtcIso(r.endAt),
  totalCents: toCents(r.total),
});

/** Parents whose nested list was cut at NESTED_FIRST: the run cannot claim completeness. */
function truncated(
  object: string,
  field: string,
  rows: { id: string; n: Nested }[],
): string | null {
  const cut = rows
    .filter((r) => r.n && r.n.totalCount > r.n.nodes.length)
    .map((r) => r.id);
  return cut.length
    ? `${object}: ${field} truncated at ${NESTED_FIRST} on ${cut.join(", ")}`
    : null;
}

function withExtra(
  r: CompletenessResult,
  extra: string | null,
): CompletenessResult {
  if (!extra) return r;
  return {
    ...r,
    complete: false,
    error: r.error ? `${r.error}; ${extra}` : extra,
  };
}

export interface ObjectRecords {
  jobs: Job[];
  visits: Visit[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
}
export type ObjectRun = {
  object: string;
  method: string;
  startedAt: string;
  result: CompletenessResult;
};

/**
 * Pull the period's objects. `entryJobIds` are Jobber job ids referenced by the period's time entries,
 * so every job with hours is fetched even if it has no visit, invoice or expense in the period.
 */
export async function pullObjects(
  client: JobberClient,
  companyId: string,
  period: Period,
  entryJobIds: string[],
  now: () => Date,
): Promise<{ records: ObjectRecords; runs: ObjectRun[] }> {
  const vars = { from: period.startUtc, to: period.endUtc };
  const runs: ObjectRun[] = [];
  const failed = (e: unknown): CompletenessResult => ({
    pulled: 0,
    expected: null,
    complete: false,
    error: e instanceof Error ? e.message : String(e),
  });

  async function one<R>(
    object: string,
    doc: string,
    field: string,
    nested?: (r: R) => Nested,
    note = "",
  ): Promise<R[]> {
    const startedAt = now().toISOString();
    const method = `jobber-graphql ${object}(${field} ${period.startUtc}..${period.endUtc}) first:${PAGE_SIZE}${note}`;
    try {
      const page = await paginate<R, Record<string, Connection<R>>>(
        client,
        doc,
        vars,
        (d) => d[object],
      );
      let result = connectionCompleteness(
        object,
        page.nodes.length,
        page.totalCount,
        page.totalCountDrift,
      );
      if (nested)
        result = withExtra(
          result,
          truncated(
            object,
            "nested list",
            page.nodes.map((n) => ({
              id: (n as { id: string }).id,
              n: nested(n),
            })),
          ),
        );
      runs.push({ object, method, startedAt, result });
      return page.nodes;
    } catch (e) {
      runs.push({ object, method, startedAt, result: failed(e) });
      return [];
    }
  }

  const visits = await one<RawVisit>(
    "visits",
    VISITS_QUERY,
    "startAt",
    (r) => r.assignedUsers,
  );
  const quotes = await one<RawQuote>(
    "quotes",
    QUOTES_QUERY,
    "sentAt",
    (r) => r.jobs,
  );
  const invoices = await one<RawInvoice>(
    "invoices",
    INVOICES_QUERY,
    "issuedDate",
    (r) => r.jobs,
  );
  const payments = await one<RawPayment>(
    "paymentRecords",
    PAYMENT_RECORDS_QUERY,
    "entryDate",
  );
  const withCode = (
    await visibleFields(client, "Expense").catch(() => new Set<string>())
  ).has("accountingCode");
  const expenses = await one<RawExpense>(
    "expenses",
    expensesQuery(withCode),
    "date",
    undefined,
    withCode
      ? ""
      : "; Expense.accountingCode hidden from this app (scope), accountName null",
  );
  const reimbursement = new Map<string, ReimbursementStatus>();
  if (expenses.some((x) => x.reimbursableTo?.id)) {
    try {
      for (const status of ["PENDING_REIMBURSEMENT", "PAID"] as const) {
        const page = await paginate<
          { id: string },
          { expenses: Connection<{ id: string }> }
        >(client, EXPENSE_STATUS_QUERY, { ...vars, status }, (d) => d.expenses);
        for (const n of page.nodes) reimbursement.set(n.id, status);
      }
    } catch (e) {
      // Statuses unknown -> every reimbursementStatus stays null and the expenses run cannot claim completeness.
      reimbursement.clear();
      const run = runs.find((r) => r.object === "expenses");
      if (run)
        run.result = withExtra(
          run.result,
          `expenses: reimbursement status unavailable (${e instanceof Error ? e.message : String(e)})`,
        );
    }
  }

  // Jobs: every job referenced by the period's entries, visits, quotes, invoices and expenses, fetched by id.
  const wanted = new Set<string>(entryJobIds);
  for (const v of visits) wanted.add(v.job.id);
  for (const q of [...quotes, ...invoices])
    for (const j of q.jobs?.nodes ?? []) wanted.add(j.id);
  for (const x of expenses) if (x.linkedJob?.id) wanted.add(x.linkedJob.id);
  const ids = [...wanted].sort();
  const jobs: RawJob[] = [];
  const startedAt = now().toISOString();
  const method = `jobber-graphql jobs(ids: ${ids.length} referenced in period) first:${PAGE_SIZE}`;
  try {
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const chunk = ids.slice(i, i + PAGE_SIZE);
      const page = await paginate<RawJob, { jobs: Connection<RawJob> }>(
        client,
        JOBS_BY_ID_QUERY,
        { ids: chunk },
        (d) => d.jobs,
      );
      jobs.push(...page.nodes);
    }
    const got = new Set(jobs.map((j) => j.id));
    const missing = ids.filter((id) => !got.has(id));
    runs.push({
      object: "jobs",
      method,
      startedAt,
      result: {
        pulled: got.size,
        expected: ids.length,
        complete: missing.length === 0,
        error: missing.length
          ? `jobs: ${missing.length} referenced job ids not returned: ${missing.slice(0, 10).join(", ")}`
          : null,
      },
    });
  } catch (e) {
    runs.push({ object: "jobs", method, startedAt, result: failed(e) });
  }

  // Quotes of in-scope jobs (converted quotes are rarely "sent"): added beside the sentAt-range quotes,
  // with the job as jobId. Complete by construction: each comes from a job that was fetched.
  const quoteRecords = quotes.map((r) => normalizeQuote(r, companyId));
  const seenQuotes = new Set(quotes.map((q) => q.id));
  let viaJobs = 0;
  for (const j of jobs) {
    if (!j.quote || seenQuotes.has(j.quote.id)) continue;
    seenQuotes.add(j.quote.id);
    viaJobs++;
    quoteRecords.push({
      ...normalizeQuote({ ...j.quote, jobs: null }, companyId),
      jobId: jobberRef(j.id),
    });
  }
  const quoteRun = runs.find((r) => r.object === "quotes");
  if (quoteRun && viaJobs) {
    quoteRun.method += ` + quotes of ${viaJobs} in-scope job(s)`;
    quoteRun.result = {
      ...quoteRun.result,
      pulled: quoteRun.result.pulled + viaJobs,
      expected:
        quoteRun.result.expected === null
          ? null
          : quoteRun.result.expected + viaJobs,
    };
  }

  return {
    records: {
      jobs: jobs.map((r) => normalizeJob(r, companyId)),
      visits: visits.map((r) => normalizeVisit(r, companyId)),
      quotes: quoteRecords,
      invoices: invoices.map((r) => normalizeInvoice(r, companyId)),
      payments: payments.map((r) => normalizePayment(r, companyId)),
      expenses: expenses.map((r) =>
        normalizeExpense(r, companyId, reimbursement),
      ),
    },
    runs,
  };
}
