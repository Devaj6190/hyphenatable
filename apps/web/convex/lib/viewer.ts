// Role-based reads (spec 8: "a job manager never sees others' pay"). Pay is removed on the server so it
// never reaches a manager's browser. ponytail: the viewer is whoever the page says it is (`viewerId`),
// so this stops pay from being shipped by default but is not access control; with auth (cut-order item 5),
// derive the worker from ctx.auth.getUserIdentity() here and keep every caller unchanged.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type Viewer =
  | { role: "owner"; workerId: Id<"workers"> }
  | { role: "manager"; workerId: Id<"workers">; crew: Set<string> };

/** Owner sees everything; a manager sees their crew; anyone else has no dashboard. */
export async function resolveViewer(
  ctx: QueryCtx,
  viewerId: Id<"workers">,
  companyId: Id<"companies">,
): Promise<Viewer> {
  const worker = await ctx.db.get(viewerId);
  if (!worker || worker.companyId !== companyId)
    throw new ConvexError("unknown viewer for this company");
  if (worker.role === "owner") return { role: "owner", workerId: viewerId };
  if (worker.role !== "manager")
    throw new ConvexError("no dashboard access for this role");
  const crew = await ctx.db
    .query("workers")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  return {
    role: "manager",
    workerId: viewerId,
    crew: new Set(
      crew
        .filter((w) => w.managerId === viewerId || w._id === viewerId)
        .map((w) => w._id),
    ),
  };
}

type FlagLike = Pick<Doc<"flags">, "routeTo" | "subject" | "affects">;

/**
 * A manager sees manager-routed flags about their crew, plus manager-routed job flags that name no
 * worker (job facts go to the job manager). Owner-routed flags are money or policy and stay with the owner.
 */
export function canSee(viewer: Viewer, flag: FlagLike): boolean {
  if (viewer.role === "owner") return true;
  if (flag.routeTo !== "manager") return false;
  const workerId = flag.subject.workerId;
  return workerId === null || viewer.crew.has(workerId);
}

/** Drops the pay a flag affects unless the owner is looking. */
export function redactFlag<F extends FlagLike>(viewer: Viewer, flag: F) {
  if (viewer.role === "owner") return flag;
  return { ...flag, affects: { ...flag.affects, dollarsCents: null } };
}

type CorrectionLike = Pick<
  Doc<"corrections">,
  "target" | "before" | "after" | "effectPayCents" | "effectProfitCents"
>;

/** Drops the pay and profit effect, and before/after when the corrected field is itself money or a rate. */
export function redactCorrection<C extends CorrectionLike>(
  viewer: Viewer,
  correction: C,
) {
  if (viewer.role === "owner") return correction;
  const moneyField = /cents|rate/i.test(correction.target.field);
  return {
    ...correction,
    effectPayCents: null,
    effectProfitCents: null,
    before: moneyField ? null : correction.before,
    after: moneyField ? null : correction.after,
  };
}
