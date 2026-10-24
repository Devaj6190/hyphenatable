import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

/** Newest first. B-04 adds audit.write and the append-only guard. */
export const list = query({
  args: {
    companyId: v.id("companies"),
    cycleId: v.optional(v.id("cycles")),
    types: v.optional(v.array(v.string())),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { companyId, cycleId, types, paginationOpts }) => {
    const base = cycleId
      ? ctx.db
          .query("auditEvents")
          .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      : ctx.db
          .query("auditEvents")
          .withIndex("by_company", (q) => q.eq("companyId", companyId));
    const filtered = types?.length
      ? base.filter((f) => f.or(...types.map((t) => f.eq(f.field("type"), t))))
      : base;
    return filtered.order("desc").paginate(paginationOpts);
  },
});
