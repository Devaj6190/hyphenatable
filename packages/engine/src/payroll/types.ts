// Local mirror of shared-context section 6 for the payroll math, until the contract PR (#15,
// packages/engine/src/schemas.ts) merges; then these become re-exports of the zod types.
// Only the records the payroll reads are mirrored. Money is integer cents; instants are ISO UTC.

export type Company = {
  id: string;
  name: string;
  kind: "synthetic" | "real";
  payFrequency: "weekly" | "biweekly";
  timezone: string;
  settings: {
    longShiftHours: number;
    otWeeklyHours: number;
    grossChangePct: number;
    employeesMayBeTexted: boolean;
  };
};

export type Worker = {
  id: string;
  companyId: string;
  displayName: string;
  role: "field" | "manager" | "owner" | "office";
  payType: "hourly" | "salary" | "contractor_venmo" | "commission";
  status: "active" | "inactive";
  managerId: string | null;
  contactRef: string | null;
  jobber: {
    userId: string;
    labourRateCents: number | null;
    status: string;
  } | null;
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
};

export type Cycle = {
  id: string;
  companyId: string;
  number: number;
  periodStart: string;
  periodEnd: string;
  cutoffAt: string;
  stage: string;
  gustoPayrollId: string | null;
  gustoOffCyclePayrollId: string | null;
  questionsAsked: number;
};

export type TimeEntry = {
  id: string;
  companyId: string;
  cycleId: string | null;
  sourceId: string;
  workerId: string;
  jobId: string | null;
  visitId: string | null;
  startAt: string;
  endAt: string | null;
  durationSec: number;
  ticking: boolean;
  /** null: not in the source (real exports). */
  approved: boolean | null;
  approvedBy: string | null;
  payable: boolean | null;
  category: string | null;
  label: string | null;
  hasNote: boolean;
};

export type Expense = {
  id: string;
  companyId: string;
  source: "qbo" | "jobber" | "venmo";
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
  /** Jobber only; proposed in STATUS (A1, 02:20) and in contract PR #15. Absent = null. */
  reimbursableToWorkerId?: string | null;
  reimbursementStatus?: string | null;
};

export type RuleType =
  | "overtime_policy"
  | "pay_rate"
  | "venmo_rate"
  | "long_shift_threshold"
  | "expense_account_kind"
  | "vendor_job_hint"
  | "disposal_parent_link"
  | "in_person_quoter"
  | "commission_plan"
  | "tip_policy"
  | "manager_split"
  | "routing"
  | "worker_mapping"
  | "deposit_vs_final"
  | "catch_all_threshold";

/** The payroll reads only these fields of a Rule. */
export type Rule = {
  id: string;
  companyId: string;
  type: RuleType;
  params: Record<string, unknown>;
  status: "proposed" | "active" | "off";
};

/** The payroll reads only these fields of a Flag. */
export type FlagRef = {
  id: string;
  checkId: string;
  status: string;
  subject: { workerId: string | null; entryIds: string[] };
};

export type HourlyName = "Regular Hours" | "Overtime" | "Double Overtime";
export type FixedName =
  | "Bonus"
  | "Commission"
  | "Paycheck Tips"
  | "Cash Tips"
  | "Reimbursement"
  | "Correction Payment";

export type DraftLine = {
  workerId: string;
  excluded: boolean;
  hourly: { name: HourlyName; hours: number }[];
  fixed: { name: FixedName; amountCents: number }[];
  memo: string | null;
  heldFlagIds: string[];
};

export type VenmoRow = {
  workerId: string;
  hours: number;
  rateCents: number;
  amountCents: number;
};

export type Draft = {
  id: string;
  companyId: string;
  cycleId: string;
  stage: 1 | 2;
  lines: DraftLine[];
  venmoList: VenmoRow[];
  workbookVersion: number;
  gustoPayrollId: string | null;
  status: "computed" | "approved" | "filled" | "calculated";
  totals: { grossCents: number; hours: number };
};

// ── Stage 1 outputs beside the Draft (not contract tables) ────────────────────

/** One earning as PayrollPilot computed it: unrounded seconds in, cents rounded half-up once. */
export type Earning = {
  name: HourlyName | "Salary" | "Venmo Hours";
  seconds: number | null;
  hours: number | null;
  rateCents: number;
  multiplier: number;
  amountCents: number;
};

/** Per-worker money, so the workbook, CHK-22 and the M4 backtest can read gross without Gusto. */
export type WorkerPay = {
  workerId: string;
  kind: "hourly" | "salary" | "venmo" | "none";
  rateCents: number | null;
  rateSource: string | null;
  earnings: Earning[];
  reimbursementCents: number;
  /** Wages only (earnings), excluding reimbursements. 0 when excluded. */
  grossCents: number;
  excluded: boolean;
  /** Why the worker is excluded or held, in plain words with ids; null when paid in full. */
  reason: string | null;
};

export type Stage1Options = {
  /** Timezone and pay frequency come from the Company. */
  company: Pick<Company, "id" | "timezone" | "payFrequency">;
  /** Entries whose flags are held; never paid in this draft. */
  heldEntryIds?: string[];
  /** Optional: held flags, to fill `heldFlagIds`. A held flag with a workerId and no entryIds holds the whole worker. */
  heldFlags?: FlagRef[];
  /** Jobber expenses for reimbursement lines. */
  expenses?: Expense[];
  draftId?: string;
  workbookVersion?: number;
};

export type Stage1Result = {
  draft: Draft;
  explain: Record<string, string[]>;
  pay: Record<string, WorkerPay>;
};

// ── Stage 2 inputs (section 6 mirrors) ───────────────────────────────────────

export type Job = {
  id: string;
  companyId: string;
  sourceId: string;
  jobNumber: number;
  title: string;
  clientRef: string;
  status: string;
  salespersonWorkerId: string | null;
  quoteId: string | null;
  parentJobId: string | null;
  startAt: string | null;
  endAt: string | null;
  totalCents: number | null;
};

export type Quote = {
  id: string;
  companyId: string;
  sourceId: string;
  jobId: string | null;
  salespersonWorkerId: string | null;
  sentAt: string | null;
  status: string;
  amountCents: number;
};

export type Invoice = {
  id: string;
  companyId: string;
  sourceId: string;
  jobId: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  status: string;
  totalCents: number | null;
};

export type Payment = {
  id: string;
  companyId: string;
  sourceId: string;
  invoiceId: string | null;
  quoteId: string | null;
  entryDate: string;
  amountCents: number;
  paymentType: string;
  kind: "deposit" | "final" | "unknown";
};
