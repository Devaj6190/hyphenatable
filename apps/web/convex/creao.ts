// B-19: tools the Creao nightly agent calls through POST /mcp and POST /agent/<tool> (http.ts). Ids, dates, check ids,
// statuses and check sentences only: no names, contact refs or money ever leave through here.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalQuery } from "./_generated/server";

export const listCycles = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("cycles").collect()).map((c) => ({
      cycleId: c._id,
      companyId: c.companyId,
      number: c.number,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      cutoffAt: c.cutoffAt,
      stage: c.stage,
    })),
});

export const getFlags = internalQuery({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) =>
    (
      await ctx.db
        .query("flags")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
        .collect()
    ).map((f) => ({
      flagId: f._id,
      checkId: f.checkId,
      status: f.status,
      routeTo: f.routeTo,
      confidence: f.confidence,
      subject: f.subject,
      // Check sentences carry ids, hours and dates only (checks never put money in `seen`).
      seen: f.seen,
      precedent: f.precedent?.note ?? null,
    })),
});

const cycleArg = {
  type: "object",
  properties: {
    cycleId: { type: "string", description: "A cycleId from list_cycles" },
  },
  required: ["cycleId"],
} as const;

export const TOOLS = [
  {
    name: "list_cycles",
    description:
      "Pay cycles with their stage. Start here to pick the cycle to check.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "run_checks",
    description:
      "Run every deterministic payroll check on a cycle. Stores new flags (never duplicates) and returns counts by check id.",
    inputSchema: cycleArg,
  },
  {
    name: "get_flags",
    description:
      "Flags for a cycle: check id, status, who it routes to, subject ids and what was seen. Use it to write the owner's morning list.",
    inputSchema: cycleArg,
  },
] as const;

export async function callTool(
  ctx: ActionCtx,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const cycleId = args.cycleId as Id<"cycles">;
  switch (name) {
    case "list_cycles":
      return ctx.runQuery(internal.creao.listCycles, {});
    case "run_checks":
      return ctx.runMutation(internal.checks.runAsAgent, { cycleId });
    case "get_flags":
      return ctx.runQuery(internal.creao.getFlags, { cycleId });
    default:
      throw new Error(`unknown tool ${name}`);
  }
}
