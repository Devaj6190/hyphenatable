import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bucket, must } from "../lib/must";
import {
  billIds,
  buildQboPlan,
  marker,
  type QboIdMap,
  QboSeedClient,
  qboSeedAuthFromEnv,
  resolveQboRefs,
  sandboxUrl,
} from "../lib/qbo";
import { loadQbo, plan, printDryRun } from "../push-qbo";

const { fx, currentPeriodStartDate, companyName } = loadQbo("a");
const opts = { currentPeriodStartDate, companyName };
const qboEx = fx.expenses.filter((x) => x.source === "qbo");

function fullMap(): QboIdMap {
  const m: QboIdMap = {};
  for (const s of buildQboPlan(fx, {}, opts).steps)
    bucket(m, s.object)[s.key] = `Q-${s.object}-${s.key}`;
  return m;
}

describe("push-qbo dry run (default path)", () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (() => {
      throw new Error("dry run must not call the network");
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });
  const p = buildQboPlan(fx, {}, opts);

  test("prints counts and the sandbox-only, no-reset notes without network", () => {
    const lines: string[] = [];
    printDryRun(
      "a",
      plan("a", {}),
      {},
      { verbose: false, log: (l) => lines.push(l) },
    );
    const out = lines.join("\n");
    expect(out).toContain("DRY RUN");
    expect(out).toContain("sandbox-quickbooks.api.intuit.com only");
    expect(out).toContain("Never 'Clear data and reset'");
  });

  test("one Purchase or Bill per QuickBooks expense, each marked in PrivateNote; Jobber expenses excluded", () => {
    const txns = p.steps.filter(
      (s) => s.entity === "Purchase" || s.entity === "Bill",
    );
    expect(txns.map((s) => s.key).sort()).toEqual(
      qboEx.map((x) => x.id as string).sort(),
    );
    for (const s of txns) expect(s.body.PrivateNote).toBe(marker(s.key));
  });

  test("two Bills, both past cycles, so the current-cycle Purchase count matches the fixtures", () => {
    const bills = billIds(fx, currentPeriodStartDate);
    expect(bills).toHaveLength(2);
    for (const id of bills)
      expect(
        String(must(qboEx.find((x) => x.id === id)).date) <
          currentPeriodStartDate,
      ).toBe(true);
    const curPurchases = p.steps.filter(
      (s) =>
        s.entity === "Purchase" &&
        String(s.body.TxnDate) >= currentPeriodStartDate,
    );
    expect(curPurchases).toHaveLength(
      qboEx.filter((x) => String(x.date) >= currentPeriodStartDate).length,
    );
  });

  test("CustomerRef only when the fixture is job-tagged; the CHK-14 purchase has none", () => {
    for (const s of p.steps.filter(
      (x) => x.entity === "Purchase" || x.entity === "Bill",
    )) {
      const detail = (s.body.Line as Record<string, unknown>[])[0]
        .AccountBasedExpenseLineDetail as Record<string, unknown>;
      const x = must(qboEx.find((e) => e.id === s.key));
      expect(!!detail.CustomerRef).toBe(!!x.matchedJobId);
    }
    const chk14 = must(p.steps.find((s) => s.key === "a-ex-0003"));
    expect(JSON.stringify(chk14.body)).not.toContain("CustomerRef");
  });

  test("sub-customers are Job:true under the client's parent, named by job number, marked in Notes", () => {
    const jobs = p.steps.filter((s) => s.object === "jobs");
    expect(jobs).toHaveLength(fx.jobs.length);
    for (const s of jobs) {
      expect(s.body.Job).toBe(true);
      expect(s.requireMarker).toBe(marker(s.key));
      expect(s.body.DisplayName).toBe(
        String(must(fx.jobs.find((j) => j.id === s.key)).jobNumber),
      );
    }
  });

  test("refs resolve to { value } once mapped; nothing is guessed; full map gives an empty plan", () => {
    const m = fullMap();
    for (const s of p.steps) {
      const missing: string[] = [];
      const body = resolveQboRefs(s.body, m, missing) as Record<
        string,
        unknown
      >;
      expect(missing).toEqual([]);
      if (s.entity === "Purchase")
        expect((body.EntityRef as Record<string, unknown>).type).toBe("Vendor");
    }
    const missing: string[] = [];
    resolveQboRefs(
      must(p.steps.find((s) => s.entity === "Purchase")).body,
      {},
      missing,
    );
    expect(missing.length).toBeGreaterThan(0);
    expect(buildQboPlan(fx, m, opts).steps).toEqual([]);
  });
});

describe("live safety (fake fetch, no network)", () => {
  const auth = { clientId: "id", clientSecret: "secret", realmId: "123" };
  const fresh = {
    accessToken: "t",
    accessTokenExpiresAt: Date.now() + 3_600_000,
    refreshToken: "r",
  };

  test("env names come from shared-context section 16", () => {
    expect(() => qboSeedAuthFromEnv({})).toThrow("QBO_CLIENT_ID");
  });

  test("every URL is the sandbox host", () => {
    expect(sandboxUrl("123", "purchase", { operation: "delete" })).toStartWith(
      "https://sandbox-quickbooks.api.intuit.com/v3/company/123/purchase?operation=delete",
    );
  });

  test("delete is by API with Id and SyncToken; query is SELECT only; 429 waits 60 s", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sleeps: number[] = [];
    let first = true;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (first) {
        first = false;
        return new Response("{}", { status: 429 });
      }
      return new Response(JSON.stringify({ Purchase: { Id: "9" } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const c = new QboSeedClient(
      auth,
      fakeFetch,
      async (ms) => void sleeps.push(ms),
      fresh,
    );
    await c.deleteTxn("Purchase", "9", "0");
    expect(sleeps).toContain(60_000);
    const last = must(calls.at(-1));
    expect(last.url).toContain(
      "sandbox-quickbooks.api.intuit.com/v3/company/123/purchase?operation=delete",
    );
    expect(JSON.parse(String(last.init.body))).toEqual({
      Id: "9",
      SyncToken: "0",
    });
    expect(() => c.query("DELETE FROM Purchase")).toThrow("SELECT only");
  });
});
