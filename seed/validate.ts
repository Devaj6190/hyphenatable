// Validates a fixture folder (data/fixtures/<company>) against a zod mirror of
// docs/plans/00-shared-context.md section 6. Temporary until B-02 lands
// packages/engine/src/schemas.ts; then this file imports from there.
//
// Usage: bun run seed/validate.ts data/fixtures/a
// Exits 0 only if every expected file exists, parses, matches its schema, and
// the cross-references (companyId, worker/job/cycle/visit/quote/invoice ids) resolve.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const id = z.string().min(1);
const nid = id.nullable();
const cents = z.number().int();
const isoTime = z.iso.datetime(); // ISO 8601 UTC, e.g. 2026-10-12T14:00:00.000Z
const isoDate = z.iso.date(); // YYYY-MM-DD for date-only fields

// ---- section 6 shapes -------------------------------------------------------

export const Company = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(["synthetic", "real"]),
  payFrequency: z.enum(["weekly", "biweekly"]),
  timezone: z.string(),
  settings: z.strictObject({
    longShiftHours: z.number(),
    otWeeklyHours: z.number(),
    grossChangePct: z.number(),
    employeesMayBeTexted: z.boolean(),
  }),
});

export const Worker = z.strictObject({
  id,
  companyId: id,
  displayName: z.string(),
  role: z.enum(["field", "manager", "owner", "office"]),
  payType: z.enum(["hourly", "salary", "contractor_venmo", "commission"]),
  status: z.enum(["active", "inactive"]),
  managerId: nid,
  contactRef: nid,
  jobber: z
    .strictObject({ userId: id, labourRateCents: cents.nullable(), status: z.string() })
    .nullable(),
  gusto: z
    .strictObject({
      employeeUuid: nid,
      contractorUuid: nid,
      jobUuid: nid,
      rateCents: cents.nullable(),
      paymentUnit: z.string().nullable(),
      flsaStatus: z.string().nullable(),
      onboarded: z.boolean().nullable(),
    })
    .nullable(),
  venmoRateCents: cents.nullable(),
});

export const Cycle = z.strictObject({
  id,
  companyId: id,
  number: z.number().int(),
  periodStart: isoTime,
  periodEnd: isoTime,
  cutoffAt: isoTime,
  stage: z.enum([
    "setup", "syncing", "checking", "asking", "gate1_ready", "stage1_filled",
    "reconciling", "gate2_ready", "stage2_filled", "closed",
  ]),
  gustoPayrollId: nid,
  gustoOffCyclePayrollId: nid,
  questionsAsked: z.number().int(),
});

export const SyncRun = z.strictObject({
  id,
  companyId: id,
  cycleId: nid,
  source: z.enum(["jobber", "qbo", "gusto", "export", "browser"]),
  object: z.string(),
  startedAt: isoTime,
  finishedAt: isoTime.nullable(),
  pulled: z.number().int(),
  expected: z.number().int().nullable(),
  complete: z.boolean(),
  method: z.string(),
  error: z.string().nullable(),
});

export const TimeEntry = z.strictObject({
  id,
  companyId: id,
  cycleId: id,
  sourceId: id,
  workerId: id,
  jobId: nid,
  visitId: nid,
  startAt: isoTime,
  endAt: isoTime.nullable(),
  durationSec: z.number().int().nonnegative(),
  ticking: z.boolean(),
  approved: z.boolean(),
  approvedBy: nid,
  payable: z.boolean(),
  category: z.string(),
  label: z.string().nullable(),
  hasNote: z.boolean(),
});

export const Job = z.strictObject({
  id,
  companyId: id,
  sourceId: id,
  jobNumber: z.union([z.string(), z.number()]),
  title: z.string(),
  clientRef: z.string(),
  status: z.string(),
  salespersonWorkerId: nid,
  quoteId: nid,
  parentJobId: nid,
  startAt: isoTime.nullable(),
  endAt: isoTime.nullable(),
  totalCents: cents.nullable(),
});

export const Visit = z.strictObject({
  id,
  companyId: id,
  jobId: id,
  sourceId: id,
  startAt: isoTime,
  endAt: isoTime.nullable(),
  isComplete: z.boolean(),
  assignedWorkerIds: z.array(id),
});

export const Quote = z.strictObject({
  id,
  companyId: id,
  sourceId: id,
  jobId: nid,
  salespersonWorkerId: nid,
  sentAt: isoTime.nullable(),
  status: z.string(),
  amountCents: cents,
});

export const Invoice = z.strictObject({
  id,
  companyId: id,
  sourceId: id,
  jobId: nid,
  issuedDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  status: z.string(),
  totalCents: cents,
});

export const Payment = z.strictObject({
  id,
  companyId: id,
  sourceId: id,
  invoiceId: nid,
  quoteId: nid,
  entryDate: isoDate,
  amountCents: cents,
  paymentType: z.string(),
  kind: z.enum(["deposit", "final", "unknown"]),
});

export const Expense = z.strictObject({
  id,
  companyId: id,
  source: z.enum(["qbo", "jobber"]),
  sourceId: id,
  date: isoDate,
  amountCents: cents,
  vendor: z.string().nullable(),
  description: z.string().nullable(),
  accountName: z.string().nullable(),
  customerRef: z.string().nullable(),
  paymentType: z.string().nullable(),
  kind: z.enum(["job_cost", "overhead", "unknown"]),
  matchedJobId: nid,
  matchConfidence: z.number().min(0).max(1).nullable(),
});

export const RuleType = z.enum([
  "overtime_policy", "pay_rate", "venmo_rate", "long_shift_threshold", "expense_account_kind",
  "vendor_job_hint", "disposal_parent_link", "in_person_quoter", "commission_plan", "tip_policy",
  "manager_split", "routing", "worker_mapping", "deposit_vs_final", "catch_all_threshold",
]);

export const Rule = z.strictObject({
  id,
  companyId: id,
  type: RuleType,
  params: z.record(z.string(), z.unknown()),
  status: z.enum(["proposed", "active", "off"]),
  source: z.enum(["history", "owner_stated", "answer"]),
  provenance: z.strictObject({
    lessonId: nid,
    flagId: nid,
    answeredBy: nid,
    approvedBy: nid,
    approvedAt: isoTime.nullable(),
    evidence: z.array(z.string()),
  }),
  backtest: z
    .strictObject({ cycles: z.number().int(), agree: z.number().int(), disagree: z.number().int() })
    .nullable(),
  confidence: z.number().min(0).max(1),
});

export const CheckId = z.string().regex(/^CHK-(0[1-9]|1[0-9]|2[0-3])$/);

// Answer key (shared-context section 13): matched to flags by checkId + overlapping subject ids.
// subject uses the Flag.subject shape; correctAnswer uses the Interpretation.result kinds.
export const AnswerKeyRow = z.strictObject({
  id,
  checkId: CheckId,
  subject: z.strictObject({
    workerId: nid,
    jobId: nid,
    entryIds: z.array(id),
    expenseIds: z.array(id),
  }),
  truth: z.string().min(1),
  correctAnswer: z.strictObject({
    kind: z.enum(["confirm", "change", "fixed_in_source", "escalate", "ambiguous", "stop"]),
    values: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  registerCategory: z.string().min(1),
});

// ---- file map ---------------------------------------------------------------

const FILES: Record<string, { schema: z.ZodType; array: boolean }> = {
  "company.json": { schema: Company, array: false },
  "workers.json": { schema: Worker, array: true },
  "cycles.json": { schema: Cycle, array: true },
  "syncRuns.json": { schema: SyncRun, array: true },
  "timeEntries.json": { schema: TimeEntry, array: true },
  "jobs.json": { schema: Job, array: true },
  "visits.json": { schema: Visit, array: true },
  "quotes.json": { schema: Quote, array: true },
  "invoices.json": { schema: Invoice, array: true },
  "payments.json": { schema: Payment, array: true },
  "expenses.json": { schema: Expense, array: true },
  "rules.json": { schema: Rule, array: true },
  "answer-key.json": { schema: AnswerKeyRow, array: true },
};

// ---- run ----------------------------------------------------------------------

type Rec = Record<string, unknown>;

export function validateDir(dir: string): string[] {
  const errors: string[] = [];
  const data: Record<string, Rec[]> = {};

  for (const [file, { schema, array }] of Object.entries(FILES)) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      errors.push(`${file}: missing`);
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${file}: invalid JSON (${(e as Error).message})`);
      continue;
    }
    const result = (array ? z.array(schema) : schema).safeParse(json);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    data[file] = (array ? json : [json]) as Rec[];
  }
  if (errors.length) return errors;

  // ---- cross-references
  const ids = (file: string) => new Set(data[file].map((r) => r.id as string));
  const all = Object.values(data).flat();
  const seen = new Set<string>();
  for (const [file, rows] of Object.entries(data)) {
    for (const r of rows) {
      const key = `${file}:${r.id}`;
      if (seen.has(key)) errors.push(`${file}: duplicate id ${r.id}`);
      seen.add(key);
    }
  }
  const companyId = data["company.json"][0].id as string;
  for (const r of all) {
    if ("companyId" in r && r.companyId !== companyId) {
      errors.push(`record ${r.id}: companyId ${r.companyId} != ${companyId}`);
    }
  }
  const workers = ids("workers.json");
  const jobs = ids("jobs.json");
  const cycles = ids("cycles.json");
  const visits = ids("visits.json");
  const quotes = ids("quotes.json");
  const invoices = ids("invoices.json");
  const entries = ids("timeEntries.json");
  const expenses = ids("expenses.json");
  const ref = (file: string, r: Rec, field: string, set: Set<string>) => {
    const v = r[field];
    if (v != null && !set.has(v as string)) errors.push(`${file}: ${r.id}.${field} -> unknown ${v}`);
  };
  for (const r of data["workers.json"]) ref("workers.json", r, "managerId", workers);
  for (const r of data["syncRuns.json"]) ref("syncRuns.json", r, "cycleId", cycles);
  for (const r of data["timeEntries.json"]) {
    ref("timeEntries.json", r, "cycleId", cycles);
    ref("timeEntries.json", r, "workerId", workers);
    ref("timeEntries.json", r, "jobId", jobs);
    ref("timeEntries.json", r, "visitId", visits);
    ref("timeEntries.json", r, "approvedBy", workers);
  }
  for (const r of data["jobs.json"]) {
    ref("jobs.json", r, "salespersonWorkerId", workers);
    ref("jobs.json", r, "quoteId", quotes);
    ref("jobs.json", r, "parentJobId", jobs);
  }
  for (const r of data["visits.json"]) {
    ref("visits.json", r, "jobId", jobs);
    for (const w of r.assignedWorkerIds as string[]) {
      if (!workers.has(w)) errors.push(`visits.json: ${r.id}.assignedWorkerIds -> unknown ${w}`);
    }
  }
  for (const r of data["quotes.json"]) {
    ref("quotes.json", r, "jobId", jobs);
    ref("quotes.json", r, "salespersonWorkerId", workers);
  }
  for (const r of data["invoices.json"]) ref("invoices.json", r, "jobId", jobs);
  for (const r of data["payments.json"]) {
    ref("payments.json", r, "invoiceId", invoices);
    ref("payments.json", r, "quoteId", quotes);
  }
  for (const r of data["expenses.json"]) ref("expenses.json", r, "matchedJobId", jobs);
  for (const r of data["answer-key.json"]) {
    const s = r.subject as Rec;
    ref("answer-key.json", s as Rec & { id: unknown }, "workerId", workers);
    ref("answer-key.json", s as Rec & { id: unknown }, "jobId", jobs);
    for (const e of s.entryIds as string[]) {
      if (!entries.has(e)) errors.push(`answer-key.json: ${r.id} entryIds -> unknown ${e}`);
    }
    for (const e of s.expenseIds as string[]) {
      if (!expenses.has(e)) errors.push(`answer-key.json: ${r.id} expenseIds -> unknown ${e}`);
    }
  }
  // Every time entry's interval must be consistent: endAt - startAt == durationSec unless ticking.
  for (const r of data["timeEntries.json"]) {
    if (r.ticking) {
      if (r.endAt !== null) errors.push(`timeEntries.json: ${r.id} ticking but has endAt`);
      continue;
    }
    if (r.endAt === null) {
      errors.push(`timeEntries.json: ${r.id} not ticking but endAt is null`);
      continue;
    }
    const d = (Date.parse(r.endAt as string) - Date.parse(r.startAt as string)) / 1000;
    if (d !== r.durationSec) errors.push(`timeEntries.json: ${r.id} durationSec ${r.durationSec} != endAt-startAt ${d}`);
  }
  return errors;
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: bun run seed/validate.ts <fixture dir>");
    process.exit(2);
  }
  const errors = validateDir(dir);
  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error(`${errors.length} error(s) in ${dir}`);
    process.exit(1);
  }
  console.log(`OK ${dir}: ${Object.keys(FILES).length} files valid`);
}
