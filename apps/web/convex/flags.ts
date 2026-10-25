import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  canSee,
  redactCorrection,
  redactFlag,
  resolveViewer,
} from "./lib/viewer";

const status = v.union(
  v.literal("open"),
  v.literal("asked"),
  v.literal("answered"),
  v.literal("corrected"),
  v.literal("dismissed"),
  v.literal("held"),
);

/** `viewerId` is the worker looking (owner or manager); a manager gets their crew's flags without pay. */
export const list = query({
  args: {
    companyId: v.id("companies"),
    viewerId: v.id("workers"),
    cycleId: v.optional(v.id("cycles")),
    status: v.optional(status),
  },
  handler: async (ctx, { companyId, viewerId, cycleId, status }) => {
    const viewer = await resolveViewer(ctx, viewerId, companyId);
    const rows = cycleId
      ? await ctx.db
          .query("flags")
          .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
          .collect()
      : await ctx.db
          .query("flags")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect();
    return rows
      .filter(
        (f) =>
          f.companyId === companyId &&
          (!status || f.status === status) &&
          canSee(viewer, f),
      )
      .map((f) => redactFlag(viewer, f));
  },
});

export const get = query({
  args: { flagId: v.id("flags"), viewerId: v.id("workers") },
  handler: async (ctx, { flagId, viewerId }) => {
    const flag = await ctx.db.get(flagId);
    if (!flag) return null;
    const viewer = await resolveViewer(ctx, viewerId, flag.companyId);
    if (!canSee(viewer, flag)) return null;
    const correction = flag.correctionId
      ? await ctx.db.get(flag.correctionId)
      : null;
    return {
      flag: redactFlag(viewer, flag),
      question: flag.questionId ? await ctx.db.get(flag.questionId) : null,
      correction: correction && redactCorrection(viewer, correction),
    };
  },
});
