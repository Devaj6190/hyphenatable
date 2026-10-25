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
