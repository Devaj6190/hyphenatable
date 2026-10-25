import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";

export type AuditInput = Omit<
  Doc<"auditEvents">,
  "_id" | "_creationTime" | "at"
>;

/**
 * The only writer of `auditEvents`. Append-only: nothing in convex/ patches or deletes the table
 * (CI greps for it). A mutation that throws rolls back its own event; callers that must record a
 * failure catch, write `*.failed`, and return.
 */
export async function write(ctx: MutationCtx, event: AuditInput) {
  return ctx.db.insert("auditEvents", {
    ...event,
    at: new Date().toISOString(),
  });
}

/** Newest first. */
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
