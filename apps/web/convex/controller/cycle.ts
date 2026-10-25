// B-11: the cycle's stage machine (plan B 4.1). Transitions are mutations with explicit preconditions;
// nothing else moves a stage. Long work is scheduled, never awaited here.

import { localDate } from "@payrollpilot/engine/payroll/hours";
import { zonedToUtc } from "@payrollpilot/engine/questions/questions";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { write } from "../audit";
import { recomputeDraft } from "./recompute";

/** Sync objects Gate 1 needs complete (plan B 4.1): time sheets, users, compensations. */
export const STAGE1_OBJECTS = [
  "timeSheetEntries",
  "users",
  "employees",
  "compensations",
] as const;

/** Flags settled for Gate 1: corrected, dismissed, held (paid without the disputed entries) or notes. */
const settled = (f: Doc<"flags">) =>
  f.routeTo === "none" ||
  f.status === "corrected" ||
  f.status === "dismissed" ||
  f.status === "held";

async function move(
  ctx: MutationCtx,
  cycle: Doc<"cycles">,
  to: Doc<"cycles">["stage"],
  summary: string,
  actor: Doc<"auditEvents">["actor"] = {
    kind: "system",
    id: "controller",
    agent: null,
  },
) {
  await ctx.db.patch(cycle._id, { stage: to });
  await write(ctx, {
    companyId: cycle.companyId,
    cycleId: cycle._id,
    actor,
    type: "cycle.stage",
    summary: `${cycle.stage} → ${to}: ${summary}`,
    refs: { cycleId: cycle._id },
    data: { from: cycle.stage, to },
  });
}

/** Creates the next cycle for a company. Cutoff: 6 pm company time on the period's last day. */
export async function startCycle(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  periodStart: string,
  periodEnd: string,
) {
  const company = await ctx.db.get(companyId);
  if (!company) throw new ConvexError("company not found");
  if (!(Date.parse(periodStart) < Date.parse(periodEnd)))
    throw new ConvexError("periodStart must be before periodEnd");
  const cycles = await ctx.db
    .query("cycles")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  if (cycles.some((c) => c.periodStart === periodStart))
    throw new ConvexError("a cycle for this period already exists");
  const lastDay = localDate(periodEnd, company.timezone);
  const cycleId = await ctx.db.insert("cycles", {
    companyId,
    number: Math.max(0, ...cycles.map((c) => c.number)) + 1,
    periodStart,
    periodEnd,
    cutoffAt: zonedToUtc(lastDay, 18, 0, company.timezone),
    stage: "syncing",
    gustoPayrollId: null,
    gustoOffCyclePayrollId: null,
    questionsAsked: 0,
  });
  await write(ctx, {
    companyId,
    cycleId,
    actor: { kind: "system", id: "controller", agent: null },
    type: "cycle.started",
    summary: `Cycle for ${periodStart.slice(0, 10)} to ${periodEnd.slice(0, 10)} started; waiting for the sync`,
    refs: { cycleId },
    data: null,
  });
  return cycleId;
}

/**
 * syncing → checking once the time sheets have a sync run (complete or not: an incomplete pull is
 * CHK-23 and blocks only what it covers), then runs the checks.
 */
export const afterSync = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) => {
    const cycle = await ctx.db.get(cycleId);
    // "setup" is an ingested cycle that never went through cycles.start.
    if (!cycle || (cycle.stage !== "syncing" && cycle.stage !== "setup"))
      return;
    const runs = await ctx.db
      .query("syncRuns")
      .withIndex("by_cycle", (q) =>
        q.eq("cycleId", cycleId).eq("object", "timeSheetEntries"),
      )
      .collect();
    if (!runs.length) return;
    await move(ctx, cycle, "checking", "time sheets synced");
    await ctx.scheduler.runAfter(0, internal.checks.runInternal, { cycleId });
  },
});

/** asking → gate1_ready when every flag is settled; the draft holds whatever is still disputed. */
export const gate1Check = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) => {
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.stage !== "asking") return;
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect();
    const open = flags.filter((f) => !settled(f));
    if (open.length) return;
    await recomputeDraft(ctx, cycleId, { reason: "gate 1 ready" });
    await move(
      ctx,
      cycle,
      "gate1_ready",
      `every flag settled (${flags.filter((f) => f.status === "held").length} held)`,
    );
  },
});

/**
 * Gate 1, owner only: refuses on an incomplete Stage 1 sync, approves the draft and moves the
 * cycle on. The Gusto writer (B-12) fills the draft; the owner submits in Gusto. No submit here.
 */
export async function approveGate1(
  ctx: MutationCtx,
  cycleId: Id<"cycles">,
  userId: string,
) {
  const cycle = await ctx.db.get(cycleId);
  if (!cycle) throw new ConvexError("cycle not found");
  const id = ctx.db.normalizeId("workers", userId);
  const owner = id ? await ctx.db.get(id) : null;
  if (!owner || owner.companyId !== cycle.companyId || owner.role !== "owner")
    throw new ConvexError("only the owner approves a gate");
  if (cycle.stage !== "gate1_ready")
    throw new ConvexError(`cycle is ${cycle.stage}, not gate1_ready`);
  const runs = await ctx.db
    .query("syncRuns")
    .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
    .collect();
  const latest = new Map<string, Doc<"syncRuns">>();
  for (const r of runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt)))
    latest.set(`${r.source}:${r.object}`, r);
  const needed = [...latest.values()].filter((r) =>
    (STAGE1_OBJECTS as readonly string[]).includes(r.object),
  );
  const incomplete = needed.filter((r) => !r.complete);
  if (!needed.some((r) => r.object === "timeSheetEntries"))
    throw new ConvexError("no time sheet sync for this cycle; Gate 1 refused");
  if (incomplete.length)
    throw new ConvexError(
      `incomplete sync: ${incomplete.map((r) => `${r.source} ${r.object} (${r.pulled} of ${r.expected ?? "?"})`).join(", ")}; Gate 1 refused`,
    );
  const draft = await ctx.db
    .query("drafts")
    .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId).eq("stage", 1))
    .order("desc")
    .first();
  if (!draft) throw new ConvexError("no Stage 1 draft to approve");
  await ctx.db.patch(draft._id, { status: "approved" });
  await write(ctx, {
    companyId: cycle.companyId,
    cycleId,
    actor: { kind: "user", id: owner._id, agent: null },
    type: "gate.approved",
    summary: `Gate 1 approved: workbook v${draft.workbookVersion}, ${draft.totals.hours} h`,
    refs: { cycleId, draftId: draft._id },
    data: { grossCents: draft.totals.grossCents },
  });
  return draft._id;
}

/** Daily cron: starts the next cycle for companies whose last period has ended (no-op in demo mode). */
export const startDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_MODE === "1") return;
    const now = Date.now();
    for (const company of await ctx.db.query("companies").collect()) {
      const last = await ctx.db
        .query("cycles")
        .withIndex("by_company", (q) => q.eq("companyId", company._id))
        .order("desc")
        .first();
      if (!last || Date.parse(last.periodEnd) > now) continue;
      const days = company.payFrequency === "weekly" ? 7 : 14;
      const start = new Date(Date.parse(last.periodEnd) + 1).toISOString();
      const end = new Date(
        Date.parse(last.periodEnd) + days * 86_400_000,
      ).toISOString();
      await startCycle(ctx, company._id, start, end);
    }
  },
});
