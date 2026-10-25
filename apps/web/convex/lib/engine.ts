// Convex docs in the engine's shapes, for the payroll math (B-10, B-11). The cast trusts
// tests/schema-mirror.test.ts to keep both shapes equal.
import type { PayrollInput } from "@payrollpilot/engine/corrections/corrections";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** `_id` becomes `id`; `_creationTime` is dropped. */
export function toEngine<T extends { _id: string; _creationTime: number }>(
  doc: T,
) {
  const { _id, _creationTime, ...rest } = doc;
  return { ...rest, id: _id };
}

/** Flags that still dispute their entries: those entries stay out of the draft (plan B 4.1). */
const UNRESOLVED = new Set(["open", "asked", "answered", "held"]);

/**
 * Everything Stage 1 needs for one cycle. Held flags always hold their entries; with
 * `holdUnresolved`, so does every flag still open, asked or answered (the Gate 1 draft), except
 * `except` (the flag a correction is about, whose effect is being measured).
 */
export async function payrollInput(
  ctx: QueryCtx,
  cycleId: Id<"cycles">,
  opts: { holdUnresolved?: boolean; except?: Id<"flags"> } = {},
): Promise<PayrollInput> {
  const cycle = await ctx.db.get(cycleId);
  if (!cycle) throw new ConvexError("cycle not found");
  const company = await ctx.db.get(cycle.companyId);
  if (!company) throw new ConvexError("company not found");
  const companyId = company._id;
  const [workers, entries, expenses, rules, flags] = await Promise.all([
    ctx.db
      .query("workers")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("timeEntries")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect(),
    ctx.db
      .query("expenses")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("rules")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("flags")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect(),
  ]);
  return {
    company: toEngine(company),
    cycle: toEngine(cycle),
    workers: workers.map(toEngine),
    entries: entries.map(toEngine),
    expenses: expenses.map(toEngine),
    rules: rules.map(toEngine),
    heldFlags: flags
      .filter(
        (f) =>
          f._id !== opts.except &&
          (f.status === "held" ||
            // Notes nobody needs to answer (routeTo "none") never hold pay.
            (opts.holdUnresolved &&
              f.routeTo !== "none" &&
              UNRESOLVED.has(f.status))),
      )
      // The engine holds flags whose status is "held".
      .map((f) => ({ ...toEngine(f), status: "held" })),
  } as unknown as PayrollInput;
}
