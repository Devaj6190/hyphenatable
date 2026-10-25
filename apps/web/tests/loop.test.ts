// @vitest-environment edge-runtime
// The texting loop, corrections, learning and Gate 1 run end to end against Convex's test backend.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { seed } from "./seed";

const KEY = "test-courier-key";

beforeEach(() => {
  vi.useFakeTimers();
  process.env.COURIER_KEY = KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.VOYAGE_API_KEY;
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => vi.useRealTimers());

/** Drafts, approves (as the manager) and "sends" the flag's question; returns the question id. */
async function askAndSend(
  s: Awaited<ReturnType<typeof seed>>,
  conversationKey = "sha256:conv-field",
) {
  const { t } = s;
  const drafted = await t.mutation(internal.questions.draftForCycle, {
    cycleId: s.cycleId,
  });
  expect(drafted.drafted).toBe(1);
  const q = await t.run(async (ctx) =>
    (await ctx.db.query("questions").collect()).find(
      (x) => x.status === "draft",
    ),
  );
  if (!q) throw new Error("no draft question");
  expect(q.toRole).toBe("employee");
  expect(q.text).not.toMatch(/\$/);
  await t.mutation(api.questions.approve, {
    questionId: q._id,
    userId: s.managerId,
  });
  const out = await t.query(api.messages.pendingOutbound, { courierKey: KEY });
  expect(out).toHaveLength(1);
  expect(out[0].contactRef).toBe("c_field");
  await t.mutation(api.messages.markSent, {
    courierKey: KEY,
    messageId: out[0].messageId,
    providerId: `sha256:out-${q._id}`,
    conversationKey,
  });
  return q._id;
}

const reply = (
  s: Awaited<ReturnType<typeof seed>>,
  text: string,
  n: number,
  conversationKey = "sha256:conv-field",
) =>
  s.t.mutation(api.messages.inbound, {
    courierKey: KEY,
    conversationKey,
    providerId: `sha256:in-${n}`,
    text,
    kind: "text",
    pollTarget: null,
  });

describe("texting loop", () => {
  test("question → approval → send → reply → correction → owner approval → workbook and lesson", async () => {
    const s = await seed();
    const { t } = s;
    await askAndSend(s);
    expect((await t.run((ctx) => ctx.db.get(s.cycleId)))?.questionsAsked).toBe(
      1,
    );

    // "1" keeps the 8am-4pm entry: the 1pm-3pm one is dropped.
    await reply(s, "1", 1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const correction = await t.run(
      async (ctx) => (await ctx.db.query("corrections").collect())[0],
    );
    expect(correction).toMatchObject({
      status: "proposed",
      target: { table: "timeEntries", id: s.b, field: "payable" },
      before: true,
      after: false,
      effectPayCents: -4800,
      effectProfitCents: 4800,
    });

    await expect(
      t.mutation(api.corrections.approve, {
        correctionId: correction._id,
        userId: s.managerId,
      }),
    ).rejects.toThrow(/only the owner/);
    await t.mutation(api.corrections.approve, {
      correctionId: correction._id,
      userId: s.ownerId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.run(async (ctx) => ({
      entry: await ctx.db.get(s.b),
      flag: await ctx.db.get(s.flagId),
      draft: (await ctx.db.query("drafts").collect())[0],
      lessons: await ctx.db.query("lessons").collect(),
      rules: await ctx.db.query("rules").collect(),
      cycle: await ctx.db.get(s.cycleId),
    }));
    expect(after.entry?.payable).toBe(false);
    expect(after.flag?.status).toBe("corrected");
    expect(after.draft.totals.hours).toBe(8);
    expect(after.lessons).toHaveLength(1);
    expect(after.rules.filter((r) => r.type === "routing")).toMatchObject([
      {
        type: "routing",
        status: "active",
        params: { checkId: "CHK-04", answeredBy: "employee" },
      },
    ]);
    // The only flag is settled, so the controller moved the cycle to Gate 1.
    expect(after.cycle?.stage).toBe("gate1_ready");
  });

  test("free text with no reader gets one follow-up, then the item is held", async () => {
    const s = await seed();
    const { t } = s;
    await askAndSend(s);
    await reply(s, "the morning one i think", 1);
    const followUp = await t.run(async (ctx) =>
      (await ctx.db.query("questions").collect()).find(
        (q) => q.status === "draft",
      ),
    );
    expect(followUp).toBeDefined();
    await t.mutation(api.questions.approve, {
      questionId: followUp?._id as Id<"questions">,
      userId: s.ownerId,
    });
    const out = await t.query(api.messages.pendingOutbound, {
      courierKey: KEY,
    });
    await t.mutation(api.messages.markSent, {
      courierKey: KEY,
      messageId: out[0].messageId,
      providerId: "sha256:out-2",
      conversationKey: "sha256:conv-field",
    });
    await reply(s, "not sure honestly", 2);
    expect((await t.run((ctx) => ctx.db.get(s.flagId)))?.status).toBe("held");
  });

  test("STOP: no more texts to that person, and the question goes to their manager", async () => {
    const s = await seed();
    const { t } = s;
    await askAndSend(s);
    await reply(s, "STOP", 1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const state = await t.run(async (ctx) => ({
      rules: await ctx.db.query("rules").collect(),
      questions: await ctx.db.query("questions").collect(),
      interpretations: await ctx.db.query("interpretations").collect(),
    }));
    expect(state.rules.filter((r) => r.type === "routing")).toMatchObject([
      { type: "routing", status: "active", params: { doNotText: s.fieldId } },
    ]);
    expect(state.interpretations[0]).toMatchObject({
      model: "code",
      result: { kind: "stop" },
    });
    expect(state.questions.find((q) => q.status === "draft")?.toRole).toBe(
      "manager",
    );
  });

  test("a duplicate inbound message is ignored", async () => {
    const s = await seed();
    await askAndSend(s);
    await reply(s, "1", 7);
    expect(await reply(s, "1", 7)).toEqual({ duplicate: true });
  });

  test("the courier key is required", async () => {
    const s = await seed();
    await expect(
      s.t.query(api.messages.pendingOutbound, { courierKey: "wrong" }),
    ).rejects.toThrow(/courier key/);
  });
});

describe("rules and gates", () => {
  test("the person whose answer created a rule cannot approve it", async () => {
    const s = await seed();
    const ruleId = await s.t.run((ctx) =>
      ctx.db.insert("rules", {
        companyId: s.companyId,
        type: "long_shift_threshold",
        params: { hours: 13 },
        status: "proposed",
        source: "answer",
        provenance: {
          lessonId: null,
          flagId: null,
          answeredBy: s.ownerId,
          approvedBy: null,
          approvedAt: null,
          evidence: ["x"],
        },
        backtest: null,
        confidence: 0.5,
      }),
    );
    await expect(
      s.t.mutation(api.rules.approve, { ruleId, userId: s.ownerId }),
    ).rejects.toThrow(/cannot also approve/);
  });

  test("Gate 1 is refused while the time sheet sync is incomplete", async () => {
    const s = await seed();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.cycleId, { stage: "gate1_ready" });
      await ctx.db.insert("syncRuns", {
        companyId: s.companyId,
        cycleId: s.cycleId,
        source: "jobber",
        object: "timeSheetEntries",
        startedAt: "2026-10-19T01:00:00Z",
        finishedAt: "2026-10-19T01:01:00Z",
        pulled: 40,
        expected: 42,
        complete: false,
        method: "api",
        error: null,
      });
    });
    await expect(
      s.t.mutation(api.drafts.approveGate, {
        cycleId: s.cycleId,
        stage: 1,
        userId: s.ownerId,
      }),
    ).rejects.toThrow(/incomplete sync: jobber timeSheetEntries \(40 of 42\)/);
    await expect(
      s.t.mutation(api.drafts.approveGate, {
        cycleId: s.cycleId,
        stage: 1,
        userId: s.managerId,
      }),
    ).rejects.toThrow(/only the owner/);
  });
});
