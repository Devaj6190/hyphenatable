// @vitest-environment edge-runtime
// Company A's fixtures through the real ingest path, then onboarding (B-13) and the controller.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./seed";

const files = import.meta.glob("../../../data/fixtures/a/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown[] | Record<string, unknown>>;
const TABLES = [
  "company",
  "workers",
  "cycles",
  "jobs",
  "visits",
  "quotes",
  "invoices",
  "payments",
  "expenses",
  "timeEntries",
  "pastPayrolls",
  "questions",
  "rules",
  "syncRuns",
];

function fixture() {
  const out: Record<string, unknown[]> = {};
  for (const [path, rows] of Object.entries(files)) {
    const name = path.split("/").pop()?.replace(".json", "") ?? "";
    if (!TABLES.includes(name)) continue;
    const table = name === "company" ? "companies" : name;
    // Onboarding starts from history alone: the fixture's expected rules are the answer key, not input.
    if (table === "rules") continue;
    out[table] = Array.isArray(rows) ? rows : [rows];
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  process.env.INGEST_KEY = "test-ingest";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CREAO_API_KEY;
});
afterEach(() => vi.useRealTimers());

test("Company A: ingest → onboarding proposes rules from history with evidence and backtests", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.mutation(api.sync.ingestFixture, {
    ingestKey: "test-ingest",
    fixture: fixture(),
  });
  const companyId = ids.a as Id<"companies">;
  // Only companies, workers and cycles come back (a real company has more rows than Convex's 1024 fields).
  const f = fixture();
  expect(Object.keys(ids).sort()).toEqual(
    [...f.companies, ...f.workers, ...f.cycles]
      .map((r) => r.id as string)
      .sort(),
  );

  const result = await t.action(api.onboarding.run, { companyId });
  expect(result.analyst).toMatch(/not run/);
  const rules = await t.run((ctx) => ctx.db.query("rules").collect());
  const byType = (type: string) => rules.filter((r) => r.type === type);

  expect(byType("overtime_policy")[0]).toMatchObject({
    status: "proposed",
    source: "history",
    params: { weeklyHours: 40, multiplier: 1.5 },
    backtest: { cycles: 4, agree: 4, disagree: 0 },
  });
  expect(byType("pay_rate")).toHaveLength(7);
  expect(byType("venmo_rate")[0].params).toMatchObject({
    workerId: ids["a-w09"],
    rateCents: 2500,
  });
  expect(
    byType("expense_account_kind")
      .map((r) => r.params.accountName)
      .sort(),
  ).toEqual([
    "Disposal",
    "Equipment Rental",
    "Insurance",
    "Materials",
    "Software",
  ]);
  expect(byType("routing")[0].params).toMatchObject({
    jobFacts: ids["a-w11"],
    money: ids["a-w12"],
  });
  for (const r of rules)
    expect(r.provenance.evidence.length).toBeGreaterThan(0);

  // Running it again proposes nothing new.
  await t.action(api.onboarding.run, { companyId });
  const again = await t.run((ctx) => ctx.db.query("rules").collect());
  console.log(
    "DUP",
    JSON.stringify(
      again
        .slice(rules.length)
        .map((r) => [r.type, r.params])
        .slice(0, 3),
    ),
    JSON.stringify(rules.slice(0, 2).map((r) => [r.type, r.params])),
  );
  expect(again).toHaveLength(rules.length);
});

test("Company A: the ingested current cycle runs its checks and drafts questions on its own", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.mutation(api.sync.ingestFixture, {
    ingestKey: "test-ingest",
    fixture: fixture(),
  });
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  const cycle = await t.run((ctx) => ctx.db.get(ids["a-c05"] as Id<"cycles">));
  expect(cycle?.stage).toBe("asking");
  const flags = await t.run((ctx) => ctx.db.query("flags").collect());
  expect(flags.length).toBeGreaterThan(5);
  const questions = await t.run((ctx) => ctx.db.query("questions").collect());
  expect(questions.filter((q) => q.status === "draft").length).toBeGreaterThan(
    0,
  );
  for (const q of questions.filter((x) => x.status === "draft"))
    expect(q.text).not.toMatch(/\$/);
  void internal;
});

test("Company A: demo reset restores the snapshot exactly, twice in a row, keeping company and worker ids", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.mutation(api.sync.ingestFixture, {
    ingestKey: "test-ingest",
    fixture: fixture(),
  });
  const companyId = ids.a as Id<"companies">;
  const counts = () =>
    t.run(async (ctx) => {
      const out: Record<string, number> = {};
      for (const table of [
        "workers",
        "cycles",
        "timeEntries",
        "flags",
        "questions",
        "rules",
        "corrections",
        "pastPayrolls",
      ] as const)
        out[table] = (await ctx.db.query(table).collect()).length;
      return out;
    });
  await t.action(internal.controller.snapshot.take, {
    companyId,
    label: "a:1",
  });
  const before = await counts();

  // The demo changes things: onboarding adds rules, an entry loses its job.
  await t.action(api.onboarding.run, { companyId });
  await t.run(async (ctx) => {
    const e = (await ctx.db.query("timeEntries").collect())[0];
    await ctx.db.patch(e._id, { jobId: null });
  });
  expect((await counts()).rules).toBeGreaterThan(before.rules);

  for (let i = 0; i < 2; i++) {
    await t.mutation(api.demo.reset, { companyKey: "a", toCycle: 1 });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect(await counts()).toEqual(before);
  }
  const after = await t.run(async (ctx) => ({
    company: await ctx.db.get(companyId),
    owner: await ctx.db.get(ids["a-w12"] as Id<"workers">),
    resets: (await ctx.db.query("auditEvents").collect()).filter(
      (e) => e.type === "demo.reset",
    ).length,
  }));
  expect(after.company?.name).toBeDefined();
  expect(after.owner?.role).toBe("owner");
  expect(after.resets).toBe(2);

  const summary = await t.query(api.eval.summary, { companyId });
  expect(summary.m1).toBeNull();
  expect(summary.m5?.total).toBeGreaterThan(0);
});
