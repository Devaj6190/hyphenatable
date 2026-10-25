import { backtest } from "@payrollpilot/engine/lessons/lessons";
import {
  type Rule as EngineRule,
  ProposedRules,
  pairsToRecord,
} from "@payrollpilot/engine/schemas";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { write } from "./audit";
import { pastCycles } from "./lessons";
import { userId } from "./lib/validators";

export const list = query({
  args: {
    companyId: v.id("companies"),
    status: v.optional(
      v.union(v.literal("proposed"), v.literal("active"), v.literal("off")),
    ),
  },
  handler: (ctx, { companyId, status }) =>
    status
      ? ctx.db
          .query("rules")
          .withIndex("by_status", (q) =>
            q.eq("companyId", companyId).eq("status", status),
          )
          .collect()
      : ctx.db
          .query("rules")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
});

/** The owner approves a proposed rule. Separation of duties: never the person whose answer it came from. */
export const approve = mutation({
  args: { ruleId: v.id("rules"), userId },
  handler: async (ctx, { ruleId, userId }) => {
    const rule = await ctx.db.get(ruleId);
    if (!rule) throw new ConvexError("rule not found");
    if (rule.status !== "proposed")
      throw new ConvexError(`rule is ${rule.status}, not proposed`);
    const owner = await assertOwner(ctx, rule.companyId, userId);
    // An owner-stated rule is the owner's own words restated by the Analyst; confirming it is the point.
    if (
      rule.source !== "owner_stated" &&
      rule.provenance.answeredBy === owner._id
    )
      throw new ConvexError(
        "the person whose answer created this rule cannot also approve it",
      );
    const now = new Date().toISOString();
    await ctx.db.patch(ruleId, {
      status: "active",
      provenance: {
        ...rule.provenance,
        approvedBy: owner._id,
        approvedAt: now,
      },
    });
    if (rule.provenance.lessonId)
      await ctx.db.patch(rule.provenance.lessonId, { status: "promoted" });
    await write(ctx, {
      companyId: rule.companyId,
      cycleId: null,
      actor: { kind: "user", id: owner._id, agent: null },
      type: "rule.approved",
      summary: `Rule active: ${String(rule.params.statement ?? rule.type)}`,
      refs: { ruleId },
      data: { backtest: rule.backtest },
    });
    await ctx.scheduler.runAfter(0, internal.checks.recheckCompany, {
      companyId: rule.companyId,
    });
  },
});

/** On makes an approved rule active again; off stops it feeding checks and pay. Owner only. */
export const toggle = mutation({
  args: { ruleId: v.id("rules"), userId, on: v.boolean() },
  handler: async (ctx, { ruleId, userId, on }) => {
    const rule = await ctx.db.get(ruleId);
    if (!rule) throw new ConvexError("rule not found");
    const owner = await assertOwner(ctx, rule.companyId, userId);
    if (on && !rule.provenance.approvedBy)
      throw new ConvexError("a proposed rule is turned on by approving it");
    await ctx.db.patch(ruleId, { status: on ? "active" : "off" });
    await write(ctx, {
      companyId: rule.companyId,
      cycleId: null,
      actor: { kind: "user", id: owner._id, agent: null },
      type: "rule.toggled",
      summary: `Rule turned ${on ? "on" : "off"}: ${String(rule.params.statement ?? rule.type)}`,
      refs: { ruleId },
      data: { on },
    });
    await ctx.scheduler.runAfter(0, internal.checks.recheckCompany, {
      companyId: rule.companyId,
    });
  },
});

async function assertOwner(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  who: string,
) {
  const id = ctx.db.normalizeId("workers", who);
  const person = id ? await ctx.db.get(id) : null;
  if (!person || person.companyId !== companyId || person.role !== "owner")
    throw new ConvexError("only the owner approves or switches rules");
  return person;
}

/** The Analyst restates an owner-typed rule; stored as proposed with a backtest for the owner to confirm (B-13). */
export const stateInPlainWords = action({
  args: { companyId: v.id("companies"), text: v.string(), userId },
  handler: async (ctx, { companyId, text, userId }): Promise<unknown> => {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new ConvexError(
        "restating a rule needs ANTHROPIC_API_KEY in Convex env; enter the rule's fields instead",
      );
    return ctx.runAction(internal.agents.analyst.restate, {
      companyId,
      text,
      userId,
    });
  },
});

/** Stores the restated rule: source owner_stated, proposed, backtested, labelled "not seen in history". */
export const storeStated = internalMutation({
  args: {
    companyId: v.id("companies"),
    payload: v.any(),
    text: v.string(),
    userId,
  },
  handler: async (ctx, { companyId, payload, text, userId }) => {
    const owner = await assertOwner(ctx, companyId, userId);
    const parsed = ProposedRules.safeParse(payload);
    const rule = parsed.success ? parsed.data.rules[0] : undefined;
    if (!rule)
      return {
        stored: null,
        missing: parsed.success
          ? parsed.data.missing
          : [
              {
                question: "Could you say that rule another way?",
                why: "it could not be read as one rule",
              },
            ],
      };
    const params = pairsToRecord(rule.params);
    const ruleId = await ctx.db.insert("rules", {
      companyId,
      type: rule.type,
      params: { ...params, statement: rule.statement },
      status: "proposed",
      source: "owner_stated",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: owner._id,
        approvedBy: null,
        approvedAt: null,
        evidence: ["stated by owner, not seen in history"],
      },
      backtest: backtest(
        { id: "candidate", companyId, type: rule.type, params } as Pick<
          EngineRule,
          "id" | "companyId" | "type" | "params"
        >,
        await pastCycles(ctx, companyId, "" as Id<"cycles">),
      ),
      confidence: rule.confidence,
    });
    await write(ctx, {
      companyId,
      cycleId: null,
      actor: { kind: "agent", id: "analyst", agent: "analyst" },
      type: "rule.restated",
      summary: `Owner's rule restated for confirmation: ${rule.statement}`,
      refs: { ruleId },
      data: { text },
    });
    return { stored: ruleId, missing: [] };
  },
});
