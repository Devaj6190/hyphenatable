// Owned by C (Varnika). B-02 stubs the binding names; B adds snapshot/restore internals in controller/snapshot.ts (B-16).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, mutation } from "./_generated/server";
import { notYet } from "./lib/stub";

/**
 * Puts a company back to a saved snapshot (`<companyKey>:<toCycle>`, taken with
 * controller/snapshot:take). Runs in the background; the dashboard's live queries update when done.
 */
export const reset = mutation({
  args: {
    companyKey: v.string(),
    toCycle: v.union(v.literal(1), v.literal(2)),
  },
  handler: async (ctx, { companyKey, toCycle }) => {
    await ctx.scheduler.runAfter(0, internal.controller.snapshot.restore, {
      label: `${companyKey}:${toCycle}`,
    });
    return { scheduled: true };
  },
});

/** Enter a judge's scenario (B-15). */
export const scenario = mutation({
  args: { companyId: v.id("companies"), name: v.string() },
  handler: () => notYet("B-15 / C"),
});

/** Demo mode only; every message it produces is labelled simulated. */
export const simulatedReply = action({
  args: { questionId: v.id("questions") },
  handler: () => notYet("B-15 / C"),
});
