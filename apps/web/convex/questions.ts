// B-08: flags routed to a person become questions; a person approves each one before it is sent.
import {
  buildQuestion,
  candidateJobs,
} from "@payrollpilot/engine/questions/questions";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "./_generated/server";
import { write } from "./audit";
import { userId } from "./lib/validators";

/** Who answers: the worker if employees may be texted and they have a phone, else their manager. */
async function recipient(
  ctx: MutationCtx,
  company: Doc<"companies">,
  worker: Doc<"workers">,
): Promise<{ to: Doc<"workers">; toRole: "manager" | "employee" } | null> {
  if (
    company.settings.employeesMayBeTexted &&
    worker.contactRef &&
    worker.role === "field" &&
    !(await doNotText(ctx, company._id, worker._id))
  )
    return { to: worker, toRole: "employee" };
  const manager = worker.managerId ? await ctx.db.get(worker.managerId) : null;
  return manager?.contactRef ? { to: manager, toRole: "manager" } : null;
}

/** STOP writes an active routing rule; nobody is texted again after it. */
async function doNotText(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  workerId: Id<"workers">,
) {
  const rules = await ctx.db
    .query("rules")
    .withIndex("by_status", (q) =>
      q.eq("companyId", companyId).eq("status", "active").eq("type", "routing"),
    )
    .collect();
  return rules.some((r) => r.params.doNotText === workerId);
}

/** Scheduled after checks.run: one draft question per open, person-routed flag that a template can ask. */
export const draftForCycle = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) => {
    const cycle = await ctx.db.get(cycleId);
    if (!cycle) throw new ConvexError("cycle not found");
    const company = await ctx.db.get(cycle.companyId);
    if (!company) throw new ConvexError("company not found");
    const tz = company.timezone;
    const flags = (
      await ctx.db
        .query("flags")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
        .collect()
    ).filter(
      (f) => f.status === "open" && f.routeTo === "manager" && !f.questionId,
    );
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect();
    const visits = await ctx.db
      .query("visits")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();

    let drafted = 0;
    let skippedByRule = 0;
    for (const flag of flags) {
      // A flag with an active learned rule as precedent is not texted again (learning contract step 5):
      // it goes to the owner's list with the rule cited, for a one-tap decision. Nothing is dropped.
      const rule = flag.precedent?.ruleId
        ? await ctx.db.get(flag.precedent.ruleId)
        : null;
      if (rule?.status === "active") {
        await ctx.db.patch(flag._id, { routeTo: "owner" });
        skippedByRule++;
        continue;
      }
      const worker = flag.subject.workerId
        ? await ctx.db.get(flag.subject.workerId)
        : null;
      const expense = flag.subject.expenseIds[0]
        ? await ctx.db.get(flag.subject.expenseIds[0])
        : null;
      const subjectWorker =
        worker ??
        (expense?.reimbursableToWorkerId
          ? await ctx.db.get(expense.reimbursableToWorkerId)
          : null);
      if (!subjectWorker) continue;
      const flagEntries = flag.subject.entryIds
        .map((id) => entries.find((e) => e._id === id))
        .filter((e): e is Doc<"timeEntries"> => !!e);
      const first = flagEntries[0];
      const jobIds = first
        ? candidateJobs(
            subjectWorker._id,
            first.startAt,
            tz,
            visits.map((x) => ({
              jobId: x.jobId,
              startAt: x.startAt,
              assignedWorkerIds: x.assignedWorkerIds,
            })),
            entries,
          )
        : expense
          ? recentJobs(entries)
          : [];
      const jobNumbers: number[] = [];
      for (const id of jobIds) {
        const job = await ctx.db.get(id as Id<"jobs">);
        if (job) jobNumbers.push(job.jobNumber);
      }
      const built = buildQuestion(flag.checkId, {
        timezone: tz,
        workerName: subjectWorker.displayName,
        entries: flagEntries.map((e) => ({
          id: e._id,
          startAt: e.startAt,
          endAt: e.endAt,
          durationSec: e.durationSec,
        })),
        jobNumbers,
        expense: expense
          ? { vendor: expense.vendor, date: expense.date }
          : null,
      });
      if (!built) continue;
      // Expense questions go to the manager (template audience); entry questions to the worker if allowed.
      const to =
        built.template === "expenseNoJob"
          ? await managerOf(ctx, subjectWorker)
          : await recipient(ctx, company, subjectWorker);
      if (!to) continue;
      const questionId = await ctx.db.insert("questions", {
        companyId: company._id,
        cycleId,
        flagIds: [flag._id],
        toWorkerId: to.to._id,
        toRole: to.toRole,
        text: built.text,
        options: built.options.length ? built.options : null,
        kind: "text",
        status: "draft",
        approvedBy: null,
        approvedAt: null,
        sentAt: null,
        remindAt: null,
        expiresAt: null,
        interpretationId: null,
      });
      await ctx.db.patch(flag._id, { questionId });
      drafted++;
    }
    await write(ctx, {
      companyId: company._id,
      cycleId,
      actor: { kind: "system", id: "questions.draftForCycle", agent: null },
      type: "questions.drafted",
      summary: `${drafted} questions drafted; ${skippedByRule} flags with an active rule moved to the owner instead of texted`,
      refs: { cycleId },
      data: { drafted, skippedByRule },
    });
    return { drafted, skippedByRule };
  },
});

/** Most-logged jobs this cycle, for an expense with no visit day to go by. */
function recentJobs(entries: Doc<"timeEntries">[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries)
    if (e.jobId) counts.set(e.jobId, (counts.get(e.jobId) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => id);
}

async function managerOf(ctx: MutationCtx, worker: Doc<"workers">) {
  const manager =
    worker.role === "manager"
      ? worker
      : worker.managerId
        ? await ctx.db.get(worker.managerId)
        : null;
  return manager?.contactRef
    ? { to: manager, toRole: "manager" as const }
    : null;
}

/**
 * The approver is a person: the owner approves anything; a manager approves questions to their own
 * crew's employees. Agents and the system never approve (plan B 4.1).
 */
async function assertApprover(
  ctx: MutationCtx,
  question: Doc<"questions">,
  who: string,
) {
  const id = ctx.db.normalizeId("workers", who);
  const approver = id ? await ctx.db.get(id) : null;
  if (!approver || approver.companyId !== question.companyId)
    throw new ConvexError("approver must be a person in this company");
  if (approver.role === "owner") return approver;
  const target = await ctx.db.get(question.toWorkerId);
  if (
    approver.role === "manager" &&
    question.toRole === "employee" &&
    target?.managerId === approver._id
  )
    return approver;
  throw new ConvexError(
    "only the owner, or this worker's manager, can approve",
  );
}

/** Queues the text for the courier (messages.pendingOutbound picks it up, one open question per phone). */
export async function queueText(
  ctx: MutationCtx,
  question: Doc<"questions">,
  text: string,
) {
  const worker = await ctx.db.get(question.toWorkerId);
  if (!worker?.contactRef) throw new ConvexError("recipient has no phone");
  return ctx.db.insert("messages", {
    companyId: question.companyId,
    // Replaced by the courier's sha256(phone) on markSent; Convex never sees the phone.
    conversationKey: `pending:${worker.contactRef}`,
    direction: "out",
    text,
    providerId: null,
    at: new Date().toISOString(),
    questionId: question._id,
    kind: question.kind,
  });
}

export const approve = mutation({
  args: {
    questionId: v.id("questions"),
    userId,
    editedText: v.optional(v.string()),
  },
  handler: async (ctx, { questionId, userId, editedText }) => {
    const q = await ctx.db.get(questionId);
    if (!q) throw new ConvexError("question not found");
    if (q.status !== "draft")
      throw new ConvexError(`question is ${q.status}, not draft`);
    const approver = await assertApprover(ctx, q, userId);
    const text = editedText?.trim() || q.text;
    if (/\$\s?\d|\d+\s?(dollars|usd)/i.test(text))
      throw new ConvexError("texts never carry a dollar amount");
    const now = new Date().toISOString();
    await ctx.db.patch(questionId, {
      text,
      status: "approved",
      approvedBy: approver._id,
      approvedAt: now,
    });
    for (const flagId of q.flagIds)
      await ctx.db.patch(flagId, { status: "asked" });
    await queueText(ctx, { ...q, text }, text);
    await write(ctx, {
      companyId: q.companyId,
      cycleId: q.cycleId,
      actor: { kind: "user", id: approver._id, agent: null },
      type: "question.approved",
      summary: editedText
        ? "Question edited and approved"
        : "Question approved",
      refs: { questionId },
      data: { edited: !!editedText },
    });
  },
});

export const deny = mutation({
  args: { questionId: v.id("questions"), userId, reason: v.string() },
  handler: async (ctx, { questionId, userId, reason }) => {
    const q = await ctx.db.get(questionId);
    if (!q) throw new ConvexError("question not found");
    if (q.status !== "draft")
      throw new ConvexError(`question is ${q.status}, not draft`);
    const approver = await assertApprover(ctx, q, userId);
    await ctx.db.patch(questionId, { status: "denied" });
    // The flag goes back to the owner's list; nobody is texted.
    for (const flagId of q.flagIds)
      await ctx.db.patch(flagId, { questionId: null, routeTo: "owner" });
    await write(ctx, {
      companyId: q.companyId,
      cycleId: q.cycleId,
      actor: { kind: "user", id: approver._id, agent: null },
      type: "question.denied",
      summary: "Question denied; flag moved to the owner",
      refs: { questionId },
      data: { reason },
    });
  },
});

export const edit = mutation({
  args: {
    questionId: v.id("questions"),
    userId,
    text: v.string(),
    options: v.optional(v.union(v.array(v.string()), v.null())),
  },
  handler: async (ctx, { questionId, userId, text, options }) => {
    const q = await ctx.db.get(questionId);
    if (!q) throw new ConvexError("question not found");
    if (q.status !== "draft")
      throw new ConvexError(`question is ${q.status}, not draft`);
    const approver = await assertApprover(ctx, q, userId);
    if (text.length > 240 || /\$\s?\d|\d+\s?(dollars|usd)/i.test(text))
      throw new ConvexError("texts are at most 240 characters, never money");
    await ctx.db.patch(questionId, {
      text,
      ...(options !== undefined ? { options } : {}),
    });
    await write(ctx, {
      companyId: q.companyId,
      cycleId: q.cycleId,
      actor: { kind: "user", id: approver._id, agent: null },
      type: "question.edited",
      summary: "Question edited",
      refs: { questionId },
      data: null,
    });
  },
});
