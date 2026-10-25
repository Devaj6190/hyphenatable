// creao-plan S4/S5: what the Creao Auditor and Messenger read and propose through /agent/* (creao.ts
// registers the tools). Reads are ids, dates, hours, job numbers and titles; never names, contact refs
// or pay. Writes are proposals validated here and stored as `proposed` / `draft` / an open AGT-01 flag;
// nothing changes pay or texts anyone until a person approves.
import {
  changeFor,
  effectOf,
} from "@payrollpilot/engine/corrections/corrections";
import { scrub } from "@payrollpilot/engine/llm/scrub";
import { friendlyDate } from "@payrollpilot/engine/messages/templates";
import { candidateJobs } from "@payrollpilot/engine/questions/questions";
import { MatchDecision, QuestionDraft } from "@payrollpilot/engine/schemas";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { write } from "./audit";
import { payrollInput } from "./lib/engine";
import { managerOf, recipient } from "./questions";

const MATCH_FLOOR = 0.85;
const MONEY = /\$\s?\d|\d+\s?(dollars|usd|bucks)/i;
// A record id, or a piece of one: letters and digits mixed, 6 or more long ("k978qzgf"). Texts name jobs by number.
const RECORD_ID = /\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,}\b/i;

const agentActor = (agent: "auditor" | "messenger") => ({
  kind: "agent" as const,
  id: agent,
  agent,
});

/** Entries and purchases with no job (CHK-01, CHK-14) and the jobs they could belong to. */
export const unmatched = internalQuery({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) => {
    const cycle = await ctx.db.get(cycleId);
    const company = cycle && (await ctx.db.get(cycle.companyId));
    if (!cycle || !company) throw new ConvexError("cycle not found");
    const flags = (
      await ctx.db
        .query("flags")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
        .collect()
    ).filter(
      (f) =>
        (f.checkId === "CHK-01" || f.checkId === "CHK-14") &&
        (f.status === "open" || f.status === "asked") &&
        !f.correctionId,
    );
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect();
    const visits = await ctx.db
      .query("visits")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();
    const jobFacts = (id: string) => {
      const j = jobs.find((x) => x._id === id);
      return j
        ? {
            jobId: j._id,
            jobNumber: j.jobNumber,
            title: j.title,
            status: j.status,
            startAt: j.startAt,
            endAt: j.endAt,
          }
        : null;
    };
    return Promise.all(
      flags.map(async (f) => {
        const entry = entries.find((e) => e._id === f.subject.entryIds[0]);
        const expense = f.subject.expenseIds[0]
          ? await ctx.db.get(f.subject.expenseIds[0])
          : null;
        const near = entry
          ? candidateJobs(
              entry.workerId,
              entry.startAt,
              company.timezone,
              visits,
              entries,
            )
          : [];
        // Beyond the code's best two, every open job is a candidate the Auditor may weigh.
        const others = jobs
          .filter((j) => !near.includes(j._id) && j.status !== "archived")
          .map((j) => j._id);
        return {
          flagId: f._id,
          checkId: f.checkId,
          seen: f.seen,
          entry: entry
            ? {
                entryId: entry._id,
                workerId: entry.workerId,
                startAt: entry.startAt,
                endAt: entry.endAt,
                hours: entry.durationSec / 3600,
              }
            : null,
          expense: expense
            ? {
                expenseId: expense._id,
                date: expense.date,
                amountCents: expense.amountCents,
                vendor: expense.vendor,
                accountName: expense.accountName,
                customerRef: expense.customerRef,
              }
            : null,
          likely: near.map(jobFacts).filter(Boolean),
          others: others.slice(0, 15).map(jobFacts).filter(Boolean),
        };
      }),
    );
  },
});

/** Flags routed to a person that no template question covers (the Messenger drafts those). */
export const routedWithoutQuestion = internalQuery({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) => {
    const flags = (
      await ctx.db
        .query("flags")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
        .collect()
    ).filter(
      (f) => f.status === "open" && f.routeTo === "manager" && !f.questionId,
    );
    const cycle = await ctx.db.get(cycleId);
    const company = cycle && (await ctx.db.get(cycle.companyId));
    const timezone = company?.timezone ?? "UTC";
    // What a text can say: job numbers and titles, entry days and hours. The ids are for proposing, never for the text.
    return Promise.all(
      flags.map(async (f) => {
        const worker = f.subject.workerId
          ? await ctx.db.get(f.subject.workerId)
          : null;
        const job = f.subject.jobId ? await ctx.db.get(f.subject.jobId) : null;
        const entries = await Promise.all(
          f.subject.entryIds.map((id) => ctx.db.get(id)),
        );
        return {
          flagId: f._id,
          checkId: f.checkId,
          seen: f.seen,
          subject: f.subject,
          workerRole: worker?.role ?? null,
          job: job ? { jobNumber: job.jobNumber, title: job.title } : null,
          entries: entries.flatMap((e) =>
            e
              ? [
                  {
                    day: friendlyDate(e.startAt, timezone),
                    hours: Math.round(e.durationSec / 36) / 100,
                  },
                ]
              : [],
          ),
        };
      }),
    );
  },
});

const MatchProposal = z.object({
  flagId: z.string(),
  decision: MatchDecision,
});
const Brief = z.object({ text: z.string().min(1).max(4000) });
const AgentFlag = z.object({
  subject: z.object({
    workerId: z.string().nullable(),
    jobId: z.string().nullable(),
    entryIds: z.array(z.string()).max(10),
    expenseIds: z.array(z.string()).max(10),
  }),
  reason: z.string().min(1).max(300),
  evidence: z.array(z.string()).min(1).max(20),
  confidence: z.number().min(0).max(1),
});
const QuestionProposal = z.object({ flagId: z.string(), draft: QuestionDraft });

/**
 * Parses an agent's payload against the contract schema; its free text (reasons, question texts,
 * options, the brief) must also pass the scrubber. Ids are allowed and are not scrubbed. A bad payload
 * is refused with why, so the agent can fix it once.
 */
export function parse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  freeText: (value: T) => (string | null | undefined)[],
): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new ConvexError(
      `invalid proposal: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  try {
    scrub({ text: freeText(r.data).filter(Boolean) });
  } catch (e) {
    throw new ConvexError(`refused: ${(e as Error).message}`);
  }
  return r.data;
}

export const proposeMatches = internalMutation({
  args: { cycleId: v.id("cycles"), proposals: v.any() },
  handler: async (ctx, { cycleId, proposals }) => {
    const list = parse(z.array(MatchProposal).max(50), proposals, (l) =>
      l.map((p) => p.decision.reason),
    );
    const out: { flagId: string; result: string }[] = [];
    for (const p of list)
      out.push({ flagId: p.flagId, result: await oneMatch(ctx, cycleId, p) });
    return out;
  },
});

async function oneMatch(
  ctx: MutationCtx,
  cycleId: Id<"cycles">,
  p: z.infer<typeof MatchProposal>,
): Promise<string> {
  const flagId = ctx.db.normalizeId("flags", p.flagId);
  const flag = flagId ? await ctx.db.get(flagId) : null;
  if (!flag || flag.cycleId !== cycleId) return "unknown flag";
  if (flag.checkId !== "CHK-01" && flag.checkId !== "CHK-14")
    return "not a matching flag";
  if (flag.correctionId) return "already has a proposal";
  const d = p.decision;
  // Code, not the model, applies the floor: a match under 0.85 is an ask (plan B 4.4).
  const kind =
    d.kind === "match" && d.confidence < MATCH_FLOOR ? "ask" : d.kind;
  const jobId = d.jobId ? ctx.db.normalizeId("jobs", d.jobId) : null;
  const job = jobId ? await ctx.db.get(jobId) : null;
  await ctx.db.patch(flag._id, { confidence: d.confidence });
  const audit = (summary: string, data: unknown) =>
    write(ctx, {
      companyId: flag.companyId,
      cycleId,
      actor: agentActor("auditor"),
      type: "auditor.match",
      summary,
      refs: { flagId: flag._id },
      data,
    });
  if (kind !== "match") {
    await audit(`Auditor: ${kind} (${d.confidence}): ${d.reason}`, {
      decision: d,
      applied: kind,
    });
    return kind;
  }
  if (!job || job.companyId !== flag.companyId) {
    await audit("Auditor named a job that does not exist; ignored", {
      decision: d,
    });
    return "unknown job";
  }
  const p2 = await payrollInput(ctx, cycleId, {
    holdUnresolved: true,
    except: flag._id,
  });
  const change = changeFor(
    flag.checkId === "CHK-01" ? "entryNoJob" : "expenseNoJob",
    {
      kind: "change",
      optionIndex: null,
      values: { jobNumber: job.jobNumber },
      confidence: d.confidence,
    },
    flag.subject,
    {
      entries: p2.entries,
      expenses: p2.expenses,
      jobIdByNumber: new Map([[job.jobNumber, job._id]]),
    },
  );
  if (!change) return "nothing to change";
  const effect = effectOf(p2, change);
  const correctionId = await ctx.db.insert("corrections", {
    companyId: flag.companyId,
    cycleId,
    flagId: flag._id,
    target: { table: change.table, id: change.id, field: change.field },
    before: change.before,
    after: change.after,
    effectPayCents: effect.payCents,
    effectProfitCents: effect.profitCents ?? 0,
    status: "proposed",
    source: "agent",
    approvedBy: null,
    approvedAt: null,
  });
  await ctx.db.patch(flag._id, { correctionId });
  await audit(
    `Auditor proposed job ${job.jobNumber} (${d.confidence}): ${d.reason}`,
    {
      decision: d,
      correctionId,
      profitNote: effect.profitNote,
    },
  );
  return "proposed";
}

export const proposeFlags = internalMutation({
  args: { cycleId: v.id("cycles"), flags: v.any() },
  handler: async (ctx, { cycleId, flags }) => {
    const list = parse(z.array(AgentFlag).max(20), flags, (l) =>
      l.map((f) => f.reason),
    );
    const cycle = await ctx.db.get(cycleId);
    if (!cycle) throw new ConvexError("cycle not found");
    const existing = await ctx.db
      .query("flags")
      .withIndex("by_cycle", (q) =>
        q.eq("cycleId", cycleId).eq("checkId", "AGT-01"),
      )
      .collect();
    const key = (
      s: z.infer<typeof AgentFlag>["subject"] | Doc<"flags">["subject"],
    ) =>
      JSON.stringify([
        s.workerId,
        s.jobId,
        [...s.entryIds].sort(),
        [...s.expenseIds].sort(),
      ]);
    const seen = new Set(existing.map((f) => key(f.subject)));
    const created: string[] = [];
    for (const f of list) {
      const subject = {
        workerId: f.subject.workerId
          ? ctx.db.normalizeId("workers", f.subject.workerId)
          : null,
        jobId: f.subject.jobId
          ? ctx.db.normalizeId("jobs", f.subject.jobId)
          : null,
        entryIds: f.subject.entryIds
          .map((id) => ctx.db.normalizeId("timeEntries", id))
          .filter((x): x is Id<"timeEntries"> => !!x),
        expenseIds: f.subject.expenseIds
          .map((id) => ctx.db.normalizeId("expenses", id))
          .filter((x): x is Id<"expenses"> => !!x),
      };
      if (seen.has(key(subject))) continue;
      seen.add(key(subject));
      // Always a question to the owner; it never blocks (routeTo owner, not part of the holds' disputes).
      const flagId = await ctx.db.insert("flags", {
        companyId: cycle.companyId,
        cycleId,
        checkId: "AGT-01",
        status: "open",
        subject,
        seen: `Auditor: ${f.reason}`,
        where: f.evidence.map((recordId) => ({
          system: "payrollpilot",
          recordId,
          url: null,
        })),
        confidence: f.confidence,
        precedent: { ruleId: null, flagId: null, note: "no precedent" },
        routeTo: "owner",
        affects: {
          workerId: subject.workerId,
          jobId: subject.jobId,
          dollarsCents: null,
        },
        questionId: null,
        correctionId: null,
      });
      created.push(flagId);
    }
    await write(ctx, {
      companyId: cycle.companyId,
      cycleId,
      actor: agentActor("auditor"),
      type: "auditor.flags",
      summary: `Auditor raised ${created.length} AGT-01 flags for the owner`,
      refs: { cycleId },
      data: { created },
    });
    return { created };
  },
});

export const proposeBrief = internalMutation({
  args: { cycleId: v.id("cycles"), brief: v.any() },
  handler: async (ctx, { cycleId, brief }) => {
    const { text } = parse(Brief, brief, (b) => [b.text]);
    const cycle = await ctx.db.get(cycleId);
    if (!cycle) throw new ConvexError("cycle not found");
    // The owner's morning brief: an audit event the dashboard reads (type auditor.brief), newest wins.
    await write(ctx, {
      companyId: cycle.companyId,
      cycleId,
      actor: agentActor("auditor"),
      type: "auditor.brief",
      summary: "Morning brief from the Auditor",
      refs: { cycleId },
      data: { text },
    });
    return { stored: true };
  },
});

export const proposeQuestions = internalMutation({
  args: { cycleId: v.id("cycles"), proposals: v.any() },
  handler: async (ctx, { cycleId, proposals }) => {
    const list = parse(z.array(QuestionProposal).max(20), proposals, (l) =>
      l.flatMap((p) => [
        p.draft.text,
        p.draft.reason,
        ...(p.draft.options ?? []),
      ]),
    );
    const out: { flagId: string; result: string }[] = [];
    for (const p of list) {
      const flagId = ctx.db.normalizeId("flags", p.flagId);
      const flag = flagId ? await ctx.db.get(flagId) : null;
      if (
        !flag ||
        flag.cycleId !== cycleId ||
        flag.questionId ||
        flag.status !== "open"
      ) {
        out.push({
          flagId: p.flagId,
          result: "not an open flag without a question",
        });
        continue;
      }
      const d = p.draft;
      if (MONEY.test(d.text) || d.options?.some((o) => MONEY.test(o))) {
        out.push({
          flagId: p.flagId,
          result: "refused: texts never carry money",
        });
        continue;
      }
      if (RECORD_ID.test(d.text) || d.options?.some((o) => RECORD_ID.test(o))) {
        out.push({
          flagId: p.flagId,
          result:
            "refused: texts never carry record ids; say Job <number> or the day",
        });
        continue;
      }
      const worker = flag.subject.workerId
        ? await ctx.db.get(flag.subject.workerId)
        : null;
      const company = await ctx.db.get(flag.companyId);
      if (!company) continue;
      const to =
        d.toRole === "employee" && worker
          ? await recipient(ctx, company, worker, flag.checkId)
          : worker
            ? await managerOf(ctx, worker)
            : null;
      if (!to) {
        out.push({ flagId: p.flagId, result: "nobody with a phone to ask" });
        continue;
      }
      const questionId = await ctx.db.insert("questions", {
        companyId: flag.companyId,
        cycleId,
        flagIds: [flag._id],
        toWorkerId: to.to._id,
        toRole: to.toRole,
        text: d.text,
        options: d.options,
        kind: d.kind,
        status: "draft",
        approvedBy: null,
        approvedAt: null,
        sentAt: null,
        remindAt: null,
        expiresAt: null,
        interpretationId: null,
      });
      await ctx.db.patch(flag._id, { questionId });
      await write(ctx, {
        companyId: flag.companyId,
        cycleId,
        actor: agentActor("messenger"),
        type: "messenger.draft",
        summary: `Messenger drafted a question to the ${to.toRole}: ${d.reason}`,
        refs: { flagId: flag._id, questionId },
        data: null,
      });
      out.push({ flagId: p.flagId, result: "drafted" });
    }
    return out;
  },
});
