import { v } from "convex/values";
import { query } from "./_generated/server";

type Summary = {
  m1: null | { recall: number; precision: number; measuredAt: string };
  m3: null | { cycle: number; questionsAsked: number }[];
  m5: null | { complete: number; total: number };
  m6: null | { traceable: number; total: number };
};

/**
 * M3, M5, M6 measured from this deployment's records. M1 needs the answer key, which the deployment
 * never holds (the model must never see it): A's eval/ measures it offline into eval/results.json.
 * null = not measured; a target is never shown as a result (B-16).
 */
export const summary = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<Summary> => {
    const cycles = await ctx.db
      .query("cycles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const runs = await ctx.db
      .query("syncRuns")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const asked = cycles.filter(
      (c) => c.stage !== "setup" && c.stage !== "syncing",
    );
    return {
      m1: null,
      m3: asked.length
        ? asked
            .sort((a, b) => a.number - b.number)
            .map((c) => ({ cycle: c.number, questionsAsked: c.questionsAsked }))
        : null,
      m5: runs.length
        ? {
            complete: runs.filter((r) => r.complete).length,
            total: runs.length,
          }
        : null,
      // Traceable: the flag points at its source record(s) and names its check (a CHK id is the rule;
      // an AGT-01 flag cites the Auditor's evidence ids in `where`).
      m6: flags.length
        ? {
            traceable: flags.filter((f) => f.where.length > 0).length,
            total: flags.length,
          }
        : null,
    };
  },
});
