// Owned by C (Varnika). B-02 stubs the binding names; B adds snapshot/restore internals in controller/snapshot.ts (B-16).
import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { notYet } from "./lib/stub";

export const reset = mutation({
  args: {
    companyKey: v.string(),
    toCycle: v.union(v.literal(1), v.literal(2)),
  },
  handler: () => notYet("B-16 / C"),
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
