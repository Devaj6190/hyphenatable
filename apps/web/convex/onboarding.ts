// B-13 / creao-plan S6: onboarding from past cycles. Code summarizes the history and proposes the rules
// arithmetic settles; the Analyst (the Creao Analyst, or complete() in Convex as the fallback) proposes
// the rest from the summaries. Code validates every evidence id, recounts the cycles, backtests, and
// stores `proposed` rules the owner approves. "What did we miss" questions go to the owner's dashboard.
import {
  type HistoryInput,
  type Proposal,
  proposeFromHistory,
  summarize,
} from "@payrollpilot/engine/lessons/history";
import { backtest, canonical } from "@payrollpilot/engine/lessons/lessons";
import {
  ProposedRules,
  pairsToRecord,
  type Rule,
} from "@payrollpilot/engine/schemas";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
  query,
} from "./_generated/server";
import { parse } from "./agentApi";
import { write } from "./audit";
import { pastCycles } from "./lessons";

async function historyInput(
  ctx: QueryCtx,
  companyId: Id<"companies">,
): Promise<HistoryInput> {
  const cycles = (
    await ctx.db
      .query("cycles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect()
  ).filter((c) => c.stage === "closed");
  const ids = new Set<string>(cycles.map((c) => c._id));
  const [paid, expenses, payments, questions] = await Promise.all([
    ctx.db
      .query("pastPayrolls")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("expenses")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("payments")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("questions")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
  ]);
  return {
    companyId,
    cycleIds: cycles.sort((a, b) => a.number - b.number).map((c) => c._id),
    paid: paid
      .filter((p) => ids.has(p.cycleId))
      .map((p) => ({ ...p, id: p._id })),
    expenses: expenses.map((x) => ({
      id: x._id,
      date: x.date,
      accountName: x.accountName,
      matchedJobId: x.matchedJobId,
    })),
    payments: payments.map((p) => ({
      id: p._id,
      quoteId: p.quoteId,
      invoiceId: p.invoiceId,
      kind: p.kind,
    })),
    answered: questions
      .filter((q) => q.status === "answered" && ids.has(q.cycleId))
      .map((q) => ({
        id: q._id,
        cycleId: q.cycleId,
        toWorkerId: q.toWorkerId,
        toRole: q.toRole,
      })),
    pastCycles: (await pastCycles(ctx, companyId, "" as Id<"cycles">)).filter(
      (c) => ids.has((c.pay[0] as { id: string }).id),
    ),
  };
}

const EVIDENCE_TABLES: TableNames[] = [
  "pastPayrolls",
  "expenses",
  "payments",
  "questions",
  "timeEntries",
  "jobs",
  "quotes",
  "invoices",
  "visits",
  "workers",
  "flags",
];

/** The evidence ids that exist in this company's records, and the cycles they come from. */
async function checkEvidence(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  evidence: string[],
) {
  const ok: string[] = [];
  const cycles = new Set<string>();
  for (const e of evidence) {
    for (const t of EVIDENCE_TABLES) {
      const id = ctx.db.normalizeId(t, e);
      const doc = id
        ? ((await ctx.db.get(id)) as Record<string, unknown> | null)
        : null;
      if (!doc || doc.companyId !== companyId) continue;
      ok.push(e);
      if (typeof doc.cycleId === "string") cycles.add(doc.cycleId);
      break;
    }
  }
  return { ok, cycles: cycles.size };
}

const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const strip = ({ statement: _s, ...rest }: Record<string, unknown>) => rest;
  return canonical(strip(a)) === canonical(strip(b));
};

/** Validates, recounts, backtests and stores proposals; the same rule never lands twice. */
async function storeProposals(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  proposals: Proposal[],
  by: "code" | string,
) {
  const existing = await ctx.db
    .query("rules")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  const past = await pastCycles(ctx, companyId, "" as Id<"cycles">);
  const stored: string[] = [];
  const refused: { type: string; why: string }[] = [];
  for (const p of proposals) {
    if (
      existing.some(
        (r) =>
          r.status !== "off" &&
          r.type === p.type &&
          sameParams(r.params, p.params),
      )
    )
      continue;
    const ev = await checkEvidence(ctx, companyId, p.evidence);
    if (!ev.ok.length) {
      refused.push({
        type: p.type,
        why: "no evidence id exists in this company's records",
      });
      continue;
    }
    const candidate = {
      id: "candidate",
      companyId,
      type: p.type,
      params: p.params,
    } as Pick<Rule, "id" | "companyId" | "type" | "params">;
    const ruleId = await ctx.db.insert("rules", {
      companyId,
      type: p.type,
      params: { ...p.params, statement: p.statement },
      status: "proposed",
      source: "history",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: null,
        approvedBy: null,
        approvedAt: null,
        evidence: ev.ok,
      },
      backtest: backtest(candidate, past),
      // The model's own count is advisory; code's count of the evidence's cycles is stored beside it.
      confidence: p.confidence,
    });
    stored.push(ruleId);
    await write(ctx, {
      companyId,
      cycleId: null,
      actor:
        by === "code"
          ? { kind: "system", id: "onboarding", agent: null }
          : { kind: "agent", id: "analyst", agent: "analyst" },
      type: "rule.proposed",
      summary: `Proposed from history: ${p.statement}`,
      refs: { ruleId },
      data: {
        by,
        evidenceKept: ev.ok.length,
        evidenceGiven: p.evidence.length,
        seenInCycles: { claimed: p.seenInCycles, counted: ev.cycles },
        ofCycles: p.ofCycles,
      },
    });
  }
  return { stored, refused };
}

export const proposeFromCode = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) =>
    storeProposals(
      ctx,
      companyId,
      proposeFromHistory(await historyInput(ctx, companyId)),
      "code",
    ),
});

/** The Analyst's reading material: summaries with ids, plus what code already proposed. */
export const history = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const h = await historyInput(ctx, companyId);
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return {
      summary: summarize(h),
      alreadyProposed: rules.map((r) => ({
        type: r.type,
        params: r.params,
        status: r.status,
      })),
    };
  },
});

/** The Analyst's proposals (Creao through /agent/propose_rules, or complete() in Convex). */
export const proposeRules = internalMutation({
  args: { companyId: v.id("companies"), payload: v.any(), by: v.string() },
  handler: async (ctx, { companyId, payload, by }) => {
    const parsed = parse(ProposedRules, payload, (p) => [
      ...p.rules.map((r) => r.statement),
      ...p.missing.flatMap((m) => [m.question, m.why]),
    ]);
    const proposals: Proposal[] = parsed.rules.map((r) => ({
      ...r,
      params: pairsToRecord(r.params) as Proposal["params"],
    }));
    const result = await storeProposals(ctx, companyId, proposals, by);
    if (parsed.missing.length)
      await write(ctx, {
        companyId,
        cycleId: null,
        actor: { kind: "agent", id: "analyst", agent: "analyst" },
        type: "analyst.missing",
        summary: `${parsed.missing.length} things the history could not settle, for the owner`,
        refs: {},
        data: { missing: parsed.missing },
      });
    return result;
  },
});

/** Onboarding: code's proposals now; the Analyst's through Creao when configured, else in Convex. */
export const run = action({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    { companyId },
  ): Promise<{ fromCode: number; analyst: string }> => {
    const code: { stored: string[] } = await ctx.runMutation(
      internal.onboarding.proposeFromCode,
      { companyId },
    );
    let analyst =
      "not run: set CREAO_API_KEY (Creao) or ANTHROPIC_API_KEY (in-house)";
    if (process.env.CREAO_API_KEY && process.env.CREAO_AGENT_ANALYST) {
      await ctx.runMutation(internal.creaoRuns.start, {
        companyId,
        cycleId: null,
        agent: "analyst",
        why: "onboarding",
      });
      analyst = "Creao Analyst started";
    } else if (process.env.ANTHROPIC_API_KEY) {
      await ctx.scheduler.runAfter(0, internal.agents.analyst.propose, {
        companyId,
      });
      analyst = "in-house Analyst started";
    }
    return { fromCode: code.stored.length, analyst };
  },
});

/** "What did we miss?" questions for the owner (dashboard, not text): the Analyst's latest list. */
export const questions = query({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    { companyId },
  ): Promise<{ question: string; why: string }[]> => {
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(500);
    const latest = events.find((e) => e.type === "analyst.missing");
    return (
      (latest?.data?.missing as
        | { question: string; why: string }[]
        | undefined) ?? []
    );
  },
});
