import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, type MutationCtx, mutation, query } from "./_generated/server";
import { write } from "./audit";
import { notYet } from "./lib/stub";
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
    if (rule.provenance.answeredBy === owner._id)
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

/** The Analyst restates an owner-typed rule; stored as proposed with a backtest (B-13). */
export const stateInPlainWords = action({
  args: { companyId: v.id("companies"), text: v.string(), userId },
  handler: () => notYet("B-13"),
});
