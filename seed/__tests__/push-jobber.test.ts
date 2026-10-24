import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  buildPlan,
  type IdMap,
  marker,
  OBJECTS,
  partitionSupported,
  QUERIES,
  resolveRefs,
  retitlePlan,
} from "../lib/jobber-mutations";
import {
  codeFromRedirect,
  DEFAULT_REDIRECT_URI,
  isMutation,
  JOBBER_GRAPHQL_URL,
  SEED_TOKEN_PATH,
  SeedClient,
  seedAuthFromEnv,
} from "../lib/jobber-seed-client";
import { bucket, must } from "../lib/must";
import {
  availableMutations,
  closure,
  loadFixtures,
  oneTarget,
  pastedAddress,
  printDryRun,
  requireAllowedAccount,
} from "../push-jobber";

const { fx, currentCycleId } = loadFixtures("a");
const opts = {
  currentCycleId,
  companyName: "Company A",
  timezone: "America/New_York",
};
const answerKey = (await Bun.file(
  new URL("../../data/fixtures/a/answer-key.json", import.meta.url),
).json()) as { checkId: string; subject: { entryIds: string[] } }[];

/** A map as if everything had been created: every ref resolves. */
function fullMap(): IdMap {
  const m: IdMap = {
    users: Object.fromEntries(
      fx.workers.map((w) => [w.id as string, `U-${w.id}`]),
    ),
  };
  for (const s of buildPlan(fx, {}, opts).steps)
    bucket(m, s.object)[s.ourId] = `J-${s.object}-${s.ourId}`;
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
    const count = (o: string) =>
      plan.steps.filter((s) => s.object === o).length;
    expect(count("entries")).toBe(
      fx.timeEntries.filter((e) => !e.ticking).length,
    );
    expect(count("expenses")).toBe(
      fx.expenses.filter((e) => e.source === "jobber").length,
    );
    expect(count("jobs")).toBe(fx.jobs.length);
    expect(count("visits")).toBe(fx.visits.length);
    expect(count("payments")).toBe(
      fx.payments.filter((p) => p.paymentType !== "tip").length,
    );
    expect(plan.skipped.map((s) => s.ourId)).toContain("a-te-0140");
  });

  test("every step carries its marker in the payload", () => {
    for (const s of plan.steps.filter((x) =>
      [
        "clients",
        "quotes",
        "jobs",
        "visits",
        "entries",
        "expenses",
        "invoices",
        "payments",
      ].includes(x.object),
    )) {
      expect(JSON.stringify(s.variables)).toContain(marker(s.ourId));
    }
  });

  test("entries target a visit or a job, never both; the no-job entry has neither", () => {
    for (const s of plan.steps.filter((x) => x.object === "entries")) {
      const input = s.variables.input as Record<string, unknown>;
      expect(!!input.visitId && !!input.jobId).toBe(false);
      expect(input.labourRate).toBeUndefined();
    }
    const noJob = must(plan.steps.find((s) => s.ourId === "a-te-0121"))
      .variables.input as Record<string, unknown>;
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
    resolveRefs(
      must(plan.steps.find((s) => s.object === "entries")).variables,
      {},
      missing,
    );
    expect(missing.length).toBeGreaterThan(0);
  });

  test("idempotent: with everything mapped, the plan is empty", () => {
    expect(buildPlan(fx, fullMap(), opts).steps).toEqual([]);
  });

  test("--one: earliest past entry plus only what it needs, dependencies first", () => {
    const entries = plan.steps.filter((s) => s.object === "entries");
    const earliest = [...entries].sort((a, b) =>
      String(
        (a.variables.input as Record<string, unknown>).startAt,
      ).localeCompare(
        String((b.variables.input as Record<string, unknown>).startAt),
      ),
    )[0];
    expect(
      String((earliest.variables.input as Record<string, unknown>).startAt) <
        "2026-09-01",
    ).toBe(true);
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
    const chk06 = answerKey
      .filter((r) => r.checkId === "CHK-06")
      .flatMap((r) => r.subject.entryIds);
    const listed = plan.manual.after
      .filter((l) => l.includes("leave unapproved"))
      .map((l) => must(/a-te-\d+/.exec(l))[0]);
    const ticking = fx.timeEntries.filter((e) => e.ticking).map((e) => e.id);
    expect([...listed, ...ticking].sort()).toEqual([...chk06].sort());
  });
});

describe("live safety", () => {
  test("needs the seed app's own env vars (not the read app's)", () => {
    expect(() =>
      seedAuthFromEnv({ JOBBER_CLIENT_ID: "x", JOBBER_CLIENT_SECRET: "y" }),
    ).toThrow("JOBBER_SEED_CLIENT_ID");
    expect(
      seedAuthFromEnv({
        JOBBER_SEED_CLIENT_ID: "a",
        JOBBER_SEED_CLIENT_SECRET: "b",
      }).clientId,
    ).toBe("a");
  });
  test("talks only to api.getjobber.com and keeps its own token file", () => {
    expect(JOBBER_GRAPHQL_URL.startsWith("https://api.getjobber.com/")).toBe(
      true,
    );
    expect(
      SEED_TOKEN_PATH.endsWith("data/private/jobber-seed-tokens.json"),
    ).toBe(true);
  });
  // The live Account type has no `tester` field: only the allowlist can admit an account.
  const acct = (id: string, extra: Record<string, unknown> = {}) => ({
    gql: async () => ({
      data: { account: { id, name: `Acct ${id}`, ...extra } },
      errors: [],
    }),
  });
  test("refuses a non-allowlisted account and prints its id and name", async () => {
    await expect(requireAllowedAccount(acct("X"), {})).rejects.toThrow(
      'REFUSED: authorized Jobber account id=X name="Acct X"',
    );
    await expect(
      requireAllowedAccount(acct("X"), { JOBBER_SEED_ACCOUNT_ID: "OTHER" }),
    ).rejects.toThrow("REFUSED");
    await expect(
      requireAllowedAccount(acct("X"), { JOBBER_SEED_ACCOUNT_ID: "  " }),
    ).rejects.toThrow("REFUSED");
    await expect(
      requireAllowedAccount(acct("X", { tester: true }), {}),
    ).rejects.toThrow("REFUSED");
  });
  test("accepts the allowlisted account (the free trial)", async () => {
    expect(
      (
        await requireAllowedAccount(acct("TRIAL1"), {
          JOBBER_SEED_ACCOUNT_ID: "TRIAL1",
        })
      ).id,
    ).toBe("TRIAL1");
  });
  test("account query asks only for fields the live schema has", () => {
    expect(QUERIES.account).not.toContain("tester");
  });
  // Mutations the seed token's schema has (read-only introspection, 2026-10-24).
  const SEED_LIVE = [
    "clientCreate",
    "propertyCreate",
    "quoteCreate",
    "jobCreate",
    "visitCreate",
    "visitComplete",
    "expenseCreate",
    "invoiceCreate",
    "invoiceMarkAsSent",
  ];
  test("unsupported kinds are skipped and recorded, not refused: entries and payments", () => {
    const steps = buildPlan(fx, {}, opts).steps;
    const { run, skipped } = partitionSupported(steps, new Set(SEED_LIVE));
    expect(Object.keys(skipped).sort()).toEqual(["entries", "payments"]);
    expect(skipped.entries.count).toBe(
      steps.filter((s) => s.object === "entries").length,
    );
    expect(skipped.entries.mutations).toEqual(["timeSheetEntryCreate"]);
    expect(skipped.payments.mutations.sort()).toEqual([
      "invoiceCreatePaymentRecord",
      "quoteCreatePaymentRecord",
    ]);
    expect(
      run.some((s) => s.object === "entries" || s.object === "payments"),
    ).toBe(false);
    expect(new Set(run.map((s) => s.object))).toEqual(
      new Set([
        "clients",
        "properties",
        "quotes",
        "jobs",
        "visits",
        "visitCompletes",
        "expenses",
        "invoices",
      ]),
    );
  });
  test("a step that needs a skipped kind is skipped too", () => {
    const steps = buildPlan(fx, {}, opts).steps;
    const { skipped } = partitionSupported(
      steps,
      new Set(SEED_LIVE.filter((m) => m !== "visitCreate")),
    );
    expect(skipped.visits.reason).toContain("visitCreate");
    expect(skipped.visitCompletes.reason).toContain("needs visits");
  });
  test("availableMutations reads names from the schema", async () => {
    const fake = {
      gql: async () => ({
        data: { __type: { fields: SEED_LIVE.map((name) => ({ name })) } },
        errors: [],
      }),
    };
    expect((await availableMutations(fake)).has("invoiceCreate")).toBe(true);
  });
  test("--one targets the earliest visit when entries are unsupported", () => {
    const { run } = partitionSupported(
      buildPlan(fx, {}, opts).steps,
      new Set(SEED_LIVE),
    );
    const t = must(oneTarget(run));
    expect(t.object).toBe("visits");
    const c = closure(run, t, {});
    expect(c.map((s) => s.object)).toEqual(
      ["clients", "properties", "quotes", "jobs", "visits"].filter((k) =>
        c.some((s) => s.object === k),
      ),
    );
    expect(c.at(-1)).toBe(t);
  });
  test("visits use the live schedule shape in the company's time zone; invoices use invoiceCreate", () => {
    const steps = buildPlan(fx, {}, opts).steps;
    const v = must(
      steps.find((s) => s.ourId === "a-v01" && s.object === "visits"),
    );
    const sched = (
      (v.variables.input as Record<string, unknown>).visits as Record<
        string,
        unknown
      >[]
    )[0].schedule as Record<string, unknown>;
    expect(sched.startAt).toEqual({
      date: "2026-10-12",
      time: "07:00:00",
      timezone: "America/New_York",
    });
    expect(Array.isArray(sched.teamMemberIdsToAssign)).toBe(true);
    expect(v.idPath).toBe("visitCreate.createdVisits.0.id");
    const inv = must(
      steps.find((s) => s.object === "invoices" && s.ourId === "a-in03"),
    );
    const input = inv.variables.input as Record<string, unknown>;
    expect(inv.mutation).toBe("invoiceCreate");
    expect(input.markSent).toBe(false);
    expect(input.tax).toEqual({ taxCalculationMethod: "EXCLUSIVE" });
    expect(input.dueDetails).toEqual({});
    expect(input.subject).toBe("payrollpilot:a-in03");
    expect(input.propertyId).toBeUndefined();
  });
  test("refuses when the account query fails", async () => {
    const broken = {
      gql: async () => ({
        data: null,
        errors: [{ message: "UNAUTHENTICATED" }],
      }),
    };
    await expect(
      requireAllowedAccount(broken, { JOBBER_SEED_ACCOUNT_ID: "TRIAL1" }),
    ).rejects.toThrow("account query failed");
  });
});

describe("seed auth: paste-the-address code exchange", () => {
  const pkce = { state: "s123", redirectUri: DEFAULT_REDIRECT_URI };
  test("default redirect is the saved Vercel callback", () => {
    expect(DEFAULT_REDIRECT_URI).toBe("https://payrollpilot.vercel.app/auth");
  });
  test("takes the code from the full redirected address when state matches", () => {
    expect(
      codeFromRedirect(
        " https://payrollpilot.vercel.app/auth?code=abc&state=s123 \n",
        pkce,
      ),
    ).toBe("abc");
  });
  test("refuses wrong state, a bare code, another host or path, a Jobber error, and a missing code", () => {
    expect(() =>
      codeFromRedirect(
        "https://payrollpilot.vercel.app/auth?code=abc&state=other",
        pkce,
      ),
    ).toThrow("state does not match");
    expect(() => codeFromRedirect("abc", pkce)).toThrow("full address");
    expect(() =>
      codeFromRedirect("https://evil.example/auth?code=abc&state=s123", pkce),
    ).toThrow("not the seed app's redirect");
    expect(() =>
      codeFromRedirect(
        "https://payrollpilot.vercel.app/other?code=abc&state=s123",
        pkce,
      ),
    ).toThrow("not the seed app's redirect");
    expect(() =>
      codeFromRedirect(
        "https://payrollpilot.vercel.app/auth?error=access_denied&state=s123",
        pkce,
      ),
    ).toThrow("error=access_denied");
    expect(() =>
      codeFromRedirect("https://payrollpilot.vercel.app/auth?state=s123", pkce),
    ).toThrow("no code");
  });
  test("address comes from the argument, else PASTED_URL, else stdin", async () => {
    expect(await pastedAddress("A", { PASTED_URL: "B" }, async () => "C")).toBe(
      "A",
    );
    expect(
      await pastedAddress(undefined, { PASTED_URL: "B" }, async () => "C"),
    ).toBe("B");
    expect(await pastedAddress(undefined, {}, async () => "C\n")).toBe("C");
    await expect(
      pastedAddress(undefined, {}, async () => "  "),
    ).rejects.toThrow("no address");
  });
});

describe("seed client: dropped connections", () => {
  const fresh = {
    accessToken: "t",
    accessTokenExpiresAt: Date.now() + 3_600_000,
    refreshToken: "r",
  };
  const flaky = (failures: number) => {
    let n = 0;
    return (async () => {
      n++;
      if (n <= failures) throw new Error("ECONNRESET");
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
  };
  test("a read is retried after a dropped connection", async () => {
    const c = new SeedClient(
      { clientId: "a", clientSecret: "b" },
      flaky(2),
      async () => {},
      () => {},
      fresh,
    );
    expect((await c.gql("query { account { id } }")).data).toEqual({
      ok: true,
    });
  });
  test("a mutation is never retried blindly", async () => {
    const c = new SeedClient(
      { clientId: "a", clientSecret: "b" },
      flaky(1),
      async () => {},
      () => {},
      fresh,
    );
    await expect(
      c.gql("mutation($i: X!) { clientCreate(input: $i) { client { id } } }"),
    ).rejects.toThrow("may have been applied");
    expect(isMutation("  mutation { a }")).toBe(true);
    expect(isMutation("query { a }")).toBe(false);
  });
});

describe("--retitle", () => {
  test("lists only mapped jobs and expenses whose Jobber title differs from the fixtures", () => {
    const steps = buildPlan(fx, {}, opts).steps;
    const map: IdMap = {
      jobs: { "a-j28": "J28", "a-j01": "J01" },
      expenses: { "a-ex-4006": "E6" },
    };
    const current = new Map([
      ["J28", "Backyard patio and drainage - undefined [payrollpilot:a-j28]"],
      ["J01", "Front yard sod install - Larkspur Ln [payrollpilot:a-j01]"],
      ["E6", "Dump fee - undefined [payrollpilot:a-ex-4006]"],
    ]);
    expect(retitlePlan(steps, map, current)).toEqual([
      {
        kind: "jobs",
        ourId: "a-j28",
        jobberId: "J28",
        from: "Backyard patio and drainage - undefined [payrollpilot:a-j28]",
        to: "Backyard patio and drainage - Kingfisher Ln [payrollpilot:a-j28]",
      },
      {
        kind: "expenses",
        ourId: "a-ex-4006",
        jobberId: "E6",
        from: "Dump fee - undefined [payrollpilot:a-ex-4006]",
        to: "Dump fee - Kingfisher Ln [payrollpilot:a-ex-4006]",
      },
    ]);
  });
  test("no fixture title contains undefined any more", () => {
    for (const j of fx.jobs) expect(String(j.title)).not.toContain("undefined");
    for (const x of fx.expenses)
      expect(String(x.description)).not.toContain("undefined");
  });
});
