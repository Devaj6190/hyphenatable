// B-19 / creao-plan S3: the controller starts Creao agent runs and tracks them. Creao's run API has no
// idempotency key, so a run row is checked before every start; webhooks are unsigned, so each carries a
// per-run token and the run is re-fetched from Creao before its status is trusted. Polling backs up the
// webhook (Creao sends none for a run that fails before it starts).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  query,
} from "./_generated/server";
import { write } from "./audit";

const API = "https://developer.creao.ai/v1";
const MODEL = "anthropic/claude-opus-5-5";
const POLL_MS = 60_000;
const POLL_FOR_MS = 30 * 60_000;
const LIVE: Doc<"creaoRuns">["status"][] = ["starting", "pending", "running"];

export const agent = v.union(
  v.literal("auditor"),
  v.literal("messenger"),
  v.literal("analyst"),
);
type Agent = Doc<"creaoRuns">["agent"];

/** The saved Creao agent for each role (ids printed by scripts/creao-agents.ts). */
const agentId = (a: Agent) =>
  process.env[`CREAO_AGENT_${a.toUpperCase()}`] ?? null;

function token() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Starts a run unless one for this cycle and agent is still live. Returns the run row either way. */
export async function startRun(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  cycleId: Id<"cycles"> | null,
  a: Agent,
  why: string,
) {
  const earlier = await ctx.db
    .query("creaoRuns")
    .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId).eq("agent", a))
    .collect();
  const live = earlier.find((r) => LIVE.includes(r.status));
  if (live) return live._id;
  const id = await ctx.db.insert("creaoRuns", {
    companyId,
    cycleId,
    agent: a,
    attempt: earlier.length + 1,
    runId: null,
    status: "starting",
    callbackToken: token(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    credits: null,
    error: null,
  });
  await write(ctx, {
    companyId,
    cycleId,
    actor: { kind: "system", id: "controller", agent: null },
    type: "creao.run.starting",
    summary: `Starting the Creao ${a} (attempt ${earlier.length + 1}): ${why}`,
    refs: { creaoRunId: id },
    data: null,
  });
  await ctx.scheduler.runAfter(0, internal.creaoRuns.launch, {
    creaoRunId: id,
  });
  return id;
}

export const start = internalMutation({
  args: {
    companyId: v.id("companies"),
    cycleId: v.union(v.id("cycles"), v.null()),
    agent,
    why: v.string(),
  },
  handler: (ctx, a) => startRun(ctx, a.companyId, a.cycleId, a.agent, a.why),
});

export const get = internalQuery({
  args: { creaoRunId: v.id("creaoRuns") },
  handler: (ctx, { creaoRunId }) => ctx.db.get(creaoRunId),
});

/** What the agent is told for this run. Everything else (how to call /agent/*) is in its saved instructions. */
function runInput(r: Doc<"creaoRuns">) {
  return JSON.stringify({
    task: r.agent,
    companyId: r.companyId,
    cycleId: r.cycleId,
    api: `${process.env.CONVEX_SITE_URL}/agent`,
    note: "Use PAYROLLPILOT_KEY from your secrets as the bearer token. Ids only; propose, never decide.",
  });
}

export const launch = internalAction({
  args: { creaoRunId: v.id("creaoRuns") },
  handler: async (ctx, { creaoRunId }): Promise<unknown> => {
    const r: Doc<"creaoRuns"> | null = await ctx.runQuery(
      internal.creaoRuns.get,
      { creaoRunId },
    );
    if (!r || r.status !== "starting") return;
    const key = process.env.CREAO_API_KEY;
    const id = agentId(r.agent);
    if (!key || !id)
      return ctx.runMutation(internal.creaoRuns.update, {
        creaoRunId,
        status: "failed",
        error: !key
          ? "CREAO_API_KEY is not set in Convex env"
          : `CREAO_AGENT_${r.agent.toUpperCase()} is not set in Convex env`,
      });
    const webhook = `${process.env.CONVEX_SITE_URL}/creao/webhook?r=${creaoRunId}&t=${r.callbackToken}`;
    try {
      const res = await fetch(`${API}/runs`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agent_id: id,
          input: runInput(r),
          model: MODEL,
          webhook_url: webhook,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        run_id?: string;
        status?: string;
        error?: { code?: string; message?: string };
      };
      if (!res.ok || !body.run_id)
        return ctx.runMutation(internal.creaoRuns.update, {
          creaoRunId,
          status: "failed",
          error: `creao ${res.status}: ${body.error?.code ?? body.error?.message ?? "no run_id"}`,
        });
      await ctx.runMutation(internal.creaoRuns.update, {
        creaoRunId,
        status: "pending",
        runId: body.run_id,
      });
      await ctx.scheduler.runAfter(POLL_MS, internal.creaoRuns.refresh, {
        creaoRunId,
      });
    } catch (e) {
      await ctx.runMutation(internal.creaoRuns.update, {
        creaoRunId,
        status: "failed",
        error: `creao request failed: ${(e as Error).message.slice(0, 200)}`,
      });
    }
  },
});

/** Re-fetches the run from Creao (after a webhook, or as the polling fallback) and records it. */
export const refresh = internalAction({
  args: { creaoRunId: v.id("creaoRuns") },
  handler: async (ctx, { creaoRunId }): Promise<unknown> => {
    const r: Doc<"creaoRuns"> | null = await ctx.runQuery(
      internal.creaoRuns.get,
      { creaoRunId },
    );
    const key = process.env.CREAO_API_KEY;
    if (!r?.runId || !LIVE.includes(r.status) || !key) return;
    const res = await fetch(`${API}/runs/${r.runId}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) return schedulePoll(ctx, r);
    const run = (await res.json()) as {
      status: Exclude<Doc<"creaoRuns">["status"], "starting">;
      usage?: { credits?: number };
      error?: { code?: string } | null;
      completed_at?: string | null;
    };
    if (!LIVE.includes(run.status)) {
      return ctx.runMutation(internal.creaoRuns.update, {
        creaoRunId,
        status: run.status,
        credits: run.usage?.credits ?? null,
        error: run.error?.code ?? null,
        finishedAt: run.completed_at ?? new Date().toISOString(),
      });
    }
    if (run.status !== r.status)
      await ctx.runMutation(internal.creaoRuns.update, {
        creaoRunId,
        status: run.status,
      });
    await schedulePoll(ctx, r);
  },
});

async function schedulePoll(ctx: ActionCtx, r: Doc<"creaoRuns">) {
  if (Date.now() - Date.parse(r.startedAt) > POLL_FOR_MS) return;
  await ctx.scheduler.runAfter(POLL_MS, internal.creaoRuns.refresh, {
    creaoRunId: r._id,
  });
}

/** Records a status change; a finished Auditor hands off to the Messenger (one hand-off per run). */
export const update = internalMutation({
  args: {
    creaoRunId: v.id("creaoRuns"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    runId: v.optional(v.string()),
    credits: v.optional(v.union(v.number(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    finishedAt: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.creaoRunId);
    if (!r || !LIVE.includes(r.status)) return; // a finished run never changes again
    const done = !LIVE.includes(a.status);
    await ctx.db.patch(r._id, {
      status: a.status,
      ...(a.runId ? { runId: a.runId } : {}),
      ...(a.credits !== undefined ? { credits: a.credits } : {}),
      ...(a.error !== undefined ? { error: a.error } : {}),
      ...(done ? { finishedAt: a.finishedAt ?? new Date().toISOString() } : {}),
    });
    if (a.status === r.status) return;
    await write(ctx, {
      companyId: r.companyId,
      cycleId: r.cycleId,
      actor: { kind: "agent", id: r.agent, agent: r.agent },
      type: `creao.run.${a.status}`,
      summary: `Creao ${r.agent}: ${r.status} → ${a.status}${a.error ? ` (${a.error})` : ""}`,
      refs: {
        creaoRunId: r._id,
        ...(a.runId || r.runId
          ? { runId: (a.runId ?? r.runId) as string }
          : {}),
      },
      data: { credits: a.credits ?? null },
    });
    if (a.status === "completed" && r.agent === "auditor" && r.cycleId)
      await startRun(
        ctx,
        r.companyId,
        r.cycleId,
        "messenger",
        "the Auditor finished",
      );
  },
});

/** The webhook's checks: the run row exists, the token matches, and the run id is the one we started. */
export const verifyWebhook = internalQuery({
  args: { creaoRunId: v.string(), token: v.string(), runId: v.string() },
  handler: async (ctx, { creaoRunId, token: t, runId }) => {
    const id = ctx.db.normalizeId("creaoRuns", creaoRunId);
    const r = id ? await ctx.db.get(id) : null;
    if (!r || !r.runId || r.runId !== runId) return null;
    let diff = t.length ^ r.callbackToken.length;
    for (let i = 0; i < r.callbackToken.length; i++)
      diff |= r.callbackToken.charCodeAt(i) ^ (t.charCodeAt(i) || 0);
    return diff === 0 ? r._id : null;
  },
});

/** For the dashboard: this cycle's agent runs, newest first (status, timings, credits). */
export const list = query({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, { cycleId }) =>
    (
      await ctx.db
        .query("creaoRuns")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
        .collect()
    )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(({ callbackToken: _t, ...r }) => r),
});
