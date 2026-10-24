import { v } from "convex/values";
import { query } from "./_generated/server";

const status = v.union(
  v.literal("open"),
  v.literal("asked"),
  v.literal("answered"),
  v.literal("corrected"),
  v.literal("dismissed"),
  v.literal("held"),
);

export const list = query({
  args: {
    companyId: v.id("companies"),
    cycleId: v.optional(v.id("cycles")),
    status: v.optional(status),
  },
  handler: async (ctx, { companyId, cycleId, status }) => {
    const rows = cycleId
      ? await ctx.db
          .query("flags")
          .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
          .collect()
      : await ctx.db
          .query("flags")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect();
    return rows.filter(
      (f) => f.companyId === companyId && (!status || f.status === status),
    );
  },
});

export const get = query({
  args: { flagId: v.id("flags") },
  handler: async (ctx, { flagId }) => {
    const flag = await ctx.db.get(flagId);
    if (!flag) return null;
    return {
      flag,
      question: flag.questionId ? await ctx.db.get(flag.questionId) : null,
      correction: flag.correctionId
        ? await ctx.db.get(flag.correctionId)
        : null,
    };
  },
});
