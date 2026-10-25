// Hand-written synthetic records for check tests. Every builder parses through the zod
// schema, so a fixture that drifts from the contract fails loudly.
import { sample } from "../../__fixtures__/sample";
import {
  Company,
  Cycle,
  Expense,
  Flag,
  Invoice,
  Job,
  Payment,
  Quote,
  Rule,
  SyncRun,
  TimeEntry,
  Visit,
  Worker,
} from "../../schemas";
import type { CheckInput } from "../types";

export const company = (over: Partial<Company> = {}): Company =>
  Company.parse({
    id: "co_a",
    name: "Synthetic Co A",
    kind: "synthetic",
    payFrequency: "weekly",
    timezone: "America/Los_Angeles",
    settings: {
      longShiftHours: 12,
      otWeeklyHours: 40,
      grossChangePct: 25,
      employeesMayBeTexted: false,
      lowMarginPct: 20,
    },
    ...over,
  });

export const cycle = (over: Partial<Cycle> = {}): Cycle =>
  Cycle.parse({
    id: "cy_1",
    companyId: "co_a",
    number: 1,
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    cutoffAt: "2026-10-12T16:00:00Z",
    stage: "checking",
    gustoPayrollId: null,
    gustoOffCyclePayrollId: null,
    questionsAsked: 0,
    ...over,
  });

/** An approved, closed 8 h job entry on 2026-10-07 08:00 PDT. */
export const entry = (over: Partial<TimeEntry> & { id: string }): TimeEntry =>
  TimeEntry.parse({
    companyId: "co_a",
    cycleId: "cy_1",
    sourceId: `jobber_${over.id}`,
    workerId: "w_01",
    jobId: "job_01",
    visitId: "vis_01",
    startAt: "2026-10-07T15:00:00Z",
    endAt: "2026-10-07T23:00:00Z",
    durationSec: 8 * 3600,
    ticking: false,
    approved: true,
    approvedBy: "user_owner",
    payable: true,
    category: "GENERAL",
    label: null,
    hasNote: false,
    ...over,
  });

export const rule = (over: Partial<Rule> & { id: string }): Rule =>
  Rule.parse({
    companyId: "co_a",
    type: "long_shift_threshold",
    params: {},
    status: "active",
    source: "owner_stated",
    provenance: {
      lessonId: null,
      flagId: null,
      answeredBy: null,
      approvedBy: "user_owner",
      approvedAt: "2026-10-01T16:00:00Z",
      evidence: [],
    },
    backtest: null,
    confidence: 1,
    ...over,
  });

export const input = (
  timeEntries: TimeEntry[],
  over: Partial<CheckInput> = {},
): CheckInput => ({
  company: company(),
  cycle: cycle(),
  workers: [],
  timeEntries,
  jobs: [],
  visits: [],
  quotes: [],
  invoices: [],
  payments: [],
  expenses: [],
  pastCycles: { gross: {} },
  rules: [],
  ...over,
});

/** Parses every flag against the contract; use on all check output in tests. */
export const valid = (flags: Flag[]): Flag[] => flags.map((f) => Flag.parse(f));

export const worker = (over: Partial<Worker> = {}): Worker =>
  Worker.parse({ ...sample.workers[1], id: "w_01", role: "field", ...over });
export const syncRun = (over: Partial<SyncRun> = {}): SyncRun =>
  SyncRun.parse({
    id: "sync_1",
    companyId: "co_a",
    cycleId: "cy_1",
    source: "jobber",
    object: "timeEntries",
    startedAt: "2026-10-12T16:00:00Z",
    finishedAt: "2026-10-12T16:01:00Z",
    pulled: 9,
    expected: 10,
    complete: false,
    method: "fixture",
    error: null,
    ...over,
  });

/** A top-level job running on 2026-10-07. */
export const job = (over: Partial<Job> & { id: string }): Job =>
  Job.parse({
    companyId: "co_a",
    sourceId: `jobber_${over.id}`,
    jobNumber: 1,
    title: "Front yard sod install - Larkspur Ln",
    clientRef: "cl_1",
    status: "active",
    salespersonWorkerId: null,
    quoteId: null,
    parentJobId: null,
    startAt: "2026-10-07T15:00:00Z",
    endAt: "2026-10-07T23:00:00Z",
    totalCents: 100000,
    ...over,
  });

/** A completed visit on job_01, 2026-10-07 08:00-16:00 PDT, crew w_01. */
export const visit = (over: Partial<Visit> & { id: string }): Visit =>
  Visit.parse({
    companyId: "co_a",
    jobId: "job_01",
    sourceId: `jobber_${over.id}`,
    startAt: "2026-10-07T15:00:00Z",
    endAt: "2026-10-07T23:00:00Z",
    isComplete: true,
    assignedWorkerIds: ["w_01"],
    ...over,
  });

/** A QuickBooks $214.37 materials purchase on 2026-10-07 matched to job_01. */
export const expense = (over: Partial<Expense> & { id: string }): Expense =>
  Expense.parse({
    companyId: "co_a",
    source: "qbo",
    sourceId: `qbo_${over.id}`,
    date: "2026-10-07",
    amountCents: 21437,
    vendor: "Cedar Creek Supply",
    description: "PVC fittings",
    accountName: "Materials",
    customerRef: null,
    paymentType: "CreditCard",
    kind: "job_cost",
    matchedJobId: "job_01",
    matchConfidence: 1,
    reimbursableToWorkerId: null,
    reimbursementStatus: null,
    ...over,
  });

export const quote = (over: Partial<Quote> & { id: string }): Quote =>
  Quote.parse({
    companyId: "co_a",
    sourceId: `jobber_${over.id}`,
    jobId: "job_01",
    salespersonWorkerId: "w_01",
    sentAt: "2026-10-06T17:00:00Z",
    status: "converted",
    amountCents: 100000,
    ...over,
  });

export const invoice = (over: Partial<Invoice> & { id: string }): Invoice =>
  Invoice.parse({
    companyId: "co_a",
    sourceId: `jobber_${over.id}`,
    jobId: "job_01",
    issuedDate: "2026-10-08",
    dueDate: "2026-10-22",
    status: "paid",
    totalCents: 100000,
    ...over,
  });

export const payment = (over: Partial<Payment> & { id: string }): Payment =>
  Payment.parse({
    companyId: "co_a",
    sourceId: `jobber_${over.id}`,
    invoiceId: "inv_1",
    quoteId: null,
    entryDate: "2026-10-09",
    amountCents: 100000,
    paymentType: "check",
    kind: "final",
    ...over,
  });
