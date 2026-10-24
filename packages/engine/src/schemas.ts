// Contract: shared-context section 6 (records) and plan B 4.4 (agent outputs).
// apps/web/convex/schema.ts mirrors the records 1:1; zod is the source. Change only by a `contract:` PR.
// Money is integer cents. Instants are ISO 8601 UTC. Ids are strings here, Convex ids inside Convex.
import { z } from "zod";

const Id = z.string().min(1);
const Cents = z.number().int();
/** An instant, ISO 8601 UTC with a Z offset. */
const Instant = z.iso.datetime();
/** A calendar day (2026-10-05) or a UTC instant; sources disagree, both are allowed. */
const Day = z.union([z.iso.date(), z.iso.datetime()]);
const Json = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const nul = <T extends z.ZodType>(t: T) => t.nullable();

// ── Enums ────────────────────────────────────────────────────────────────────
export const CycleStage = z.enum([
  "setup",
  "syncing",
  "checking",
  "asking",
  "gate1_ready",
  "stage1_filled",
  "reconciling",
  "gate2_ready",
  "stage2_filled",
  "closed",
]);
export const SyncSource = z.enum([
  "jobber",
  "qbo",
  "gusto",
  "export",
  "browser",
]);
export const CheckId = z.enum([
  "CHK-01",
  "CHK-02",
  "CHK-03",
  "CHK-04",
  "CHK-05",
  "CHK-06",
  "CHK-07",
  "CHK-08",
  "CHK-09",
  "CHK-10",
  "CHK-11",
  "CHK-12",
  "CHK-13",
  "CHK-14",
  "CHK-15",
  "CHK-16",
  "CHK-17",
  "CHK-18",
  "CHK-19",
  "CHK-20",
  "CHK-21",
  "CHK-22",
  "CHK-23",
]);
export const FlagStatus = z.enum([
  "open",
  "asked",
  "answered",
  "corrected",
  "dismissed",
  "held",
]);
export const RouteTo = z.enum(["owner", "manager", "none"]);
export const ToRole = z.enum(["owner", "manager", "employee"]);
export const QuestionStatus = z.enum([
  "draft",
  "approved",
  "sent",
  "reminded",
  "answered",
  "expired",
  "denied",
]);
export const MessageKind = z.enum(["text", "poll", "poll_vote", "reaction"]);
export const InterpretationKind = z.enum([
  "confirm",
  "change",
  "fixed_in_source",
  "escalate",
  "ambiguous",
  "stop",
]);
export const CorrectionStatus = z.enum([
  "proposed",
  "approved",
  "applied",
  "rejected",
]);
export const CorrectionSource = z.enum(["reply", "owner", "rule"]);
export const RuleType = z.enum([
  "overtime_policy",
  "pay_rate",
  "venmo_rate",
  "long_shift_threshold",
  "expense_account_kind",
  "vendor_job_hint",
  "disposal_parent_link",
  "in_person_quoter",
  "commission_plan",
  "tip_policy",
  "manager_split",
  "routing",
  "worker_mapping",
  "deposit_vs_final",
  "catch_all_threshold",
]);
export const RuleStatus = z.enum(["proposed", "active", "off"]);
export const RuleSource = z.enum(["history", "owner_stated", "answer"]);
export const LessonStatus = z.enum([
  "new",
  "confirmed",
  "superseded",
  "conflict",
  "promoted",
  "rejected",
]);
export const DraftStatus = z.enum([
  "computed",
  "approved",
  "filled",
  "calculated",
]);
export const HourlyName = z.enum([
  "Regular Hours",
  "Overtime",
  "Double Overtime",
]);
export const FixedName = z.enum([
  "Bonus",
  "Commission",
  "Paycheck Tips",
  "Cash Tips",
  "Reimbursement",
  "Correction Payment",
]);
export const AgentName = z.enum(["analyst", "auditor", "messenger"]);

// ── Records (section 6) ──────────────────────────────────────────────────────
export const Company = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(["synthetic", "real"]),
  payFrequency: z.enum(["weekly", "biweekly"]),
  timezone: z.string(),
  settings: z.object({
    longShiftHours: z.number(),
    otWeeklyHours: z.number(),
    grossChangePct: z.number(),
    employeesMayBeTexted: z.boolean(),
  }),
});

export const Worker = z.object({
  id: Id,
  companyId: Id,
  displayName: z.string(),
  role: z.enum(["field", "manager", "owner", "office"]),
  payType: z.enum(["hourly", "salary", "contractor_venmo", "commission"]),
  status: z.enum(["active", "inactive"]),
  managerId: nul(Id),
  /** Opaque key the courier maps to a phone; never a number. */
  contactRef: nul(z.string()),
  jobber: nul(
    z.object({
      userId: z.string(),
      labourRateCents: nul(Cents),
      status: z.string(),
    }),
  ),
  gusto: nul(
    z.object({
      employeeUuid: nul(z.string()),
      contractorUuid: nul(z.string()),
      jobUuid: nul(z.string()),
      rateCents: nul(Cents),
      paymentUnit: nul(z.string()),
      flsaStatus: nul(z.string()),
      onboarded: nul(z.boolean()),
    }),
  ),
  venmoRateCents: nul(Cents),
});

export const Cycle = z.object({
  id: Id,
  companyId: Id,
  number: z.number().int(),
  periodStart: Day,
  periodEnd: Day,
  cutoffAt: Instant,
  stage: CycleStage,
  gustoPayrollId: nul(z.string()),
  gustoOffCyclePayrollId: nul(z.string()),
  questionsAsked: z.number().int(),
});

export const SyncRun = z.object({
  id: Id,
  companyId: Id,
  cycleId: nul(Id),
  source: SyncSource,
  object: z.string(),
  startedAt: Instant,
  finishedAt: nul(Instant),
  pulled: z.number().int(),
  expected: nul(z.number().int()),
  complete: z.boolean(),
  method: z.string(),
  error: nul(z.string()),
});

export const TimeEntry = z.object({
  id: Id,
  companyId: Id,
  cycleId: Id,
  sourceId: z.string(),
  workerId: Id,
  jobId: nul(Id),
  visitId: nul(Id),
  startAt: Instant,
  endAt: nul(Instant),
  durationSec: z.number().int(),
  ticking: z.boolean(),
  approved: z.boolean(),
  approvedBy: nul(z.string()),
  payable: z.boolean(),
  /** Jobber timeSheetCategory: BREAK, DRIVING, OFFICE, SUPPLIES, GENERAL, CUSTOM. */
  category: z.string(),
  label: nul(z.string()),
  hasNote: z.boolean(),
});

export const Job = z.object({
  id: Id,
  companyId: Id,
  sourceId: z.string(),
  jobNumber: z.number().int(),
  title: z.string(),
  /** Opaque client id, never a client name. */
  clientRef: z.string(),
  status: z.string(),
  salespersonWorkerId: nul(Id),
  quoteId: nul(Id),
  parentJobId: nul(Id),
  startAt: nul(Instant),
  endAt: nul(Instant),
  totalCents: nul(Cents),
});

export const Visit = z.object({
  id: Id,
  companyId: Id,
  jobId: Id,
  sourceId: z.string(),
  startAt: Instant,
  endAt: nul(Instant),
  isComplete: z.boolean(),
  assignedWorkerIds: z.array(Id),
});

export const Quote = z.object({
  id: Id,
  companyId: Id,
  sourceId: z.string(),
  jobId: nul(Id),
  salespersonWorkerId: nul(Id),
  sentAt: nul(Instant),
  status: z.string(),
  amountCents: Cents,
});

export const Invoice = z.object({
  id: Id,
  companyId: Id,
  sourceId: z.string(),
  jobId: nul(Id),
  issuedDate: nul(Day),
  dueDate: nul(Day),
  status: z.string(),
  totalCents: Cents,
});

export const Payment = z.object({
  id: Id,
  companyId: Id,
  sourceId: z.string(),
  invoiceId: nul(Id),
  quoteId: nul(Id),
  entryDate: Day,
  amountCents: Cents,
  paymentType: z.string(),
  kind: z.enum(["deposit", "final", "unknown"]),
});

export const Expense = z.object({
  id: Id,
  companyId: Id,
  source: z.enum(["qbo", "jobber"]),
  sourceId: z.string(),
  date: Day,
  amountCents: Cents,
  vendor: nul(z.string()),
  description: nul(z.string()),
  accountName: nul(z.string()),
  customerRef: nul(z.string()),
  paymentType: nul(z.string()),
  kind: z.enum(["job_cost", "overhead", "unknown"]),
  matchedJobId: nul(Id),
  matchConfidence: nul(z.number().min(0).max(1)),
});

export const Flag = z.object({
  id: Id,
  companyId: Id,
  cycleId: Id,
  checkId: CheckId,
  status: FlagStatus,
  subject: z.object({
    workerId: nul(Id),
    jobId: nul(Id),
    entryIds: z.array(Id),
    expenseIds: z.array(Id),
  }),
  /** One plain sentence, ids not names. */
  seen: z.string(),
  where: z.array(
    z.object({
      system: z.string(),
      recordId: z.string(),
      url: nul(z.string()),
    }),
  ),
  /** "certain" for deterministic hits, else 0..1. */
  confidence: z.union([z.literal("certain"), z.number().min(0).max(1)]),
  /** note is "no precedent" when none. */
  precedent: nul(
    z.object({ ruleId: nul(Id), flagId: nul(Id), note: z.string() }),
  ),
  routeTo: RouteTo,
  affects: z.object({
    workerId: nul(Id),
    jobId: nul(Id),
    dollarsCents: nul(Cents),
  }),
  questionId: nul(Id),
  correctionId: nul(Id),
});

export const Question = z.object({
  id: Id,
  companyId: Id,
  cycleId: Id,
  flagIds: z.array(Id),
  toWorkerId: Id,
  toRole: ToRole,
  text: z.string(),
  options: nul(z.array(z.string())),
  kind: z.enum(["text", "poll"]),
  status: QuestionStatus,
  approvedBy: nul(z.string()),
  approvedAt: nul(Instant),
  sentAt: nul(Instant),
  remindAt: nul(Instant),
  expiresAt: nul(Instant),
  interpretationId: nul(Id),
});

export const Message = z.object({
  id: Id,
  companyId: Id,
  /** sha256(phone), computed in the courier; the phone never leaves it. */
  conversationKey: z.string(),
  direction: z.enum(["out", "in"]),
  text: z.string(),
  providerId: nul(z.string()),
  at: Instant,
  questionId: nul(Id),
  kind: MessageKind,
});

/** Section 6 omits companyId here; added because section 6 also says every record has one. */
export const Interpretation = z.object({
  id: Id,
  companyId: Id,
  questionId: Id,
  messageId: Id,
  result: z.object({
    kind: InterpretationKind,
    optionIndex: nul(z.number().int()),
    values: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  confidence: z.number().min(0).max(1),
  model: z.string(),
  needsFollowUp: z.boolean(),
});

export const Correction = z.object({
  id: Id,
  companyId: Id,
  cycleId: Id,
  flagId: Id,
  target: z.object({ table: z.string(), id: Id, field: z.string() }),
  before: Json,
  after: Json,
  effectPayCents: Cents,
  effectProfitCents: Cents,
  status: CorrectionStatus,
  source: CorrectionSource,
  approvedBy: nul(z.string()),
  approvedAt: nul(Instant),
});

export const Rule = z.object({
  id: Id,
  companyId: Id,
  type: RuleType,
  params: z.record(z.string(), z.unknown()),
  status: RuleStatus,
  source: RuleSource,
  provenance: z.object({
    lessonId: nul(Id),
    flagId: nul(Id),
    answeredBy: nul(z.string()),
    approvedBy: nul(z.string()),
    approvedAt: nul(Instant),
    evidence: z.array(z.string()),
  }),
  backtest: nul(
    z.object({
      cycles: z.number().int(),
      agree: z.number().int(),
      disagree: z.number().int(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export const Lesson = z.object({
  id: Id,
  companyId: Id,
  text: z.string(),
  structured: z.object({
    ruleType: nul(RuleType),
    params: z.record(z.string(), z.unknown()),
  }),
  embedding: z.array(z.number()),
  status: LessonStatus,
  relatedLessonIds: z.array(Id),
  evaluation: nul(
    z.object({
      expected: z.string(),
      actual: z.string(),
      source: z.enum(["answer", "answer_key", "paid"]),
    }),
  ),
  createdFrom: z.object({
    flagId: nul(Id),
    questionId: nul(Id),
    messageId: nul(Id),
  }),
});

export const DraftLine = z.object({
  workerId: Id,
  excluded: z.boolean(),
  hourly: z.array(z.object({ name: HourlyName, hours: z.number().min(0) })),
  fixed: z.array(z.object({ name: FixedName, amountCents: Cents })),
  memo: nul(z.string()),
  heldFlagIds: z.array(Id),
});

export const Draft = z.object({
  id: Id,
  companyId: Id,
  cycleId: Id,
  stage: z.union([z.literal(1), z.literal(2)]),
  lines: z.array(DraftLine),
  venmoList: z.array(
    z.object({
      workerId: Id,
      hours: z.number().min(0),
      rateCents: Cents,
      amountCents: Cents,
    }),
  ),
  workbookVersion: z.number().int(),
  gustoPayrollId: nul(z.string()),
  status: DraftStatus,
  totals: z.object({ grossCents: Cents, hours: z.number().min(0) }),
});

/** Append-only, never edited. */
export const AuditEvent = z.object({
  id: Id,
  companyId: Id,
  cycleId: nul(Id),
  at: Instant,
  actor: z.object({
    kind: z.enum(["system", "agent", "user"]),
    id: z.string(),
    agent: nul(AgentName),
  }),
  type: z.string(),
  summary: z.string(),
  refs: z.record(z.string(), z.string()),
  data: z.unknown().nullable(),
});

export const AccessEvent = z.object({
  id: Id,
  companyId: Id,
  at: Instant,
  userId: z.string(),
  action: z.enum(["view", "export"]),
  what: z.string(),
});

// ── Agent outputs (plan B 4.4); every one is a proposal, never an action ─────
const Params = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

export const ProposedRule = z.object({
  type: RuleType,
  params: Params,
  statement: z.string().max(200),
  evidence: z.array(z.string()).min(1),
  seenInCycles: z.number().int().min(0),
  ofCycles: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
});
export const ProposedRules = z.object({
  rules: z.array(ProposedRule).max(30),
  missing: z
    .array(
      z.object({ question: z.string().max(200), why: z.string().max(200) }),
    )
    .max(15),
});

export const LessonClassification = z.object({
  kind: z.enum(["new", "confirmed", "superseded", "conflict"]),
  /** Required unless kind = new; enforced by code after parse. */
  relatedLessonId: nul(z.string()),
  ruleType: nul(RuleType),
  params: nul(Params),
  reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
});

export const MatchDecision = z.object({
  kind: z.enum(["match", "no_match", "ask"]),
  jobId: nul(z.string()),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(160),
});

export const ExpenseKind = z.object({
  kind: z.enum(["job_cost", "overhead", "unknown"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(120),
});

export const QuestionDraft = z.object({
  /** Never a dollar amount; checked by code after parse. */
  text: z.string().max(240),
  options: nul(z.array(z.string().max(40)).max(4)),
  kind: z.enum(["text", "poll"]),
  toRole: ToRole,
  reason: z.string().max(160),
});

/** Plan B 4.4 calls this `Interpretation`; renamed so it does not collide with the record. */
export const InterpretationOutput = z.object({
  kind: InterpretationKind,
  optionIndex: nul(z.number().int().min(0).max(3)),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  confidence: z.number().min(0).max(1),
  needsFollowUp: z.boolean(),
  followUpText: nul(z.string().max(240)),
});

export const CorrectionProposal = z.object({
  target: z.object({
    table: z.enum(["timeEntries", "expenses", "workers", "jobs", "payments"]),
    id: z.string(),
    field: z.string(),
  }),
  before: Json,
  after: Json,
  reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
});

// ── Types ────────────────────────────────────────────────────────────────────
export type Company = z.infer<typeof Company>;
export type Worker = z.infer<typeof Worker>;
export type Cycle = z.infer<typeof Cycle>;
export type SyncRun = z.infer<typeof SyncRun>;
export type TimeEntry = z.infer<typeof TimeEntry>;
export type Job = z.infer<typeof Job>;
export type Visit = z.infer<typeof Visit>;
export type Quote = z.infer<typeof Quote>;
export type Invoice = z.infer<typeof Invoice>;
export type Payment = z.infer<typeof Payment>;
export type Expense = z.infer<typeof Expense>;
export type Flag = z.infer<typeof Flag>;
export type Question = z.infer<typeof Question>;
export type Message = z.infer<typeof Message>;
export type Interpretation = z.infer<typeof Interpretation>;
export type Correction = z.infer<typeof Correction>;
export type Rule = z.infer<typeof Rule>;
export type RuleType = z.infer<typeof RuleType>;
export type Lesson = z.infer<typeof Lesson>;
export type DraftLine = z.infer<typeof DraftLine>;
export type Draft = z.infer<typeof Draft>;
export type AuditEvent = z.infer<typeof AuditEvent>;
export type AccessEvent = z.infer<typeof AccessEvent>;
export type CheckId = z.infer<typeof CheckId>;
export type ProposedRule = z.infer<typeof ProposedRule>;
export type ProposedRules = z.infer<typeof ProposedRules>;
export type LessonClassification = z.infer<typeof LessonClassification>;
export type MatchDecision = z.infer<typeof MatchDecision>;
export type ExpenseKind = z.infer<typeof ExpenseKind>;
export type QuestionDraft = z.infer<typeof QuestionDraft>;
export type InterpretationOutput = z.infer<typeof InterpretationOutput>;
export type CorrectionProposal = z.infer<typeof CorrectionProposal>;
