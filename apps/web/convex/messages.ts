// Courier side of the messaging contract (messaging/contract.ts). Every call is checked against COURIER_KEY.
// B-08 outbox and inbound; B-09 reading replies (code only until a free-text reader is chosen), reminders, expiry.
import {
  isStop,
  nextStep,
  render,
} from "@payrollpilot/engine/messages/templates";
import {
  fromModel,
  PURPOSE,
  type ReplyResult,
  readReply,
  readYesNo,
  redactNames,
  restatement,
  TEMPLATE_FOR,
} from "@payrollpilot/engine/questions/questions";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { write } from "./audit";
import {
  assertCourier,
  inboundArgs,
  markSentArgs,
  type OutboundItem,
  pendingOutboundArgs,
} from "./messaging/contract";
import { queueText } from "./questions";

const OPEN = ["sent", "reminded"] as const;

/** Flags a person already settled; replies and questions never move them back. */
export const SETTLED = new Set(["corrected", "dismissed"]);

/** Demo timing: 2 minutes to a reminder and 2 more to expiry; otherwise 4 hours each. */
const remindMs = () =>
  process.env.DEMO_MODE === "1" ? 2 * 60_000 : 4 * 3_600_000;

/** Is another question to this worker still waiting for a reply? */
async function hasOpenQuestion(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  workerId: Id<"workers">,
) {
  for (const status of OPEN) {
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) =>
        q.eq("companyId", companyId).eq("status", status),
      )
      .collect();
    if (rows.some((r) => r.toWorkerId === workerId)) return true;
  }
  return false;
}

export const pendingOutbound = query({
  args: pendingOutboundArgs,
  handler: async (ctx, { courierKey }): Promise<OutboundItem[]> => {
    assertCourier(courierKey);
    const pending = await ctx.db
      .query("messages")
      .withIndex("by_provider", (q) => q.eq("providerId", null))
      .collect();
    const out: OutboundItem[] = [];
    const taken = new Set<string>();
    for (const m of pending.sort((a, b) => a.at.localeCompare(b.at))) {
      if (m.direction !== "out" || !m.questionId) continue;
      const question = await ctx.db.get(m.questionId);
      const worker = question && (await ctx.db.get(question.toWorkerId));
      if (!question || !worker?.contactRef || taken.has(worker.contactRef))
        continue;
      // One open question per phone: a new question waits while another one is unanswered.
      if (
        question.status === "approved" &&
        (await hasOpenQuestion(ctx, question.companyId, question.toWorkerId))
      )
        continue;
      taken.add(worker.contactRef);
      out.push({
        messageId: m._id,
        contactRef: worker.contactRef,
        text: m.text,
        kind: m.kind === "poll" ? "poll" : "text",
        options: m.kind === "poll" ? question.options : null,
      });
    }
    return out;
  },
});

export const markSent = mutation({
  args: markSentArgs,
  handler: async (
    ctx,
    { courierKey, messageId, providerId, conversationKey },
  ) => {
    assertCourier(courierKey);
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError("message not found");
    if (m.providerId) return; // the courier never sends twice; a retried markSent is a no-op
    const now = new Date().toISOString();
    await ctx.db.patch(messageId, { providerId, conversationKey, at: now });
    const q = m.questionId ? await ctx.db.get(m.questionId) : null;
    if (!q || q.status !== "approved") return;
    const remindAt = new Date(Date.now() + remindMs()).toISOString();
    await ctx.db.patch(q._id, { status: "sent", sentAt: now, remindAt });
    // Counted on send, not on draft, so cycle 1 vs cycle 2 is honest (M3).
    const cycle = await ctx.db.get(q.cycleId);
    if (cycle)
      await ctx.db.patch(cycle._id, {
        questionsAsked: cycle.questionsAsked + 1,
      });
    await ctx.scheduler.runAfter(remindMs(), internal.messages.remind, {
      questionId: q._id,
    });
    await write(ctx, {
      companyId: q.companyId,
      cycleId: q.cycleId,
      actor: { kind: "system", id: "courier", agent: null },
      type: "question.sent",
      summary: "Question texted",
      refs: { questionId: q._id, messageId },
      data: null,
    });
  },
});

export const inbound = mutation({
  args: inboundArgs,
  handler: async (ctx, args) => {
    assertCourier(args.courierKey);
    const dup = await ctx.db
      .query("messages")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .first();
    if (dup) return { duplicate: true };
    const question = await findQuestion(ctx, args);
    const messageId = await ctx.db.insert("messages", {
      companyId: question?.companyId ?? (await anyCompany(ctx)),
      conversationKey: args.conversationKey,
      direction: "in",
      text: args.text,
      providerId: args.providerId,
      at: new Date().toISOString(),
      questionId: question?._id ?? null,
      kind: args.kind,
    });
    if (!question) return { matched: false };
    if (args.kind === "reaction") return { matched: true, ignored: "reaction" };
    await interpret(ctx, question, messageId, args.text);
    return { matched: true };
  },
});

/** The open question this reply answers: the poll it votes on, else the latest open one on this phone. */
async function findQuestion(
  ctx: MutationCtx,
  args: { conversationKey: string; pollTarget: string | null },
) {
  if (args.pollTarget) {
    const target = args.pollTarget;
    const poll = await ctx.db
      .query("messages")
      .withIndex("by_provider", (q) => q.eq("providerId", target))
      .first();
    if (poll?.questionId) return ctx.db.get(poll.questionId);
  }
  const outs = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) =>
      q.eq("conversationKey", args.conversationKey),
    )
    .order("desc")
    .collect();
  for (const m of outs) {
    if (m.direction !== "out" || !m.questionId) continue;
    const q = await ctx.db.get(m.questionId);
    if (q && (OPEN as readonly string[]).includes(q.status)) return q;
  }
  return null;
}

// ponytail: an unmatched reply still needs a companyId; exact on single-company demo deployments.
async function anyCompany(ctx: MutationCtx): Promise<Id<"companies">> {
  const c = await ctx.db.query("companies").first();
  if (!c) throw new ConvexError("no company");
  return c._id;
}

type Facts = { entryIds: string[]; startAt: string | null; timezone: string };

/** What reading a reply needs: the flag's template and the facts its answers change. */
async function context(ctx: QueryCtx, question: Doc<"questions">) {
  const flag = await ctx.db.get(question.flagIds[0]);
  const company = await ctx.db.get(question.companyId);
  if (!flag || !company) return null;
  const template = TEMPLATE_FOR[flag.checkId];
  if (!template) return null;
  const firstEntry = flag.subject.entryIds[0]
    ? await ctx.db.get(flag.subject.entryIds[0])
    : null;
  const facts: Facts = {
    entryIds: flag.subject.entryIds,
    startAt: firstEntry?.startAt ?? null,
    timezone: company.timezone,
  };
  // The question this flag was first asked with; a confirm follow-up refers back to its reading.
  const asked = (
    await ctx.db
      .query("questions")
      .withIndex("by_cycle", (q) => q.eq("cycleId", question.cycleId))
      .collect()
  ).filter((q) => q.flagIds.includes(flag._id) && q.status !== "draft");
  return { flag, company, template, facts, asked };
}

const isConfirmFollowUp = (q: Doc<"questions">) =>
  q.options?.length === 2 && q.options[0] === "yes" && q.options[1] === "no";

/** Code reads first (STOP, numbers, times, yes/no to a confirm follow-up); free text goes to Haiku. */
async function interpret(
  ctx: MutationCtx,
  question: Doc<"questions">,
  messageId: Id<"messages">,
  text: string,
) {
  const c = await context(ctx, question);
  if (!c) return;
  if (isConfirmFollowUp(question) && !isStop(text)) {
    const answer = readYesNo(text);
    const earlier = c.asked.find(
      (q) => q._id !== question._id && q.interpretationId,
    );
    const previous = earlier?.interpretationId
      ? await ctx.db.get(earlier.interpretationId)
      : null;
    if (answer === "yes" && previous)
      return decide(
        ctx,
        question,
        messageId,
        { ...previous.result, confidence: 1 },
        "code",
      );
    return decide(
      ctx,
      question,
      messageId,
      {
        kind: "ambiguous",
        optionIndex: null,
        values: {},
        confidence: answer === "no" ? 1 : 0,
      },
      "code",
    );
  }
  const byCode = readReply(c.template, question.options ?? [], text, c.facts);
  if (byCode.kind !== "ambiguous" || !process.env.ANTHROPIC_API_KEY)
    return decide(ctx, question, messageId, byCode, "code");
  await ctx.scheduler.runAfter(0, internal.agents.interpret.read, {
    questionId: question._id,
    messageId,
  });
  await write(ctx, {
    companyId: question.companyId,
    cycleId: question.cycleId,
    actor: { kind: "system", id: "messages.interpret", agent: null },
    type: "reply.to_model",
    summary: "Free-text reply: sent to the Messenger's reader (Haiku)",
    refs: { questionId: question._id, messageId },
    data: null,
  });
}

/** For the Haiku reader: purpose, options and the reply with every known name redacted. Ids only. */
export const readingRequest = internalQuery({
  args: { questionId: v.id("questions"), messageId: v.id("messages") },
  handler: async (ctx, { questionId, messageId }) => {
    const question = await ctx.db.get(questionId);
    const message = await ctx.db.get(messageId);
    if (!question || !message) return null;
    const c = await context(ctx, question);
    if (!c) return null;
    const workers = await ctx.db
      .query("workers")
      .withIndex("by_company", (q) => q.eq("companyId", question.companyId))
      .collect();
    return {
      purpose: PURPOSE[c.template],
      options: question.options ?? [],
      reply: redactNames(
        message.text,
        workers.map((w) => w.displayName),
      ),
    };
  },
});

const reading = v.object({
  kind: v.union(
    v.literal("confirm"),
    v.literal("change"),
    v.literal("fixed_in_source"),
    v.literal("escalate"),
    v.literal("ambiguous"),
    v.literal("stop"),
  ),
  optionIndex: v.union(v.number(), v.null()),
  values: v.record(v.string(), v.union(v.string(), v.number())),
  confidence: v.number(),
});

/** The Haiku reader's result (or its failure) comes back here; code maps the pick and decides. */
export const applyReading = internalMutation({
  args: {
    questionId: v.id("questions"),
    messageId: v.id("messages"),
    reading: v.union(reading, v.null()),
    call: v.union(
      v.object({
        model: v.string(),
        prompt: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        ms: v.number(),
      }),
      v.null(),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { questionId, messageId, reading, call, error }) => {
    const question = await ctx.db.get(questionId);
    if (!question || question.status === "answered") return;
    const c = await context(ctx, question);
    if (!c) return;
    await write(ctx, {
      companyId: question.companyId,
      cycleId: question.cycleId,
      actor: { kind: "agent", id: "messenger", agent: "messenger" },
      type: call ? "llm.call" : "llm.call.failed",
      summary: call
        ? `Reply read by ${call.model} (${call.prompt})`
        : "Reply reader failed; treated as unclear",
      refs: { questionId, messageId },
      data: call ?? { error: error ?? null },
    });
    const result = reading
      ? fromModel(reading, c.template, question.options ?? [], c.facts)
      : {
          kind: "ambiguous" as const,
          optionIndex: null,
          values: {},
          confidence: 0,
        };
    await decide(ctx, question, messageId, result, call?.model ?? "code");
  },
});

/** Stores the interpretation and takes the next step (C's nextStep: apply, follow up once, hold, stop, escalate). */
async function decide(
  ctx: MutationCtx,
  question: Doc<"questions">,
  messageId: Id<"messages">,
  result: ReplyResult,
  model: string,
) {
  const c = await context(ctx, question);
  if (!c) return;
  const { flag } = c;
  const followUpsSent = Math.max(0, c.asked.length - 1);
  const step = nextStep(result, followUpsSent);
  const { confidence, ...stored } = result;
  const interpretationId = await ctx.db.insert("interpretations", {
    companyId: question.companyId,
    questionId: question._id,
    messageId,
    result: stored,
    confidence,
    model,
    needsFollowUp: step === "follow_up",
  });
  await ctx.db.patch(question._id, { interpretationId, status: "answered" });
  const audit = (type: string, summary: string) =>
    write(ctx, {
      companyId: question.companyId,
      cycleId: question.cycleId,
      actor: { kind: "system", id: "messages.decide", agent: null },
      type,
      summary,
      refs: { questionId: question._id, interpretationId, flagId: flag._id },
      data: {
        kind: result.kind,
        optionIndex: result.optionIndex,
        confidence,
        model,
      },
    });

  // A reply about a flag a person already settled is kept as evidence but changes nothing: it never
  // reopens the flag or proposes a second correction. STOP is still honoured.
  if (step !== "stop" && SETTLED.has(flag.status))
    return audit(
      "reply.after_settled",
      `Reply kept; the flag was already ${flag.status}, so nothing changes`,
    );

  switch (step) {
    case "stop": {
      await ctx.db.insert("rules", {
        companyId: question.companyId,
        type: "routing",
        params: { doNotText: question.toWorkerId },
        status: "active",
        source: "answer",
        provenance: {
          lessonId: null,
          flagId: flag._id,
          answeredBy: question.toWorkerId,
          approvedBy: null,
          approvedAt: null,
          evidence: [messageId],
        },
        backtest: null,
        confidence: 1,
      });
      // The question goes to their manager instead (plan B-09); a manager who says STOP leaves it with the owner.
      const toManager = question.toRole === "employee";
      await ctx.db.patch(flag._id, {
        status: "open",
        questionId: null,
        routeTo: toManager ? "manager" : "owner",
      });
      await queueText(ctx, question, render("stopAck", {}));
      if (toManager)
        await ctx.scheduler.runAfter(0, internal.questions.draftForCycle, {
          cycleId: question.cycleId,
        });
      return audit(
        "reply.stop",
        toManager
          ? "STOP: no more texts to this person; the question goes to their manager"
          : "STOP: no more texts to this person; flag moved to the owner",
      );
    }
    case "hold": {
      await ctx.db.patch(flag._id, { status: "held" });
      await ctx.scheduler.runAfter(0, internal.controller.cycle.gate1Check, {
        cycleId: question.cycleId,
      });
      return audit(
        "reply.held",
        "Still unclear after one follow-up: item held for a person",
      );
    }
    case "escalate": {
      await ctx.db.patch(flag._id, { status: "open", routeTo: "owner" });
      return audit(
        "reply.escalated",
        "Answer needs a person: moved to the owner",
      );
    }
    case "follow_up": {
      const said = restatement(
        c.template,
        question.options ?? [],
        result,
        c.facts.timezone,
      );
      const followUpId = await ctx.db.insert("questions", {
        companyId: question.companyId,
        cycleId: question.cycleId,
        flagIds: question.flagIds,
        toWorkerId: question.toWorkerId,
        toRole: question.toRole,
        // A reading we are unsure of is asked back ("To confirm: it was Job 15"); no reading re-asks the question.
        text: said ? render("followUp", { restatement: said }) : question.text,
        options: said ? ["yes", "no"] : question.options,
        kind: question.kind,
        status: "draft",
        approvedBy: null,
        approvedAt: null,
        sentAt: null,
        remindAt: null,
        expiresAt: null,
        interpretationId: null,
      });
      await ctx.db.patch(flag._id, { questionId: followUpId, status: "open" });
      if (await autoFollowUp(ctx, question.companyId)) {
        await ctx.db.patch(followUpId, {
          status: "approved",
          approvedBy: "rule:routing.autoFollowUp",
          approvedAt: new Date().toISOString(),
        });
        await ctx.db.patch(flag._id, { status: "asked" });
        const followUp = await ctx.db.get(followUpId);
        if (followUp) await queueText(ctx, followUp, followUp.text);
      }
      return audit(
        "reply.follow_up",
        "Unclear reply: one follow-up drafted for approval",
      );
    }
    case "apply": {
      if (result.kind === "fixed_in_source") {
        // They fixed it in Jobber: the next sync and checks run settle it; nothing is changed here.
        await ctx.db.patch(flag._id, { status: "answered" });
        return audit(
          "reply.fixed_in_source",
          "Worker says it is fixed in the source; the next sync re-checks it",
        );
      }
      await ctx.db.patch(flag._id, { status: "answered" });
      await audit("reply.answered", `Reply read as ${result.kind}`);
      // B-10 turns the answer into a correction proposal (or a confirmation) for a person to approve.
      await ctx.scheduler.runAfter(0, internal.corrections.proposeFromReply, {
        interpretationId,
      });
      return;
    }
  }
}

/** Follow-ups skip approval only when the owner switched it on (an active routing rule). */
async function autoFollowUp(ctx: MutationCtx, companyId: Id<"companies">) {
  const rules = await ctx.db
    .query("rules")
    .withIndex("by_status", (q) =>
      q.eq("companyId", companyId).eq("status", "active").eq("type", "routing"),
    )
    .collect();
  return rules.some((r) => r.params.autoFollowUp === true);
}

/** Still unanswered after the first interval: one reminder, then expiry after another. */
export const remind = internalMutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    const q = await ctx.db.get(questionId);
    if (!q || q.status !== "sent") return;
    const expiresAt = new Date(Date.now() + remindMs()).toISOString();
    await ctx.db.patch(questionId, { status: "reminded", expiresAt });
    await queueText(ctx, q, `Reminder: ${q.text}`.slice(0, 240));
    await ctx.scheduler.runAfter(remindMs(), internal.messages.expire, {
      questionId,
    });
    await write(ctx, {
      companyId: q.companyId,
      cycleId: q.cycleId,
      actor: { kind: "system", id: "messages.remind", agent: null },
      type: "question.reminded",
      summary: "No reply yet: reminder queued",
      refs: { questionId },
      data: null,
    });
  },
});

/** No reply after the reminder: the item is held; the rest of the worker's hours go through. */
export const expire = internalMutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    const q = await ctx.db.get(questionId);
    if (!q || q.status !== "reminded") return;
    await ctx.db.patch(questionId, { status: "expired" });
    for (const flagId of q.flagIds)
      await ctx.db.patch(flagId, { status: "held", routeTo: "owner" });
    await ctx.scheduler.runAfter(0, internal.controller.cycle.gate1Check, {
      cycleId: q.cycleId,
    });
    await write(ctx, {
      companyId: q.companyId,
      cycleId: q.cycleId,
      actor: { kind: "system", id: "messages.expire", agent: null },
      type: "question.expired",
      summary: "No reply: item held and moved to the owner",
      refs: { questionId },
      data: null,
    });
  },
});
