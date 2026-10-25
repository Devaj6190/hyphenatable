// Contract: mirrors packages/engine/src/schemas.ts (zod is the source) field for field; `id` is Convex's `_id`.
// References are Convex ids; user ids (approvedBy, answeredBy, ...) and source-system ids are strings.
// schema.test.ts fails if a field drifts from the zod record. Change only by a `contract:` PR.

import { CheckId, RuleType } from "@payrollpilot/engine/schemas";
import { defineSchema, defineTable } from "convex/server";
import { type Validator, type VLiteral, v } from "convex/values";

const nul = <T extends Validator<unknown, "required", string>>(t: T) =>
  v.union(t, v.null());
const lit = <const T extends readonly [string, string, ...string[]]>(
  ...xs: T
) =>
  v.union(
    ...(xs.map((x) => v.literal(x)) as { [K in keyof T]: VLiteral<T[K]> }),
  );
const json = v.union(v.string(), v.number(), v.boolean(), v.null());

/** A zod enum's values as a Convex literal union, so the two can never list different values. */
const fromEnum = <T extends string>(e: { options: T[] }) =>
  lit(...(e.options as [T, T, ...T[]]));
const ruleType = fromEnum(RuleType);
const checkId = fromEnum(CheckId);

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    kind: lit("synthetic", "real"),
    payFrequency: lit("weekly", "biweekly"),
    timezone: v.string(),
    settings: v.object({
      longShiftHours: v.number(),
      otWeeklyHours: v.number(),
      grossChangePct: v.number(),
      employeesMayBeTexted: v.boolean(),
      lowMarginPct: v.number(),
    }),
  }),

  workers: defineTable({
    companyId: v.id("companies"),
    displayName: v.string(),
    role: lit("field", "manager", "owner", "office"),
    payType: lit("hourly", "salary", "contractor_venmo", "commission"),
    status: lit("active", "inactive"),
    managerId: nul(v.id("workers")),
    contactRef: nul(v.string()),
    jobber: nul(
      v.object({
        userId: v.string(),
        labourRateCents: nul(v.number()),
        status: v.string(),
      }),
    ),
    gusto: nul(
      v.object({
        employeeUuid: nul(v.string()),
        contractorUuid: nul(v.string()),
        jobUuid: nul(v.string()),
        rateCents: nul(v.number()),
        paymentUnit: nul(v.string()),
        flsaStatus: nul(v.string()),
        onboarded: nul(v.boolean()),
      }),
    ),
    venmoRateCents: nul(v.number()),
  }).index("by_company", ["companyId"]),

  cycles: defineTable({
    companyId: v.id("companies"),
    number: v.number(),
    periodStart: v.string(),
    periodEnd: v.string(),
    cutoffAt: v.string(),
    stage: lit(
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
    ),
    gustoPayrollId: nul(v.string()),
    gustoOffCyclePayrollId: nul(v.string()),
    questionsAsked: v.number(),
  }).index("by_company", ["companyId", "number"]),

  syncRuns: defineTable({
    companyId: v.id("companies"),
    cycleId: nul(v.id("cycles")),
    source: lit("jobber", "qbo", "gusto", "export", "browser"),
    object: v.string(),
    startedAt: v.string(),
    finishedAt: nul(v.string()),
    pulled: v.number(),
    expected: nul(v.number()),
    complete: v.boolean(),
    method: v.string(),
    error: nul(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId", "object"]),

  timeEntries: defineTable({
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    sourceId: v.string(),
    workerId: v.id("workers"),
    jobId: nul(v.id("jobs")),
    visitId: nul(v.id("visits")),
    startAt: v.string(),
    endAt: nul(v.string()),
    durationSec: v.number(),
    ticking: v.boolean(),
    approved: v.boolean(),
    approvedBy: nul(v.string()),
    payable: v.boolean(),
    category: v.string(),
    label: nul(v.string()),
    hasNote: v.boolean(),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId", "workerId"])
    .index("by_source", ["companyId", "sourceId"]),

  jobs: defineTable({
    companyId: v.id("companies"),
    sourceId: v.string(),
    jobNumber: v.number(),
    title: v.string(),
    clientRef: v.string(),
    status: v.string(),
    salespersonWorkerId: nul(v.id("workers")),
    quoteId: nul(v.id("quotes")),
    parentJobId: nul(v.id("jobs")),
    startAt: nul(v.string()),
    endAt: nul(v.string()),
    totalCents: nul(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_source", ["companyId", "sourceId"]),

  visits: defineTable({
    companyId: v.id("companies"),
    jobId: v.id("jobs"),
    sourceId: v.string(),
    startAt: v.string(),
    endAt: nul(v.string()),
    isComplete: v.boolean(),
    assignedWorkerIds: v.array(v.id("workers")),
  })
    .index("by_company", ["companyId"])
    .index("by_source", ["companyId", "sourceId"]),

  quotes: defineTable({
    companyId: v.id("companies"),
    sourceId: v.string(),
    jobId: nul(v.id("jobs")),
    salespersonWorkerId: nul(v.id("workers")),
    sentAt: nul(v.string()),
    status: v.string(),
    amountCents: nul(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_source", ["companyId", "sourceId"]),

  invoices: defineTable({
    companyId: v.id("companies"),
    sourceId: v.string(),
    jobId: nul(v.id("jobs")),
    issuedDate: nul(v.string()),
    dueDate: nul(v.string()),
    status: v.string(),
    totalCents: nul(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_source", ["companyId", "sourceId"]),

  payments: defineTable({
    companyId: v.id("companies"),
    sourceId: v.string(),
    invoiceId: nul(v.id("invoices")),
    quoteId: nul(v.id("quotes")),
    entryDate: v.string(),
    amountCents: nul(v.number()),
    paymentType: nul(v.string()),
    kind: lit("deposit", "final", "unknown"),
  })
    .index("by_company", ["companyId"])
    .index("by_source", ["companyId", "sourceId"]),

  expenses: defineTable({
    companyId: v.id("companies"),
    source: lit("qbo", "jobber"),
    sourceId: v.string(),
    date: v.string(),
    amountCents: nul(v.number()),
    vendor: nul(v.string()),
    description: nul(v.string()),
    accountName: nul(v.string()),
    customerRef: nul(v.string()),
    paymentType: nul(v.string()),
    kind: lit("job_cost", "overhead", "unknown"),
    matchedJobId: nul(v.id("jobs")),
    matchConfidence: nul(v.number()),
    reimbursableToWorkerId: nul(v.id("workers")),
    reimbursementStatus: nul(lit("PENDING_REIMBURSEMENT", "PAID")),
  })
    .index("by_company", ["companyId"])
    .index("by_source", ["companyId", "sourceId"]),

  flags: defineTable({
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    checkId,
    status: lit("open", "asked", "answered", "corrected", "dismissed", "held"),
    subject: v.object({
      workerId: nul(v.id("workers")),
      jobId: nul(v.id("jobs")),
      entryIds: v.array(v.id("timeEntries")),
      expenseIds: v.array(v.id("expenses")),
    }),
    seen: v.string(),
    where: v.array(
      v.object({
        system: v.string(),
        recordId: v.string(),
        url: nul(v.string()),
      }),
    ),
    confidence: v.union(v.literal("certain"), v.number()),
    precedent: nul(
      v.object({
        ruleId: nul(v.id("rules")),
        flagId: nul(v.id("flags")),
        note: v.string(),
      }),
    ),
    routeTo: lit("owner", "manager", "none"),
    affects: v.object({
      workerId: nul(v.id("workers")),
      jobId: nul(v.id("jobs")),
      dollarsCents: nul(v.number()),
    }),
    questionId: nul(v.id("questions")),
    correctionId: nul(v.id("corrections")),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId", "checkId"])
    .index("by_status", ["companyId", "status"]),

  questions: defineTable({
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    flagIds: v.array(v.id("flags")),
    toWorkerId: v.id("workers"),
    toRole: lit("owner", "manager", "employee"),
    text: v.string(),
    options: nul(v.array(v.string())),
    kind: lit("text", "poll"),
    status: lit(
      "draft",
      "approved",
      "sent",
      "reminded",
      "answered",
      "expired",
      "denied",
    ),
    approvedBy: nul(v.string()),
    approvedAt: nul(v.string()),
    sentAt: nul(v.string()),
    remindAt: nul(v.string()),
    expiresAt: nul(v.string()),
    interpretationId: nul(v.id("interpretations")),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId"])
    .index("by_status", ["companyId", "status"]),

  messages: defineTable({
    companyId: v.id("companies"),
    conversationKey: v.string(),
    direction: lit("out", "in"),
    text: v.string(),
    providerId: nul(v.string()),
    at: v.string(),
    questionId: nul(v.id("questions")),
    kind: lit("text", "poll", "poll_vote", "reaction"),
  })
    .index("by_company", ["companyId"])
    .index("by_conversation", ["conversationKey", "at"])
    .index("by_provider", ["providerId"]),

  interpretations: defineTable({
    companyId: v.id("companies"),
    questionId: v.id("questions"),
    messageId: v.id("messages"),
    result: v.object({
      kind: lit(
        "confirm",
        "change",
        "fixed_in_source",
        "escalate",
        "ambiguous",
        "stop",
      ),
      optionIndex: nul(v.number()),
      values: v.record(v.string(), v.union(v.string(), v.number())),
    }),
    confidence: v.number(),
    model: v.string(),
    needsFollowUp: v.boolean(),
  })
    .index("by_company", ["companyId"])
    .index("by_question", ["questionId"]),

  corrections: defineTable({
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    flagId: v.id("flags"),
    target: v.object({ table: v.string(), id: v.string(), field: v.string() }),
    before: json,
    after: json,
    effectPayCents: v.number(),
    effectProfitCents: v.number(),
    status: lit("proposed", "approved", "applied", "rejected"),
    source: lit("reply", "owner", "rule", "agent"),
    approvedBy: nul(v.string()),
    approvedAt: nul(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId"])
    .index("by_status", ["companyId", "status"]),

  rules: defineTable({
    companyId: v.id("companies"),
    type: ruleType,
    params: v.record(v.string(), v.any()),
    status: lit("proposed", "active", "off"),
    source: lit("history", "owner_stated", "answer"),
    provenance: v.object({
      lessonId: nul(v.id("lessons")),
      flagId: nul(v.id("flags")),
      answeredBy: nul(v.string()),
      approvedBy: nul(v.string()),
      approvedAt: nul(v.string()),
      evidence: v.array(v.string()),
    }),
    backtest: nul(
      v.object({ cycles: v.number(), agree: v.number(), disagree: v.number() }),
    ),
    confidence: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_status", ["companyId", "status", "type"]),

  lessons: defineTable({
    companyId: v.id("companies"),
    text: v.string(),
    structured: v.object({
      ruleType: nul(ruleType),
      params: v.record(v.string(), v.any()),
    }),
    embedding: v.array(v.float64()),
    status: lit(
      "new",
      "confirmed",
      "superseded",
      "conflict",
      "promoted",
      "rejected",
    ),
    relatedLessonIds: v.array(v.id("lessons")),
    evaluation: nul(
      v.object({
        expected: v.string(),
        actual: v.string(),
        source: lit("answer", "answer_key", "paid"),
      }),
    ),
    createdFrom: v.object({
      flagId: nul(v.id("flags")),
      questionId: nul(v.id("questions")),
      messageId: nul(v.id("messages")),
    }),
  })
    .index("by_company", ["companyId"])
    .index("by_status", ["companyId", "status"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["companyId"],
    }),

  drafts: defineTable({
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    stage: v.union(v.literal(1), v.literal(2)),
    lines: v.array(
      v.object({
        workerId: v.id("workers"),
        excluded: v.boolean(),
        hourly: v.array(
          v.object({
            name: lit("Regular Hours", "Overtime", "Double Overtime"),
            hours: v.number(),
          }),
        ),
        fixed: v.array(
          v.object({
            name: lit(
              "Bonus",
              "Commission",
              "Paycheck Tips",
              "Cash Tips",
              "Reimbursement",
              "Correction Payment",
            ),
            amountCents: v.number(),
          }),
        ),
        memo: nul(v.string()),
        heldFlagIds: v.array(v.id("flags")),
        explain: v.array(v.string()),
      }),
    ),
    venmoList: v.array(
      v.object({
        workerId: v.id("workers"),
        hours: v.number(),
        rateCents: v.number(),
        amountCents: v.number(),
      }),
    ),
    workbookVersion: v.number(),
    gustoPayrollId: nul(v.string()),
    status: lit("computed", "approved", "filled", "calculated"),
    totals: v.object({ grossCents: v.number(), hours: v.number() }),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId", "stage"]),

  pastPayrolls: defineTable({
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    sourceId: v.string(),
    workerId: v.id("workers"),
    paidVia: lit("gusto_regular", "gusto_off_cycle", "venmo"),
    earnings: v.array(
      v.object({
        name: v.string(),
        hours: nul(v.number()),
        rateCents: nul(v.number()),
        amountCents: v.number(),
      }),
    ),
    grossCents: v.number(),
  })
    .index("by_company", ["companyId", "workerId"])
    .index("by_cycle", ["cycleId"])
    .index("by_source", ["companyId", "sourceId"]),

  auditEvents: defineTable({
    companyId: v.id("companies"),
    cycleId: nul(v.id("cycles")),
    at: v.string(),
    actor: v.object({
      kind: lit("system", "agent", "user"),
      id: v.string(),
      agent: nul(lit("analyst", "auditor", "messenger")),
    }),
    type: v.string(),
    summary: v.string(),
    refs: v.record(v.string(), v.string()),
    data: v.union(v.any(), v.null()),
  })
    .index("by_company", ["companyId", "at"])
    .index("by_cycle", ["cycleId", "at"]),

  accessEvents: defineTable({
    companyId: v.id("companies"),
    at: v.string(),
    userId: v.string(),
    action: lit("view", "export"),
    what: v.string(),
  }).index("by_company", ["companyId", "at"]),

  creaoRuns: defineTable({
    companyId: v.id("companies"),
    cycleId: nul(v.id("cycles")),
    agent: lit("auditor", "messenger", "analyst"),
    attempt: v.number(),
    runId: nul(v.string()),
    status: lit(
      "starting",
      "pending",
      "running",
      "completed",
      "failed",
      "cancelled",
    ),
    callbackToken: v.string(),
    startedAt: v.string(),
    finishedAt: nul(v.string()),
    credits: nul(v.number()),
    error: nul(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_cycle", ["cycleId", "agent"])
    .index("by_run", ["runId"]),

  // B-01 probe tables (H5, H7); not part of the section 6 contract.
  ping: defineTable({ note: v.string(), at: v.string() }),
  probeVectors: defineTable({
    companyId: v.string(),
    text: v.string(),
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1024,
    filterFields: ["companyId"],
  }),
});
