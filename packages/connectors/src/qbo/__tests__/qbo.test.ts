import { describe, expect, it } from "vitest";
import type { StoredTokens, TokenStore } from "../../tokens.ts";
import fixture from "../__fixtures__/expenses.json";
import { QBO_SANDBOX_BASE, QboClient } from "../client.ts";
import { countQuery, pullExpenses, selectQuery } from "../index.ts";
import {
  normalizeBill,
  normalizePurchase,
  type RawBill,
  type RawPurchase,
  stripSeedSuffix,
} from "../normalize.ts";

const purchases = fixture.Purchase as RawPurchase[];
const bills = fixture.Bill as RawBill[];

function memStore(
  initial: StoredTokens | null,
): TokenStore & { saved: StoredTokens[] } {
  let cur = initial;
  const saved: StoredTokens[] = [];
  return {
    saved,
    load: async () => cur,
    save: async (t) => {
      cur = t;
      saved.push(t);
    },
  };
}

/** Serves the fixture through /query, honouring STARTPOSITION / MAXRESULTS and count(*). */
function fakeQbo(
  opts: { counts?: Record<string, number>; first?: Response } = {},
) {
  const urls: string[] = [];
  let first = opts.first;
  const fetchImpl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    if (first) {
      const r = first;
      first = undefined;
      return r;
    }
    const sql = new URL(String(url)).searchParams.get("query") ?? "";
    const entity = /FROM (\w+)/.exec(sql)?.[1] as "Purchase" | "Bill";
    const rows = fixture[entity];
    if (sql.includes("count(*)"))
      return Response.json({
        QueryResponse: { totalCount: opts.counts?.[entity] ?? rows.length },
      });
    const start = Number(/STARTPOSITION (\d+)/.exec(sql)?.[1]);
    const max = Number(/MAXRESULTS (\d+)/.exec(sql)?.[1]);
    const page = rows.slice(start - 1, start - 1 + max);
    return Response.json({
      QueryResponse: page.length
        ? { [entity]: page, startPosition: start, maxResults: page.length }
        : {},
    });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const auth = (
  fetchImpl: typeof fetch,
  store = memStore({
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshToken: "fake-rt-0",
  }),
) => ({
  clientId: "cid",
  clientSecret: "cs",
  realmId: "fake-realm-1",
  fetchImpl,
  tokenStore: store,
  sleepImpl: async () => {},
  refresher: async (rt: string) => ({
    accessToken: `fake-at-for-${rt}`,
    refreshToken: `${rt}-rotated`,
    expiresInSec: 3600,
  }),
});

describe("seed-pushed names", () => {
  it('strip exactly a trailing " (payrollpilot)" from account and vendor names', () => {
    expect(stripSeedSuffix("Materials (payrollpilot)")).toBe("Materials");
    expect(stripSeedSuffix("Materials")).toBe("Materials");
    expect(stripSeedSuffix("Materials (payrollpilot) Extra")).toBe(
      "Materials (payrollpilot) Extra",
    );
    expect(stripSeedSuffix("Materials(payrollpilot)")).toBe(
      "Materials(payrollpilot)",
    );
    expect(stripSeedSuffix("Materials (PayrollPilot)")).toBe(
      "Materials (PayrollPilot)",
    );
    expect(stripSeedSuffix(null)).toBeNull();
    const p = structuredClone(purchases[1] as RawPurchase);
    if (p.EntityRef) p.EntityRef.name = "Rent-All Equipment (payrollpilot)";
    const line = p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef;
    if (line) line.name = "Equipment Rental (payrollpilot)";
    expect(normalizePurchase(p, "a")[0]).toMatchObject({
      vendor: "Rent-All Equipment",
      accountName: "Equipment Rental",
    });
    const b = structuredClone(bills[0] as RawBill);
    if (b.VendorRef) b.VendorRef.name = "Metro Disposal (payrollpilot)";
    expect(normalizeBill(b, "a")[0]?.vendor).toBe("Metro Disposal");
  });
});

describe("normalizePurchase / normalizeBill", () => {
  it("untagged purchase -> one header Expense, seed marker as sourceId, exact cents", () => {
    expect(normalizePurchase(purchases[0] as RawPurchase, "a")).toEqual([
      {
        id: "qbo:Purchase:201",
        companyId: "a",
        source: "qbo",
        sourceId: "a-ex-0007",
        date: "2026-10-12",
        amountCents: 21437,
        vendor: "Valley Landscape Supply",
        description: null,
        accountName: "Materials",
        customerRef: null,
        paymentType: "CreditCard",
        kind: "unknown",
        matchedJobId: null,
        matchConfidence: null,
        reimbursableToWorkerId: null,
        reimbursementStatus: null,
      },
    ]);
  });

  it("a job-tagged line splits the purchase per line; untagged lines are kept", () => {
    const [a, b] = normalizePurchase(purchases[1] as RawPurchase, "a");
    expect(a).toMatchObject({
      id: "qbo:Purchase:202:1",
      sourceId: "Purchase:202#1",
      amountCents: 25000,
      accountName: "Equipment Rental",
      customerRef: "qbo:Customer:61",
      description: "Aerator rental",
    });
    expect(b).toMatchObject({
      id: "qbo:Purchase:202:2",
      sourceId: "Purchase:202#2",
      amountCents: 15010,
      accountName: "Materials",
      customerRef: null,
    });
    // customer names (clients) never leave the normalizer
    expect(JSON.stringify([a, b])).not.toContain("Client X");
  });

  it("a credit (refund) is negative", () => {
    expect(
      normalizePurchase(purchases[2] as RawPurchase, "a")[0]?.amountCents,
    ).toBe(-3550);
  });

  it("mixed accounts on an untagged purchase -> accountName null; non-vendor payee -> vendor null", () => {
    expect(
      normalizePurchase(purchases[3] as RawPurchase, "a")[0],
    ).toMatchObject({
      amountCents: 5999,
      accountName: null,
      vendor: null,
      paymentType: "Cash",
    });
  });

  it("bill: vendor from VendorRef, paymentType null, tagged line split", () => {
    expect(normalizeBill(bills[0] as RawBill, "a")).toEqual([
      expect.objectContaining({
        id: "qbo:Bill:301:1",
        sourceId: "a-ex-0012#1",
        vendor: "Metro Disposal",
        paymentType: null,
        amountCents: 8500,
        customerRef: "qbo:Customer:62",
        accountName: "Disposal",
      }),
    ]);
  });

  it("rejects an unexpected TxnDate instead of guessing", () => {
    expect(() =>
      normalizePurchase(
        { ...(purchases[0] as RawPurchase), TxnDate: "10/12/2026" },
        "a",
      ),
    ).toThrow();
  });
});

describe("pullExpenses", () => {
  it("pages with STARTPOSITION/MAXRESULTS, checks count(*), one complete SyncRun per entity", async () => {
    const q = fakeQbo();
    const r = await pullExpenses(
      auth(q.fetchImpl),
      "a",
      "2026-10-11",
      "2026-10-24",
      { pageSize: 3, cycleId: "a-c05" },
    );
    expect(
      r.syncRuns.map((s) => [
        s.object,
        s.pulled,
        s.expected,
        s.complete,
        s.error,
      ]),
    ).toEqual([
      ["Purchase", 4, 4, true, null],
      ["Bill", 1, 1, true, null],
    ]);
    expect(r.records.expenses).toHaveLength(6); // 201, 202 x2 lines, 203, 204, 301
    const sqls = q.urls.map((u) => new URL(u).searchParams.get("query"));
    expect(sqls).toContain(
      selectQuery("Purchase", "2026-10-11", "2026-10-24", 4, 3),
    );
    expect(sqls).toContain(countQuery("Bill", "2026-10-11", "2026-10-24"));
    expect(
      q.urls[0]?.startsWith(
        `${QBO_SANDBOX_BASE}/company/fake-realm-1/query?query=`,
      ),
    ).toBe(true);
    expect(q.urls[0]).toContain("minorversion=75");
  });

  it("count(*) above pulled -> that entity incomplete with the difference", async () => {
    const r = await pullExpenses(
      auth(fakeQbo({ counts: { Purchase: 5 } }).fetchImpl),
      "a",
      "2026-10-11",
      "2026-10-24",
    );
    expect(r.syncRuns[0]).toMatchObject({
      object: "Purchase",
      complete: false,
      pulled: 4,
      expected: 5,
      error: "Purchase: pulled 4, count(*) 5 (diff -1)",
    });
    expect(r.syncRuns[1]?.complete).toBe(true);
  });

  it("a Fault becomes an incomplete SyncRun, not a throw", async () => {
    const fault = Response.json(
      { Fault: { Error: [{ Message: "Invalid query", Detail: "bad token" }] } },
      { status: 400 },
    );
    const r = await pullExpenses(
      auth(fakeQbo({ first: fault }).fetchImpl),
      "a",
      "2026-10-11",
      "2026-10-24",
    );
    expect(r.syncRuns[0]).toMatchObject({ complete: false, expected: null });
    expect(r.syncRuns[0]?.error).toContain("Invalid query");
  });

  it("refuses non-date ranges (no SQL built from free text)", async () => {
    await expect(
      pullExpenses(
        auth(fakeQbo().fetchImpl),
        "a",
        "2026-10-11' OR 1=1",
        "2026-10-24",
      ),
    ).rejects.toThrow();
  });
});

describe("QboClient", () => {
  it("refreshes through the refresher, saves the rotated token, one refresh for concurrent calls", async () => {
    const store = memStore({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: "fake-rt-0",
    });
    let refreshes = 0;
    const q = fakeQbo();
    const c = new QboClient({
      ...auth(q.fetchImpl, store),
      refresher: async (rt) => ({
        accessToken: `at-${++refreshes}`,
        refreshToken: `${rt}-rotated`,
        expiresInSec: 3600,
      }),
    });
    await Promise.all([
      c.query(countQuery("Bill", "2026-10-01", "2026-10-02")),
      c.query(countQuery("Bill", "2026-10-01", "2026-10-02")),
    ]);
    expect(refreshes).toBe(1);
    expect(store.saved.at(-1)?.refreshToken).toBe("fake-rt-0-rotated");
  });

  it("refreshes once on 401 and retries", async () => {
    const q = fakeQbo({ first: new Response("unauthorized", { status: 401 }) });
    const store = memStore({
      accessToken: "stale",
      accessTokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: "fake-rt-0",
    });
    const c = new QboClient(auth(q.fetchImpl, store));
    await expect(
      c.query(countQuery("Bill", "2026-10-01", "2026-10-02")),
    ).resolves.toEqual({ QueryResponse: { totalCount: 1 } });
    expect(store.saved).toHaveLength(1);
  });

  it("waits 60 s on 429", async () => {
    const sleeps: number[] = [];
    const q = fakeQbo({ first: new Response("slow down", { status: 429 }) });
    const c = new QboClient({
      ...auth(q.fetchImpl),
      sleepImpl: async (ms) => void sleeps.push(ms),
    });
    await c.query(countQuery("Bill", "2026-10-01", "2026-10-02"));
    expect(sleeps).toEqual([60_000]);
  });

  it("is read-only: refuses anything but SELECT", async () => {
    const c = new QboClient(auth(fakeQbo().fetchImpl));
    await expect(c.query("DELETE FROM Purchase")).rejects.toThrow(/read-only/);
  });
});
