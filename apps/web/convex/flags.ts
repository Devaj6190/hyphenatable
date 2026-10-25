import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { readableSeen } from "./lib/labels";
import {
  canSee,
  redactCorrection,
  redactFlag,
  resolveViewer,
  type Viewer,
} from "./lib/viewer";

/** What a viewer gets for a flag: pay dropped for a manager, and the sentence in words, not record ids. */
async function present(
  ctx: QueryCtx,
  viewer: Viewer,
  flag: Doc<"flags">,
  timezone: string,
) {
  return {
    ...redactFlag(viewer, flag),
    seen: await readableSeen(ctx, flag.seen, timezone, viewer.role !== "owner"),
  };
}

const timezoneOf = async (ctx: QueryCtx, flag: Doc<"flags">) =>
  (await ctx.db.get(flag.companyId))?.timezone ?? "UTC";

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
    const timezone = (await ctx.db.get(companyId))?.timezone ?? "UTC";
    return Promise.all(
      rows
        .filter(
          (f) =>
            f.companyId === companyId &&
            (!status || f.status === status) &&
            canSee(viewer, f),
        )
        .map((f) => present(ctx, viewer, f, timezone)),
    );
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
      flag: await present(ctx, viewer, flag, await timezoneOf(ctx, flag)),
      question: flag.questionId ? await ctx.db.get(flag.questionId) : null,
      correction: correction && redactCorrection(viewer, correction),
    };
  },
});
