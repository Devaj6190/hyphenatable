// @vitest-environment edge-runtime
// The Creao controller (run rows, launch, webhook, hand-off) and the agents' proposal tools, with
// Creao's API mocked.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { seed } from "./seed";

beforeEach(() => {
  vi.useFakeTimers();
  process.env.CREAO_API_KEY = "cr_sk_test";
  process.env.CREAO_AGENT_AUDITOR = "agent-auditor";
  process.env.CREAO_AGENT_MESSENGER = "agent-messenger";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.CREAO_API_KEY;
});

/** Runs what is due now (runAfter 0) without jumping to the 60 s polls. */
async function step(s: Awaited<ReturnType<typeof seed>>) {
  vi.advanceTimersByTime(1);
  await s.t.finishInProgressScheduledFunctions();
}

/** Creao's /v1/runs: POST starts run-1 (pending); GET returns `status`. */
function mockCreao(status: () => string) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url,
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (method === "POST")
        return new Response(
          JSON.stringify({ run_id: `run-${calls.length}`, status: "pending" }),
          { status: 202 },
        );
      return new Response(
        JSON.stringify({
          status: status(),
          usage: { credits: 1.5 },
          error: null,
          completed_at: "2026-10-25T03:00:00Z",
        }),
        { status: 200 },
      );
    }),
  );
  return calls;
}

describe("Creao runs", () => {
  test("a live run is never started twice; a missing key fails with a reason", async () => {
    const s = await seed();
    delete process.env.CREAO_API_KEY;
    const a = await s.t.mutation(internal.creaoRuns.start, {
      companyId: s.companyId,
      cycleId: s.cycleId,
      agent: "auditor",
      why: "test",
    });
    const b = await s.t.mutation(internal.creaoRuns.start, {
      companyId: s.companyId,
      cycleId: s.cycleId,
      agent: "auditor",
      why: "test",
    });
    expect(b).toBe(a);
    await step(s);
    expect(await s.t.run((ctx) => ctx.db.get(a))).toMatchObject({
      status: "failed",
      error: "CREAO_API_KEY is not set in Convex env",
    });
  });

  test("launch → webhook with the right token → re-fetch → completed → the Messenger starts", async () => {
    const s = await seed();
    let status = "running";
    const calls = mockCreao(() => status);
    const id = await s.t.mutation(internal.creaoRuns.start, {
      companyId: s.companyId,
      cycleId: s.cycleId,
      agent: "auditor",
      why: "test",
    });
    await step(s);
    const row = await s.t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ status: "pending", runId: "run-1" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://developer.creao.ai/v1/runs",
      body: { agent_id: "agent-auditor", model: "anthropic/claude-opus-5-5" },
    });
    expect((calls[0].body as { webhook_url: string }).webhook_url).toContain(
      `t=${row?.callbackToken}`,
    );

    const bad = await s.t.fetch(`/creao/webhook?r=${id}&t=wrong`, {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });
    expect(bad.status).toBe(404);

    status = "completed";
    const ok = await s.t.fetch(
      `/creao/webhook?r=${id}&t=${row?.callbackToken}`,
      { method: "POST", body: JSON.stringify({ runId: "run-1" }) },
    );
    expect(ok.status).toBe(200);
    await step(s);
    await step(s);
    const runs = await s.t.run((ctx) => ctx.db.query("creaoRuns").collect());
    expect(runs.find((r) => r.agent === "auditor")).toMatchObject({
      status: "completed",
      credits: 1.5,
    });
    expect(runs.find((r) => r.agent === "messenger")?.status).toBeDefined();
  });
});

/** Adds an entry with no job and its CHK-01 flag to the seed. */
async function unmatched(s: Awaited<ReturnType<typeof seed>>) {
  return s.t.run(async (ctx) => {
    const entryId = await ctx.db.insert("timeEntries", {
      companyId: s.companyId,
      cycleId: s.cycleId,
      sourceId: "jobber:te3",
      workerId: s.fieldId,
      jobId: null,
      visitId: null,
      startAt: "2026-10-08T15:00:00Z",
      endAt: "2026-10-08T19:00:00Z",
      durationSec: 4 * 3600,
      ticking: false,
      approved: true,
      approvedBy: null,
      payable: true,
      category: "WORK",
      label: null,
      hasNote: false,
    });
    return ctx.db.insert("flags", {
      companyId: s.companyId,
      cycleId: s.cycleId,
      checkId: "CHK-01",
      status: "open",
      subject: {
        workerId: s.fieldId,
        jobId: null,
        entryIds: [entryId],
        expenseIds: [],
      },
      seen: `Entry ${entryId} has no job.`,
      where: [],
      confidence: "certain",
      precedent: null,
      routeTo: "manager",
      affects: { workerId: s.fieldId, jobId: null, dollarsCents: null },
      questionId: null,
      correctionId: null,
    });
  });
}

describe("agent proposals", () => {
  test("a confident match becomes a correction for a person; a weak one stays a question", async () => {
    const s = await seed();
    const flagId = await unmatched(s);
    const seen = await s.t.query(internal.agentApi.unmatched, {
      cycleId: s.cycleId,
    });
    expect(seen[0]).toMatchObject({ flagId, likely: [{ jobNumber: 12 }] });
    expect(JSON.stringify(seen)).not.toMatch(/person/); // no names leave

    const weak = await s.t.mutation(internal.agentApi.proposeMatches, {
      cycleId: s.cycleId,
      proposals: [
        {
          flagId,
          decision: {
            kind: "match",
            jobId: s.jobId,
            confidence: 0.7,
            reason: "same day",
          },
        },
      ],
    });
    expect(weak).toEqual([{ flagId, result: "ask" }]);

    const strong = await s.t.mutation(internal.agentApi.proposeMatches, {
      cycleId: s.cycleId,
      proposals: [
        {
          flagId,
          decision: {
            kind: "match",
            jobId: s.jobId,
            confidence: 0.93,
            reason: "visit that morning",
          },
        },
      ],
    });
    expect(strong).toEqual([{ flagId, result: "proposed" }]);
    const c = await s.t.run(
      async (ctx) => (await ctx.db.query("corrections").collect())[0],
    );
    expect(c).toMatchObject({
      source: "agent",
      status: "proposed",
      target: { field: "jobId" },
      after: s.jobId,
      effectPayCents: 0,
    });
  });

  test("a malformed proposal is refused with the reason", async () => {
    const s = await seed();
    await expect(
      s.t.mutation(internal.agentApi.proposeMatches, {
        cycleId: s.cycleId,
        proposals: [{ flagId: "x", decision: { kind: "sure" } }],
      }),
    ).rejects.toThrow(/invalid proposal/);
  });

  test("question drafts never carry money; agent flags are deduplicated and go to the owner", async () => {
    const s = await seed();
    const flagId = await unmatched(s);
    const money = await s.t.mutation(internal.agentApi.proposeQuestions, {
      cycleId: s.cycleId,
      proposals: [
        {
          flagId,
          draft: {
            text: "Was this $96 of work on job 12?",
            options: null,
            kind: "text",
            toRole: "manager",
            reason: "x",
          },
        },
      ],
    });
    expect(money[0].result).toMatch(/money/);
    const id = await s.t.mutation(internal.agentApi.proposeQuestions, {
      cycleId: s.cycleId,
      proposals: [
        {
          flagId,
          draft: {
            text: "Was your Oct 8 entry for job k978qzgf?",
            options: null,
            kind: "text",
            toRole: "manager",
            reason: "x",
          },
        },
      ],
    });
    expect(id[0].result).toMatch(/record ids/);
    const ok = await s.t.mutation(internal.agentApi.proposeQuestions, {
      cycleId: s.cycleId,
      proposals: [
        {
          flagId,
          draft: {
            text: "Which job was your 4h on Oct 8? 1 Job 12 2 other",
            options: ["Job 12", "other"],
            kind: "text",
            toRole: "manager",
            reason: "no template",
          },
        },
      ],
    });
    expect(ok[0].result).toBe("drafted");

    const flag = {
      subject: {
        workerId: s.fieldId,
        jobId: null,
        entryIds: [],
        expenseIds: [],
      },
      reason: "hours far above this worker's usual week",
      evidence: [s.a],
      confidence: 0.6,
    };
    const first = await s.t.mutation(internal.agentApi.proposeFlags, {
      cycleId: s.cycleId,
      flags: [flag, flag],
    });
    expect(first.created).toHaveLength(1);
    const f = await s.t.run((ctx) =>
      ctx.db.get(first.created[0] as Id<"flags">),
    );
    expect(f).toMatchObject({
      checkId: "AGT-01",
      routeTo: "owner",
      status: "open",
    });
  });
});
