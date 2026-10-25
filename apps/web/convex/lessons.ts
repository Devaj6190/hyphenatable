// B-14: the learning contract (shared context section 11). Evaluate → compare → backtest → approve →
// apply. agents/learn.ts embeds and classifies; this file reads what that needs and stores the result.
import type { CheckInput } from "@payrollpilot/engine/checks/types";
import {
  backtest,
  canonical,
  type LessonDraft,
  LOW_RISK,
  lessonFromAnswer,
  type PastCycle,
} from "@payrollpilot/engine/lessons/lessons";
import { issuePhrases } from "@payrollpilot/engine/messages/templates";
import { hours2 } from "@payrollpilot/engine/payroll/money";
import type { Rule } from "@payrollpilot/engine/schemas";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { write } from "./audit";
import { toEngine } from "./lib/engine";

export const from = v.union(
  v.object({
    kind: v.literal("correction"),
    correctionId: v.id("corrections"),
  }),
  v.object({
    kind: v.literal("confirm"),
    interpretationId: v.id("interpretations"),
  }),
);

/** The question a correction or confirmation answered, and the flag it was about. */
async function source(
  ctx: QueryCtx,
  f:
    | { kind: "correction"; correctionId: Id<"corrections"> }
    | { kind: "confirm"; interpretationId: Id<"interpretations"> },
) {
  if (f.kind === "correction") {
    const c = await ctx.db.get(f.correctionId);
    const flag = c && (await ctx.db.get(c.flagId));
    const question = flag?.questionId
      ? await ctx.db.get(flag.questionId)
      : null;
    if (!c || !flag) return null;
    return { flag, question, correction: c, interpretation: null };
  }
  const it = await ctx.db.get(f.interpretationId);
  const question = it && (await ctx.db.get(it.questionId));
  const flag = question && (await ctx.db.get(question.flagIds[0]));
  if (!it || !question || !flag) return null;
  return { flag, question, correction: null, interpretation: it };
}

/** "w_07, 2026-10-08, 8.00 h": ids, a date and hours; never a name. */
async function context(ctx: QueryCtx, flag: Doc<"flags">) {
  const entry = flag.subject.entryIds[0]
    ? await ctx.db.get(flag.subject.entryIds[0])
    : null;
  if (entry)
    return `${entry.workerId}, ${entry.startAt.slice(0, 10)}, ${hours2(entry.durationSec).toFixed(2)} h`;
  const expense = flag.subject.expenseIds[0]
    ? await ctx.db.get(flag.subject.expenseIds[0])
    : null;
  if (expense) return `${expense.date}, ${expense.amountCents ?? "unknown"}¢`;
  return flag.subject.workerId ?? flag.subject.jobId ?? flag._id;
}

/** What agents/learn.ts needs: the lesson written from ids, what is known, and the active rules. */
export const input = internalQuery({
  args: { companyId: v.id("companies"), from },
  handler: async (ctx, args) => {
    const s = await source(ctx, args.from);
    if (!s) return null;
    // Who answered: the person texted, else the owner (a correction made from the dashboard).
    const role = s.question?.toRole ?? "owner";
    const draft = lessonFromAnswer({
      checkId: s.flag.checkId,
      answeredByRole: role,
      record: s.correction
        ? {
            table: s.correction.target.table,
            id: s.correction.target.id,
            field: s.correction.target.field,
          }
        : {
            table: s.flag.subject.entryIds.length ? "timeEntries" : "expenses",
            id:
              s.flag.subject.entryIds[0] ??
              s.flag.subject.expenseIds[0] ??
              s.flag._id,
            field: null,
          },
      before: s.correction?.before ?? null,
      after: s.correction?.after ?? null,
      context: await context(ctx, s.flag),
    });
    const known = await ctx.db
      .query("lessons")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    return {
      draft,
      flagId: s.flag._id,
      cycleId: s.flag.cycleId,
      questionId: s.question?._id ?? null,
      messageId: s.interpretation?.messageId ?? null,
      answeredBy: s.question?.toWorkerId ?? null,
      known: known.map((l) => ({
        id: l._id,
        text: l.text,
        status: l.status,
        structured: l.structured,
      })),
      activeRules: rules
        .filter((r) => r.status === "active")
        .map((r) => ({ id: r._id, type: r.type, params: r.params })),
    };
  },
});

/** Past cycles with what was actually paid, for the backtest. The lesson's own cycle is left out. */
async function pastCycles(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  except: Id<"cycles">,
): Promise<PastCycle[]> {
  const company = await ctx.db.get(companyId);
  if (!company) return [];
  // ponytail: one line per table; a generic helper over table names does not typecheck withIndex.
  const [
    cycles,
    workers,
    jobs,
    visits,
    quotes,
    invoices,
    payments,
    expenses,
    rules,
  ] = await Promise.all([
    ctx.db
      .query("cycles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
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
  const out: PastCycle[] = [];
  for (const cycle of cycles) {
    if (cycle._id === except) continue;
    const paidRows = await ctx.db
      .query("pastPayrolls")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .collect();
    if (!paidRows.length) continue;
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .collect();
    const paid: Record<string, number> = {};
    for (const p of paidRows)
      paid[p.workerId] = (paid[p.workerId] ?? 0) + p.grossCents;
    const e = {
      company: toEngine(company),
      cycle: toEngine(cycle),
      workers: workers.map(toEngine),
      timeEntries: entries.map(toEngine),
      jobs: jobs.map(toEngine),
      visits: visits.map(toEngine),
      quotes: quotes.map(toEngine),
      invoices: invoices.map(toEngine),
      payments: payments.map(toEngine),
      expenses: expenses.map(toEngine),
      pastCycles: { gross: {} },
      rules: rules.map(toEngine),
    } as unknown as CheckInput;
    out.push({
      checks: e,
      pay: [
        e.cycle,
        e.timeEntries,
        e.workers,
        e.rules,
        { company: e.company, expenses: e.expenses },
      ] as unknown as PastCycle["pay"],
      paid,
    });
  }
  return out;
}

const classification = v.object({
  kind: v.union(
    v.literal("new"),
    v.literal("confirmed"),
    v.literal("superseded"),
    v.literal("conflict"),
  ),
  relatedLessonId: v.union(v.string(), v.null()),
  conflictRuleId: v.union(v.string(), v.null()),
  reason: v.string(),
  ruleType: v.union(v.string(), v.null()),
  params: v.union(v.record(v.string(), v.any()), v.null()),
  by: v.string(),
});

const statement = (draft: LessonDraft) => {
  const p = draft.structured.params;
  if (
    draft.structured.ruleType === "routing" &&
    typeof p.checkId === "string"
  ) {
    const phrase =
      issuePhrases[p.checkId as keyof typeof issuePhrases]?.many ?? p.checkId;
    return `The ${String(p.answeredBy)} answers questions about ${phrase}.`;
  }
  return draft.text;
};

/** Stores the lesson; a new or superseding lesson with a rule type becomes a backtested proposed rule. */
export const store = internalMutation({
  args: {
    companyId: v.id("companies"),
    from,
    draft: v.object({
      text: v.string(),
      structured: v.object({
        ruleType: v.union(v.string(), v.null()),
        params: v.record(v.string(), v.any()),
      }),
      evaluation: v.object({
        expected: v.string(),
        actual: v.string(),
        source: v.union(
          v.literal("answer"),
          v.literal("answer_key"),
          v.literal("paid"),
        ),
      }),
    }),
    embedding: v.array(v.float64()),
    neighbourIds: v.array(v.string()),
    classification,
  },
  handler: async (ctx, args) => {
    const inp = await source(ctx, args.from);
    if (!inp) return;
    const { flag, question, interpretation } = inp;
    const c = args.classification;
    // The model may refine the rule; code never lets it drop the conflict check or invent a type.
    const draft = {
      ...args.draft,
      structured: {
        ruleType: (c.ruleType ??
          args.draft.structured
            .ruleType) as LessonDraft["structured"]["ruleType"],
        params: c.params ?? args.draft.structured.params,
      },
    } as LessonDraft;
    const related = (c.relatedLessonId ? [c.relatedLessonId] : [])
      .map((id) => ctx.db.normalizeId("lessons", id))
      .filter((id): id is Id<"lessons"> => !!id);
    const lessonId = await ctx.db.insert("lessons", {
      companyId: args.companyId,
      text: draft.text,
      structured: draft.structured,
      embedding: args.embedding,
      status:
        c.kind === "conflict"
          ? "conflict"
          : c.kind === "confirmed"
            ? "confirmed"
            : "new",
      relatedLessonIds: related,
      evaluation: draft.evaluation,
      createdFrom: {
        flagId: flag._id,
        questionId: question?._id ?? null,
        messageId: interpretation?.messageId ?? null,
      },
    });
    const audit = (
      type: string,
      summary: string,
      refs: Record<string, string> = {},
      data: unknown = null,
    ) =>
      write(ctx, {
        companyId: args.companyId,
        cycleId: flag.cycleId,
        actor:
          c.by === "code"
            ? { kind: "system", id: "lessons.store", agent: null }
            : { kind: "agent", id: "analyst", agent: "analyst" },
        type,
        summary,
        refs: { lessonId, flagId: flag._id, ...refs },
        data,
      });
    await audit(
      "lesson.recorded",
      `Lesson ${c.kind}: ${c.reason}`,
      {},
      { classification: c, neighbours: args.neighbourIds },
    );

    if (c.kind === "superseded" && related[0])
      await ctx.db.patch(related[0], { status: "superseded" });

    if (c.kind === "conflict") {
      const ruleId = c.conflictRuleId
        ? ctx.db.normalizeId("rules", c.conflictRuleId)
        : null;
      const flagId = await ctx.db.insert("flags", {
        companyId: args.companyId,
        cycleId: flag.cycleId,
        checkId: "LRN-01",
        status: "open",
        subject: { ...flag.subject },
        seen: `An answer contradicts ${ruleId ? `active rule ${ruleId}` : "a known lesson"}: ${draft.text}`,
        where: [{ system: "payrollpilot", recordId: lessonId, url: null }],
        confidence: "certain",
        precedent: ruleId
          ? { ruleId, flagId: null, note: "contradicts this rule" }
          : null,
        routeTo: "owner",
        affects: {
          workerId: flag.subject.workerId,
          jobId: flag.subject.jobId,
          dollarsCents: null,
        },
        questionId: null,
        correctionId: null,
      });
      return audit(
        "lesson.conflict",
        "Contradiction escalated to the owner (LRN-01)",
        { conflictFlagId: flagId },
      );
    }
    if (!draft.structured.ruleType) return;

    // A rule like this already proposed or active: the lesson is evidence for it, not a second rule.
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    const twin = rules.find(
      (r) =>
        r.status !== "off" &&
        r.type === draft.structured.ruleType &&
        canonical(stripStatement(r.params)) ===
          canonical(draft.structured.params),
    );
    if (c.kind === "confirmed" && !twin) return;
    if (twin) {
      await ctx.db.patch(twin._id, {
        provenance: {
          ...twin.provenance,
          evidence: [...twin.provenance.evidence, lessonId],
        },
      });
      return audit(
        "rule.evidence",
        "Lesson added as evidence to an existing rule",
        { ruleId: twin._id },
      );
    }

    const candidate = {
      id: "candidate",
      companyId: args.companyId,
      type: draft.structured.ruleType,
      params: draft.structured.params,
    } as Pick<Rule, "id" | "companyId" | "type" | "params">;
    const result = backtest(
      candidate,
      await pastCycles(ctx, args.companyId, flag.cycleId),
    );
    const lowRisk = LOW_RISK.includes(draft.structured.ruleType);
    const now = new Date().toISOString();
    const ruleId = await ctx.db.insert("rules", {
      companyId: args.companyId,
      type: draft.structured.ruleType,
      params: { ...draft.structured.params, statement: statement(draft) },
      status: lowRisk ? "active" : "proposed",
      source: "answer",
      provenance: {
        lessonId,
        flagId: flag._id,
        answeredBy: question?.toWorkerId ?? null,
        approvedBy: lowRisk ? "rule:low_risk" : null,
        approvedAt: lowRisk ? now : null,
        evidence: [
          lessonId,
          ...(interpretation ? [interpretation.messageId] : []),
        ],
      },
      backtest: result,
      confidence: c.by === "code" ? 0.5 : 0.8,
    });
    await ctx.db.patch(lessonId, { status: lowRisk ? "promoted" : "new" });
    await audit(
      lowRisk ? "rule.auto_applied" : "rule.proposed",
      lowRisk
        ? `Low-risk rule active: ${statement(draft)}`
        : `Rule proposed for the owner: ${statement(draft)}`,
      { ruleId },
      { backtest: result },
    );
  },
});

function stripStatement(p: Record<string, unknown>) {
  const { statement: _s, ...rest } = p;
  return rest;
}
