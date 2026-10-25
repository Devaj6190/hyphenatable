// Owned by C (Varnika). Kept out of demo.ts so B's demo reset (B-16) owns that file alone.
import { query } from "./_generated/server";

/**
 * Demo mode: who the dashboard can look at a company as. The dashboard finds the owner and the manager here, by role,
 * instead of from pasted row ids (those change when the database is reseeded). Ids, names and roles only: no pay,
 * no rates, no contact references. Empty unless DEMO_MODE=1 is set in the Convex environment.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_MODE !== "1")
      return { demoMode: false, companies: [], workers: [] };
    const companies = await ctx.db.query("companies").collect();
    const workers = await ctx.db.query("workers").collect();
    return {
      demoMode: true,
      companies: companies.map((c) => ({
        id: c._id,
        name: c.name,
        kind: c.kind,
      })),
      workers: workers.map((w) => ({
        id: w._id,
        companyId: w.companyId,
        displayName: w.displayName,
        role: w.role,
        managerId: w.managerId,
      })),
    };
  },
});
