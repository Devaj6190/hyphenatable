import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
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

/** Separation of duties: userId must differ from provenance.answeredBy (B-14). */
export const approve = mutation({
  args: { ruleId: v.id("rules"), userId },
  handler: () => notYet("B-14"),
});

export const toggle = mutation({
  args: { ruleId: v.id("rules"), userId, on: v.boolean() },
  handler: () => notYet("B-14"),
});

/** The Analyst restates an owner-typed rule; stored as proposed with a backtest (B-13). */
export const stateInPlainWords = action({
  args: { companyId: v.id("companies"), text: v.string(), userId },
  handler: () => notYet("B-13"),
});
