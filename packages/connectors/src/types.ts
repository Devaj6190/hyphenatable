// Local mirror of the shared-context section 6 shapes the connectors emit.
// When packages/engine/src/schemas.ts lands (B-02), these become type re-exports of it.
// Ids outside Convex are strings. Connector ids are `<source>:<upstream id>`; `sourceId` is the upstream id.
// Fields the source cannot know are null (never a default): see `role`, `payType` on Jobber workers.

export type Source = "jobber" | "qbo" | "gusto" | "export" | "browser";

export interface SyncRun {
  id: string;
  companyId: string;
  cycleId: string | null;
  source: Source;
  object: string;
  startedAt: string;
  finishedAt: string | null;
  pulled: number;
  expected: number | null;
  complete: boolean;
  method: string;
  error: string | null;
}

/** Worker as known to Jobber. role / payType are not Jobber facts, so they stay null until config or Gusto fills them. */
export interface Worker {
  id: string;
  companyId: string;
  displayName: string;
  role: "field" | "manager" | "owner" | "office" | null;
  payType: "hourly" | "salary" | "contractor_venmo" | "commission" | null;
  status: "active" | "inactive";
  managerId: string | null;
  contactRef: string | null;
  jobber: { userId: string; labourRateCents: number | null; status: string } | null;
  gusto: {
    employeeUuid: string | null;
    contractorUuid: string | null;
    jobUuid: string | null;
    rateCents: number | null;
    paymentUnit: string | null;
    flsaStatus: string | null;
    onboarded: boolean | null;
  } | null;
  venmoRateCents: number | null;
}

export interface TimeEntry {
  id: string;
  companyId: string;
  cycleId: string | null;
  sourceId: string;
  /** null only when Jobber returns an entry with no user; never guessed. */
  workerId: string | null;
  jobId: string | null;
  visitId: string | null;
  startAt: string;
  endAt: string | null;
  durationSec: number;
  ticking: boolean;
  approved: boolean;
  approvedBy: string | null;
  payable: boolean;
  category: string | null;
  label: string | null;
  hasNote: boolean;
}

// Money fields below are null only when the source omits them (Invoice.amounts, Expense.total are nullable in Jobber).

export interface Job {
  id: string;
  companyId: string;
  sourceId: string;
  jobNumber: number;
  title: string | null;
  /** `jobber:<clientId>`: an opaque id, never the client's name. */
  clientRef: string;
  status: string;
  salespersonWorkerId: string | null;
  quoteId: string | null;
  /** Jobber has no parent / sub-job link: always null from the connector. */
  parentJobId: string | null;
  startAt: string | null;
  endAt: string | null;
  totalCents: number | null;
}

export interface Visit {
  id: string;
  companyId: string;
  jobId: string;
  sourceId: string;
  startAt: string | null;
  endAt: string | null;
  isComplete: boolean;
  assignedWorkerIds: string[];
}

export interface Quote {
  id: string;
  companyId: string;
  sourceId: string;
  jobId: string | null;
  salespersonWorkerId: string | null;
  sentAt: string | null;
  status: string;
  amountCents: number | null;
}

export interface Invoice {
  id: string;
  companyId: string;
  sourceId: string;
  jobId: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  status: string;
  totalCents: number | null;
}

export interface Payment {
  id: string;
  companyId: string;
  sourceId: string;
  invoiceId: string | null;
  quoteId: string | null;
  entryDate: string;
  amountCents: number | null;
  paymentType: string | null;
  kind: "deposit" | "final" | "unknown";
}

export interface Expense {
  id: string;
  companyId: string;
  source: "qbo" | "jobber";
  sourceId: string;
  date: string;
  amountCents: number | null;
  vendor: string | null;
  description: string | null;
  accountName: string | null;
  customerRef: string | null;
  paymentType: string | null;
  kind: "job_cost" | "overhead" | "unknown";
  matchedJobId: string | null;
  matchConfidence: number | null;
}
