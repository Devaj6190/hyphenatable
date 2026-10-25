import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { approveGate1 } from "./controller/cycle";
import { notYet } from "./lib/stub";
import { stage, userId } from "./lib/validators";
import { resolveViewer } from "./lib/viewer";

/** The workbook is pay, line by line: owner only. */
export const get = query({
  args: { cycleId: v.id("cycles"), stage, viewerId: v.id("workers") },
  handler: async (ctx, { cycleId, stage, viewerId }) => {
    const cycle = await ctx.db.get(cycleId);
    if (!cycle) return null;
    const viewer = await resolveViewer(ctx, viewerId, cycle.companyId);
    if (viewer.role !== "owner")
      throw new ConvexError("the workbook is owner only");
    return ctx.db
      .query("drafts")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId).eq("stage", stage))
      .order("desc")
      .first();
  },
});

/** Owner only; refuses on incomplete syncs (B-11). Stage 2 (the off-cycle draft) is P1 (B-17). */
export const approveGate = mutation({
  args: { cycleId: v.id("cycles"), stage, userId },
  handler: async (ctx, { cycleId, stage, userId }) => {
    if (stage === 2) return notYet("B-17");
    return approveGate1(ctx, cycleId, userId);
  },
});

/** prepare, update, calculate. There is no submit, here or anywhere (B-12). */
export const fillGusto = action({
  args: { cycleId: v.id("cycles"), stage },
  handler: () => notYet("B-12"),
});
