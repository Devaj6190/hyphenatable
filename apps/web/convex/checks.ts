import { runAll } from "@payrollpilot/engine/checks/index";
import { precedentFor } from "@payrollpilot/engine/checks/precedent";
import type { CheckInput } from "@payrollpilot/engine/checks/types";
import type { Flag } from "@payrollpilot/engine/schemas";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "./_generated/server";
import { type AuditInput, write } from "./audit";

/** A Convex doc in the engine's shape: `_id` becomes `id`. */
function toEngine<T extends { _id: string; _creationTime: number }>(doc: T) {
  const { _id, _creationTime, ...rest } = doc;
  return { ...rest, id: _id };
}

/** One flag per check and subject, whatever its status: a dismissed flag is never re-opened by a re-run. */
const dedupeKey = (f: Pick<Flag, "checkId" | "subject">) =>
  JSON.stringify([
    f.checkId,
    f.subject.workerId,
    f.subject.jobId,
    [...f.subject.entryIds].sort(),
    [...f.subject.expenseIds].sort(),
  ]);

/** Runs every deterministic check over one cycle, stores new flags, moves `checking → asking`. */
export const run = mutation({
  args: { cycleId: v.id("cycles") },
  handler: (ctx, { cycleId }) => runChecks(ctx, cycleId),
});

/** The controller's call after a sync (controller/cycle.ts afterSync). */
export const runInternal = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: (ctx, { cycleId }) => runChecks(ctx, cycleId),
});

/** The same run started by a Creao agent through /agent/run_checks (B-19); the audit log names it. */
export const runAsAgent = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: (ctx, { cycleId }) =>
    runChecks(ctx, cycleId, { kind: "agent", id: "auditor", agent: "auditor" }),
});

async function runChecks(
  ctx: MutationCtx,
  cycleId: Id<"cycles">,
  actor: AuditInput["actor"] = { kind: "system", id: "checks.run", agent: null },
) {
  {
    const cycle = await ctx.db.get(cycleId);
    if (!cycle) throw new ConvexError("cycle not found");
    const company = await ctx.db.get(cycle.companyId);
    if (!company) throw new ConvexError("company not found");
    const companyId = company._id;
    // ponytail: one line per table; a generic helper over table names does not typecheck withIndex.
    const [workers, jobs, visits, quotes, invoices, payments, expenses, rules] =
      await Promise.all([
        ctx.db
          .query("workers")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("jobs")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("visits")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("quotes")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("invoices")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("payments")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("expenses")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
        ctx.db
          .query("rules")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .collect(),
      ]);
    const timeEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect();
    const syncRuns = await ctx.db
      .query("syncRuns")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect();
    // Chronological (index order is _creationTime within the company), as precedentFor expects.
    const companyFlags = await ctx.db
      .query("flags")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();

    // ponytail: the doc → engine cast trusts schema-mirror.test.ts to keep both shapes equal.
    const input = {
      company: toEngine(company),
      cycle: toEngine(cycle),
      workers: workers.map(toEngine),
      timeEntries: timeEntries.map(toEngine),
      jobs: jobs.map(toEngine),
      visits: visits.map(toEngine),
      quotes: quotes.map(toEngine),
      invoices: invoices.map(toEngine),
      payments: payments.map(toEngine),
      expenses: expenses.map(toEngine),
      // ponytail: CHK-22 is not in the registry yet; it fills this from pastPayrolls when it lands.
      pastCycles: { gross: {} },
      rules: rules.map(toEngine),
      syncRuns: syncRuns.map(toEngine),
    } as unknown as CheckInput;
    const pastFlags = companyFlags.map(toEngine) as unknown as Flag[];

    const existing = new Set(
      companyFlags.filter((f) => f.cycleId === cycleId).map(dedupeKey),
    );
    const created: Id<"flags">[] = [];
    const byCheck: Record<string, number> = {};
    for (const flag of runAll(input)) {
      const key = dedupeKey(flag);
      if (existing.has(key)) continue;
      existing.add(key);
      const { id: _engineId, ...doc } = {
        ...flag,
        precedent: precedentFor(flag, { rules: input.rules, pastFlags }),
      };
      created.push(
        await ctx.db.insert(
          "flags",
          doc as unknown as Omit<Doc<"flags">, "_id" | "_creationTime">,
        ),
      );
      byCheck[flag.checkId] = (byCheck[flag.checkId] ?? 0) + 1;
    }

    const advanced = cycle.stage === "checking";
    if (advanced) await ctx.db.patch(cycleId, { stage: "asking" });
    // B-08: person-routed flags become draft questions for approval.
    if (created.length)
      await ctx.scheduler.runAfter(0, internal.questions.draftForCycle, {
        cycleId,
      });

    await write(ctx, {
      companyId,
      cycleId,
      actor,
      type: "checks.run",
      summary: `${created.length} new flags${advanced ? "; cycle moved to asking" : ""}`,
      refs: { cycleId },
      data: {
        created: created.length,
        byCheck,
        stage: advanced ? "asking" : cycle.stage,
      },
    });
    return { created, byCheck };
  }
}
