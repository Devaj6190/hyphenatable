import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { notYet } from "./lib/stub";

export const start = mutation({
  args: {
    companyId: v.id("companies"),
    periodStart: v.string(),
    periodEnd: v.string(),
  },
  handler: () => notYet("B-11"),
});

export const get = query({
  args: { cycleId: v.id("cycles") },
  handler: (ctx, { cycleId }) => ctx.db.get(cycleId),
});

export const list = query({
  args: { companyId: v.id("companies") },
  handler: (ctx, { companyId }) =>
    ctx.db
      .query("cycles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .collect(),
});
