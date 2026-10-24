import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { notYet } from "./lib/stub";
import { stage, userId } from "./lib/validators";

export const get = query({
  args: { cycleId: v.id("cycles"), stage },
  handler: (ctx, { cycleId, stage }) =>
    ctx.db
      .query("drafts")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId).eq("stage", stage))
      .order("desc")
      .first(),
});

/** Owner only; refuses on incomplete syncs (B-11). */
export const approveGate = mutation({
  args: { cycleId: v.id("cycles"), stage, userId },
  handler: () => notYet("B-11"),
});

/** prepare, update, calculate. There is no submit, here or anywhere (B-12). */
export const fillGusto = action({
  args: { cycleId: v.id("cycles"), stage },
  handler: () => notYet("B-12"),
});
