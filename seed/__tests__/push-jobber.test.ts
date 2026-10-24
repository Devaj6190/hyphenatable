import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type IdMap, OBJECTS, buildPlan, marker, resolveRefs } from "../lib/jobber-mutations";
import { JOBBER_GRAPHQL_URL, SEED_TOKEN_PATH, seedAuthFromEnv } from "../lib/jobber-seed-client";
import { closure, loadFixtures, printDryRun, requireAllowedAccount } from "../push-jobber";

const { fx, currentCycleId } = loadFixtures("a");
const opts = { currentCycleId, companyName: "Company A" };
const answerKey = (await Bun.file(new URL("../../data/fixtures/a/answer-key.json", import.meta.url)).json()) as { checkId: string; subject: { entryIds: string[] } }[];

/** A map as if everything had been created: every ref resolves. */
function fullMap(): IdMap {
  const m: IdMap = { users: Object.fromEntries(fx.workers.map((w) => [w.id as string, `U-${w.id}`])) };
  for (const s of buildPlan(fx, {}, opts).steps) (m[s.object] ??= {})[s.ourId] = `J-${s.object}-${s.ourId}`;
  return m;
}

describe("push-jobber dry run (default path)", () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (() => {
      throw new Error("dry run must not call the network");
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  const plan = buildPlan(fx, {}, opts);

  test("prints counts and both checklists without network or credentials", () => {
    const lines: string[] = [];
    const env = { ...process.env };
    delete process.env.JOBBER_SEED_CLIENT_ID;
    delete process.env.JOBBER_SEED_CLIENT_SECRET;
    printDryRun("a", plan, {}, { verbose: false, log: (l) => lines.push(l) });
    Object.assign(process.env, env);
    const out = lines.join("\n");
    expect(out).toContain("DRY RUN");
    expect(out).toContain("Manage Team");
    expect(out).toContain("Approve Timesheets");
    expect(out).toContain("Deactivate (CHK-08)");
    for (const o of OBJECTS) expect(out).toContain(o);
  });

  test("one step per record, ticking entry and tips left out, only Jobber expenses", () => {
    const count = (o: string) => plan.steps.filter((s) => s.object === o).length;
    expect(count("entries")).toBe(fx.timeEntries.filter((e) => !e.ticking).length);
    expect(count("expenses")).toBe(fx.expenses.filter((e) => e.source === "jobber").length);
    expect(count("jobs")).toBe(fx.jobs.length);
    expect(count("visits")).toBe(fx.visits.length);
    expect(count("payments")).toBe(fx.payments.filter((p) => p.paymentType !== "tip").length);
    expect(plan.skipped.map((s) => s.ourId)).toContain("a-te-0140");
  });

  test("every step carries its marker in the payload", () => {
    for (const s of plan.steps.filter((x) => ["clients", "quotes", "jobs", "visits", "entries", "expenses", "invoices", "payments"].includes(x.object))) {
      expect(JSON.stringify(s.variables)).toContain(marker(s.ourId));
    }
  });

  test("entries target a visit or a job, never both; the no-job entry has neither", () => {
    for (const s of plan.steps.filter((x) => x.object === "entries")) {
      const input = s.variables.input as Record<string, unknown>;
      expect(!!input.visitId && !!input.jobId).toBe(false);
      expect(input.labourRate).toBeUndefined();
    }
    const noJob = plan.steps.find((s) => s.ourId === "a-te-0121")!.variables.input as Record<string, unknown>;
    expect(noJob.jobId ?? noJob.visitId ?? null).toBeNull();
  });

  test("every ref resolves once its producer exists; nothing is guessed", () => {
    const map = fullMap();
    for (const s of plan.steps) {
      const missing: string[] = [];
      resolveRefs(s.variables, map, missing);
      expect(missing).toEqual([]);
    }
    const missing: string[] = [];
    resolveRefs(plan.steps.find((s) => s.object === "entries")!.variables, {}, missing);
    expect(missing.length).toBeGreaterThan(0);
  });

  test("idempotent: with everything mapped, the plan is empty", () => {
    expect(buildPlan(fx, fullMap(), opts).steps).toEqual([]);
  });

  test("--one: earliest past entry plus only what it needs, dependencies first", () => {
    const entries = plan.steps.filter((s) => s.object === "entries");
    const earliest = [...entries].sort((a, b) => String((a.variables.input as Record<string, unknown>).startAt).localeCompare(String((b.variables.input as Record<string, unknown>).startAt)))[0];
    expect(String((earliest.variables.input as Record<string, unknown>).startAt) < "2026-09-01").toBe(true);
    const c = closure(plan.steps, earliest, {});
    expect(c.at(-1)).toBe(earliest);
    expect(c.filter((s) => s.object === "entries")).toHaveLength(1);
    const order = c.map((s) => s.object);
    expect(order.indexOf("clients")).toBeLessThan(order.indexOf("properties"));
    expect(order.indexOf("properties")).toBeLessThan(order.indexOf("jobs"));
    expect(order.indexOf("jobs")).toBeLessThan(order.indexOf("visits"));
    expect(c.length).toBeLessThanOrEqual(6);
  });

  test("approval checklist leaves exactly the CHK-06 entries unapproved (ticking one handled as the timer)", () => {
    const chk06 = answerKey.filter((r) => r.checkId === "CHK-06").flatMap((r) => r.subject.entryIds);
    const listed = plan.manual.after.filter((l) => l.includes("leave unapproved")).map((l) => /a-te-\d+/.exec(l)![0]);
    const ticking = fx.timeEntries.filter((e) => e.ticking).map((e) => e.id);
    expect([...listed, ...ticking].sort()).toEqual([...chk06].sort());
  });
});

describe("live safety", () => {
  test("needs the seed app's own env vars (not the read app's)", () => {
    expect(() => seedAuthFromEnv({ JOBBER_CLIENT_ID: "x", JOBBER_CLIENT_SECRET: "y" })).toThrow("JOBBER_SEED_CLIENT_ID");
    expect(seedAuthFromEnv({ JOBBER_SEED_CLIENT_ID: "a", JOBBER_SEED_CLIENT_SECRET: "b" }).clientId).toBe("a");
  });
  test("talks only to api.getjobber.com and keeps its own token file", () => {
    expect(JOBBER_GRAPHQL_URL.startsWith("https://api.getjobber.com/")).toBe(true);
    expect(SEED_TOKEN_PATH.endsWith("data/private/jobber-seed-tokens.json")).toBe(true);
  });
  const acct = (id: string, tester: boolean) => ({ gql: async () => ({ data: { account: { id, name: `Acct ${id}`, tester } }, errors: [] }) });
  test("refuses a non-allowlisted, non-tester account and prints its id and name", async () => {
    await expect(requireAllowedAccount(acct("X", false), {})).rejects.toThrow('REFUSED: authorized Jobber account id=X name="Acct X"');
    await expect(requireAllowedAccount(acct("X", false), { JOBBER_SEED_ACCOUNT_ID: "OTHER" })).rejects.toThrow("REFUSED");
    await expect(requireAllowedAccount(acct("X", false), { JOBBER_SEED_ACCOUNT_ID: "  " })).rejects.toThrow("REFUSED");
  });
  test("accepts the allowlisted account (a regular trial, tester=false)", async () => {
    expect((await requireAllowedAccount(acct("TRIAL1", false), { JOBBER_SEED_ACCOUNT_ID: "TRIAL1" })).via).toBe("allowlist");
  });
  test("accepts a tester account", async () => {
    expect((await requireAllowedAccount(acct("T", true), {})).via).toBe("tester");
  });
  test("refuses when the account query fails", async () => {
    const broken = { gql: async () => ({ data: null, errors: [{ message: "UNAUTHENTICATED" }] }) };
    await expect(requireAllowedAccount(broken, { JOBBER_SEED_ACCOUNT_ID: "TRIAL1" })).rejects.toThrow("account query failed");
  });
});
