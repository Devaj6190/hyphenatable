// First-hour checks H5 and H7 (shared-context 4.3). Kept as a health check after G0.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export const list = query({
  args: {},
  handler: (ctx) => ctx.db.query("ping").order("desc").take(10),
});

/** H5: a mutation that schedules a write 5 s later; the subscribed page shows it land. */
export const schedule = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(5000, internal.probe.write, {
      note: "scheduled +5s",
    });
  },
});

export const write = internalMutation({
  args: { note: v.string() },
  handler: (ctx, { note }) =>
    ctx.db.insert("ping", { note, at: new Date().toISOString() }),
});

export const insertVectors = internalMutation({
  args: {
    rows: v.array(
      v.object({
        companyId: v.string(),
        text: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    for (const old of await ctx.db.query("probeVectors").collect())
      await ctx.db.delete(old._id);
    for (const row of rows) await ctx.db.insert("probeVectors", row);
  },
});

export const vectorRows = internalQuery({
  args: { ids: v.array(v.id("probeVectors")) },
  handler: async (ctx, { ids }) =>
    (await Promise.all(ids.map((id) => ctx.db.get(id)))).map(
      (r) => r && { companyId: r.companyId, text: r.text },
    ),
});
