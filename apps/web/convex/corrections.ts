// B-10: an answered question becomes a correction proposal with its pay and job-profit effect; a person
// approves it, the record copy changes (never the source system), and the workbook is rebuilt.
import {
  type Change,
  changeFor,
  effectOf,
  patchEntry,
} from "@payrollpilot/engine/corrections/corrections";
import type { TimeEntry } from "@payrollpilot/engine/payroll/types";
import { TEMPLATE_FOR } from "@payrollpilot/engine/questions/questions";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "./_generated/server";
import { write } from "./audit";
import { recomputeDraft } from "./controller/recompute";
import { payrollInput, toEngine } from "./lib/engine";
import { userId } from "./lib/validators";

/** Scheduled when a reply is applied: a proposal for a person, or a confirmation that closes the flag. */
export const proposeFromReply = internalMutation({
  args: { interpretationId: v.id("interpretations") },
  handler: async (ctx, { interpretationId }) => {
    const it = await ctx.db.get(interpretationId);
    const question = it && (await ctx.db.get(it.questionId));
    const flag = question && (await ctx.db.get(question.flagIds[0]));
    if (!it || !question || !flag) return;
    const template = TEMPLATE_FOR[flag.checkId];
    if (!template) return;
    const audit = (type: string, summary: string, data: unknown = null) =>
      write(ctx, {
        companyId: flag.companyId,
        cycleId: flag.cycleId,
        actor: {
          kind: "system",
          id: "corrections.proposeFromReply",
          agent: null,
        },
        type,
        summary,
        refs: { flagId: flag._id, interpretationId },
        data,
      });

    if (it.result.kind === "confirm") {
      await ctx.db.patch(flag._id, { status: "dismissed" });
      await audit(
        "flag.confirmed",
        "The person asked confirmed the record is right; nothing changes",
      );
      // Learning contract step 1: a confirmed answer is a lesson too.
      await ctx.scheduler.runAfter(0, internal.agents.learn.recordLesson, {
        companyId: flag.companyId,
        from: { kind: "confirm", interpretationId },
      });
      return;
    }

    const p = await payrollInput(ctx, flag.cycleId);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_company", (q) => q.eq("companyId", flag.companyId))
      .collect();
    const change = changeFor(
      template,
      { ...it.result, confidence: it.confidence },
      flag.subject,
      {
        entries: p.entries,
        expenses: p.expenses,
        jobIdByNumber: new Map(jobs.map((j) => [j.jobNumber, j._id])),
      },
    );
    if (!change) {
      // An answer that maps to no record (an unknown job number) is never guessed at.
      await ctx.db.patch(flag._id, { status: "open", routeTo: "owner" });
      return audit(
        "correction.unmapped",
        "The answer did not map to a record; moved to the owner",
      );
    }
    const effect = effectOf(p, change);
    const correctionId = await ctx.db.insert("corrections", {
      companyId: flag.companyId,
      cycleId: flag.cycleId,
      flagId: flag._id,
      target: { table: change.table, id: change.id, field: change.field },
      before: change.before,
      after: change.after,
      effectPayCents: effect.payCents,
      // ponytail: the contract has no null here; "unknown" lives in the audit event's profitNote.
      effectProfitCents: effect.profitCents ?? 0,
      status: "proposed",
      source: "reply",
      approvedBy: null,
      approvedAt: null,
    });
    await ctx.db.patch(flag._id, { correctionId });
    await audit(
      "correction.proposed",
      `Proposed ${change.table}.${change.field} change`,
      {
        correctionId,
        effectPayCents: effect.payCents,
        effectProfitCents: effect.profitCents,
        profitJobId: effect.profitJobId,
        profitNote: effect.profitNote,
      },
    );
  },
});

const JOB_FACTS = new Set(["jobId", "matchedJobId", "kind"]);

/**
 * The owner approves anything. A manager approves job facts about their own crew when the
 * correction moves no pay (plan B-10). Agents and the system never approve.
 */
async function assertApprover(
  ctx: MutationCtx,
  correction: Doc<"corrections">,
  who: string,
) {
  const id = ctx.db.normalizeId("workers", who);
  const approver = id ? await ctx.db.get(id) : null;
  if (!approver || approver.companyId !== correction.companyId)
    throw new ConvexError("approver must be a person in this company");
  if (approver.role === "owner") return approver;
  if (
    approver.role === "manager" &&
    correction.effectPayCents === 0 &&
    JOB_FACTS.has(correction.target.field)
  ) {
    const flag = await ctx.db.get(correction.flagId);
    const worker = flag?.subject.workerId
      ? await ctx.db.get(flag.subject.workerId)
      : null;
    if (
      !worker ||
      worker.managerId === approver._id ||
      worker._id === approver._id
    )
      return approver;
  }
  throw new ConvexError(
    "only the owner can approve a correction that changes pay",
  );
}

async function applyTo(ctx: MutationCtx, c: Doc<"corrections">) {
  const target = c.target;
  if (target.table === "timeEntries") {
    const id = ctx.db.normalizeId("timeEntries", target.id);
    const entry = id ? await ctx.db.get(id) : null;
    if (!id || !entry) throw new ConvexError("time entry not found");
    if (
      JSON.stringify(entry[target.field as keyof typeof entry] ?? null) !==
      JSON.stringify(c.before)
    )
      throw new ConvexError(
        "the record changed since this was proposed; re-run the checks",
      );
    const patched = patchEntry(
      toEngine(entry) as unknown as TimeEntry,
      {
        ...target,
        before: c.before,
        after: c.after,
      } as Extract<Change, { table: "timeEntries" }>,
    );
    await ctx.db.patch(id, {
      jobId: patched.jobId as Id<"jobs"> | null,
      endAt: patched.endAt,
      durationSec: patched.durationSec,
      ticking: patched.ticking,
      payable: patched.payable,
    });
    return;
  }
  if (target.table === "expenses") {
    const id = ctx.db.normalizeId("expenses", target.id);
    const expense = id ? await ctx.db.get(id) : null;
    if (!id || !expense) throw new ConvexError("expense not found");
    if (
      JSON.stringify(expense[target.field as keyof typeof expense] ?? null) !==
      JSON.stringify(c.before)
    )
      throw new ConvexError(
        "the record changed since this was proposed; re-run the checks",
      );
    if (target.field === "matchedJobId")
      await ctx.db.patch(id, { matchedJobId: c.after as Id<"jobs"> });
    else if (target.field === "kind")
      await ctx.db.patch(id, { kind: c.after as "overhead" });
    else throw new ConvexError(`unsupported field ${target.field}`);
    return;
  }
  throw new ConvexError(`unsupported table ${target.table}`);
}

export const approve = mutation({
  args: { correctionId: v.id("corrections"), userId },
  handler: async (ctx, { correctionId, userId }) => {
    const c = await ctx.db.get(correctionId);
    if (!c) throw new ConvexError("correction not found");
    if (c.status !== "proposed")
      throw new ConvexError(`correction is ${c.status}, not proposed`);
    const approver = await assertApprover(ctx, c, userId);
    await applyTo(ctx, c);
    const now = new Date().toISOString();
    await ctx.db.patch(correctionId, {
      status: "applied",
      approvedBy: approver._id,
      approvedAt: now,
    });
    await ctx.db.patch(c.flagId, { status: "corrected" });
    await write(ctx, {
      companyId: c.companyId,
      cycleId: c.cycleId,
      actor: { kind: "user", id: approver._id, agent: null },
      type: "correction.applied",
      summary: `${c.target.table}.${c.target.field} corrected`,
      refs: { correctionId, flagId: c.flagId },
      data: {
        before: c.before,
        after: c.after,
        effectPayCents: c.effectPayCents,
      },
    });
    await recomputeDraft(ctx, c.cycleId, { correctionId });
    // Learning contract step 1: every approved correction is evaluated into a lesson.
    await ctx.scheduler.runAfter(0, internal.agents.learn.recordLesson, {
      companyId: c.companyId,
      from: { kind: "correction", correctionId },
    });
  },
});

export const reject = mutation({
  args: { correctionId: v.id("corrections"), userId, reason: v.string() },
  handler: async (ctx, { correctionId, userId, reason }) => {
    const c = await ctx.db.get(correctionId);
    if (!c) throw new ConvexError("correction not found");
    if (c.status !== "proposed")
      throw new ConvexError(`correction is ${c.status}, not proposed`);
    const approver = await assertApprover(ctx, c, userId);
    await ctx.db.patch(correctionId, { status: "rejected" });
    await ctx.db.patch(c.flagId, {
      status: "open",
      correctionId: null,
      routeTo: "owner",
    });
    await write(ctx, {
      companyId: c.companyId,
      cycleId: c.cycleId,
      actor: { kind: "user", id: approver._id, agent: null },
      type: "correction.rejected",
      summary: "Correction rejected; flag back with the owner",
      refs: { correctionId, flagId: c.flagId },
      data: { reason },
    });
  },
});
