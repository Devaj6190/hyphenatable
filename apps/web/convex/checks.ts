import { pastGross } from "@payrollpilot/engine/checks/CHK-22";
import { runAll } from "@payrollpilot/engine/checks/index";
import {
  precedentFor,
  rulePrecedent,
  settlingRule,
} from "@payrollpilot/engine/checks/precedent";
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
import { startRun } from "./creaoRuns";

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

/** After the owner turns a rule on or off: the checks again on every cycle still being checked or asked about. */
export const recheckCompany = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const cycles = await ctx.db
      .query("cycles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    for (const c of cycles)
      if (c.stage === "checking" || c.stage === "asking")
        await runChecks(ctx, c._id, {
          kind: "system",
          id: "rules.changed",
          agent: null,
        });
  },
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
  actor: AuditInput["actor"] = {
    kind: "system",
    id: "checks.run",
    agent: null,
  },
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
    // CHK-22 history: regular + Venmo gross of the last 3 earlier cycles with payroll rows.
    const [cycles, pastPayrolls] = await Promise.all([
      ctx.db
        .query("cycles")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
      ctx.db
        .query("pastPayrolls")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
    ]);
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
      pastCycles: {
        gross: pastGross(cycle, cycles.map(toEngine), pastPayrolls),
      },
      rules: rules.map(toEngine),
      syncRuns: syncRuns.map(toEngine),
    } as unknown as CheckInput;
    const pastFlags = companyFlags.map(toEngine) as unknown as Flag[];

    const existing = new Map(
      companyFlags
        .filter((f) => f.cycleId === cycleId)
        .map((f) => [dedupeKey(f), f] as const),
    );
    const settle = (
      flagId: Id<"flags">,
      rule: { id: string; type: string },
      checkId: string,
    ) =>
      write(ctx, {
        companyId,
        cycleId,
        actor,
        type: "flag.settled_by_rule",
        summary: `${checkId} settled by owner-approved rule ${rule.id}`,
        refs: { flagId, ruleId: rule.id },
        data: { ruleType: rule.type },
      });
    const created: Id<"flags">[] = [];
    const byCheck: Record<string, number> = {};
    const found = runAll(input);
    for (const flag of found) {
      const key = dedupeKey(flag);
      // An owner-approved rule that already decides this rate settles the flag: kept, cited, not asked.
      const settledBy = settlingRule(flag, input);
      const had = existing.get(key);
      if (had) {
        // A rule approved since the flag was raised settles it the same way, if nobody has been texted yet.
        const question = had.questionId
          ? await ctx.db.get(had.questionId)
          : null;
        if (
          settledBy &&
          had.status === "open" &&
          (!question || question.status === "draft")
        ) {
          if (question) await ctx.db.patch(question._id, { status: "denied" });
          await ctx.db.patch(had._id, {
            status: "dismissed",
            // Engine ids are this deployment's ids (input is built from its docs), as the insert below trusts.
            precedent: rulePrecedent(settledBy) as Doc<"flags">["precedent"],
          });
          await settle(had._id, settledBy, flag.checkId);
        }
        continue;
      }
      const { id: _engineId, ...doc } = {
        ...flag,
        status: settledBy ? ("dismissed" as const) : flag.status,
        precedent: settledBy
          ? rulePrecedent(settledBy)
          : precedentFor(flag, { rules: input.rules, pastFlags }),
      };
      const flagId = await ctx.db.insert(
        "flags",
        doc as unknown as Omit<Doc<"flags">, "_id" | "_creationTime">,
      );
      created.push(flagId);
      byCheck[flag.checkId] = (byCheck[flag.checkId] ?? 0) + 1;
      if (settledBy) await settle(flagId, settledBy, flag.checkId);
    }

    // A re-run after the rules changed (rules.approve / toggle): an open engine flag the checks no longer raise is
    // closed, with why. Only before anyone was texted: a sent question or an answer stays for a person to settle.
    const raised = new Set(found.map(dedupeKey));
    const retracted: Id<"flags">[] = [];
    for (const f of companyFlags) {
      if (
        f.cycleId !== cycleId ||
        f.status !== "open" ||
        !f.checkId.startsWith("CHK-") ||
        raised.has(dedupeKey(f))
      )
        continue;
      const question = f.questionId ? await ctx.db.get(f.questionId) : null;
      if (question && question.status !== "draft") continue;
      if (question) await ctx.db.patch(question._id, { status: "denied" });
      await ctx.db.patch(f._id, { status: "dismissed" });
      retracted.push(f._id);
      await write(ctx, {
        companyId,
        cycleId,
        actor,
        type: "flag.retracted",
        summary: `${f.checkId} is no longer raised by the checks under the rules now in force`,
        refs: { flagId: f._id },
        data: { questionDenied: question?._id ?? null },
      });
    }

    const advanced = cycle.stage === "checking";
    if (advanced) await ctx.db.patch(cycleId, { stage: "asking" });
    // B-08: person-routed flags become draft questions for approval.
    if (created.length)
      await ctx.scheduler.runAfter(0, internal.questions.draftForCycle, {
        cycleId,
      });
    // creao-plan S3: after the checks, the Creao Auditor explains flags, proposes matches and writes
    // the morning brief. Only when Creao is configured, and not on a re-run after a rule change; the run row guards
    // against a double start.
    if (
      process.env.CREAO_API_KEY &&
      actor.kind === "system" &&
      actor.id !== "rules.changed"
    )
      await startRun(ctx, companyId, cycleId, "auditor", "checks finished");

    await write(ctx, {
      companyId,
      cycleId,
      actor,
      type: "checks.run",
      summary: `${created.length} new flags${retracted.length ? `, ${retracted.length} no longer raised` : ""}${advanced ? "; cycle moved to asking" : ""}`,
      refs: { cycleId },
      data: {
        created: created.length,
        retracted: retracted.length,
        byCheck,
        stage: advanced ? "asking" : cycle.stage,
      },
    });
    return { created, retracted, byCheck };
  }
}
