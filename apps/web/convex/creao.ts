// B-19 / creao-plan S1, S4, S5: tools the Creao agents call through POST /mcp and POST /agent/<tool> (http.ts). Ids, dates, check ids,
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
  {
    name: "get_unmatched",
    description:
      "Auditor: entries and purchases with no job (CHK-01, CHK-14) with the jobs they could belong to (likely ones first). Ids, dates, hours, job numbers and titles only.",
    inputSchema: cycleArg,
  },
  {
    name: "propose_matches",
    description:
      "Auditor: propose a job for unmatched flags. proposals: [{ flagId, decision: { kind: match|no_match|ask, jobId, confidence 0-1, reason ≤160 } }]. A match under 0.85 is turned into an ask by code; a match becomes a correction a person approves.",
    inputSchema: withList("proposals"),
  },
  {
    name: "propose_flags",
    description:
      "Auditor: raise AGT-01 flags for vague cases the fixed checks miss. flags: [{ subject: { workerId, jobId, entryIds, expenseIds }, reason ≤300, evidence: [record ids], confidence }]. Always a question to the owner; never blocks or corrects.",
    inputSchema: withList("flags"),
  },
  {
    name: "propose_brief",
    description:
      "Auditor: the owner's morning brief, plain words, ids not names. brief: { text ≤4000 }.",
    inputSchema: {
      type: "object",
      properties: {
        cycleId: cycleArg.properties.cycleId,
        brief: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      required: ["cycleId", "brief"],
    },
  },
  {
    name: "get_routed_flags",
    description:
      "Messenger: open flags routed to a person that no template question covers, with the worker's role.",
    inputSchema: cycleArg,
  },
  {
    name: "propose_questions",
    description:
      "Messenger: draft one short question per flag. proposals: [{ flagId, draft: { text ≤240, options ≤4 (≤40 chars each) or null, kind: text|poll, toRole: owner|manager|employee, reason ≤160 } }]. Never money; the owner or manager approves before anything is sent.",
    inputSchema: withList("proposals"),
  },
] as const;

function withList(field: string) {
  return {
    type: "object",
    properties: {
      cycleId: cycleArg.properties.cycleId,
      [field]: { type: "array", items: { type: "object" } },
    },
    required: ["cycleId", field],
  } as const;
}

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
    case "get_unmatched":
      return ctx.runQuery(internal.agentApi.unmatched, { cycleId });
    case "propose_matches":
      return ctx.runMutation(internal.agentApi.proposeMatches, {
        cycleId,
        proposals: args.proposals,
      });
    case "propose_flags":
      return ctx.runMutation(internal.agentApi.proposeFlags, {
        cycleId,
        flags: args.flags,
      });
    case "propose_brief":
      return ctx.runMutation(internal.agentApi.proposeBrief, {
        cycleId,
        brief: args.brief,
      });
    case "get_routed_flags":
      return ctx.runQuery(internal.agentApi.routedWithoutQuestion, { cycleId });
    case "propose_questions":
      return ctx.runMutation(internal.agentApi.proposeQuestions, {
        cycleId,
        proposals: args.proposals,
      });
    default:
      throw new Error(`unknown tool ${name}`);
  }
}
