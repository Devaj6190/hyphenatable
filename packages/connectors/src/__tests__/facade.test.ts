import { describe, expect, it } from "vitest";
import gustoFx from "../gusto/__fixtures__/gusto.json";
import { callbackTokenStore, pullSource, SOURCE_OBJECTS } from "../index.ts";
import {
  fakeJobberFetch,
  fixtures,
  memoryTokenStore,
} from "../jobber/__tests__/fakeJobber.ts";
import qboFx from "../qbo/__fixtures__/expenses.json";
import type { StoredTokens } from "../tokens.ts";

const fresh = (): StoredTokens => ({
  accessToken: "fake-at",
  accessTokenExpiresAt: Date.now() + 3_600_000,
  refreshToken: "fake-rt",
});
const base = {
  companyId: "a",
  cycleId: "a-c05",
  from: "2026-10-11",
  to: "2026-10-24",
  timezone: "America/Los_Angeles",
  credentials: { clientId: "cid", clientSecret: "cs" },
  sleepImpl: async () => {},
  now: () => new Date("2026-10-24T12:00:00Z"),
};

describe("pullSource('jobber')", () => {
  it("pulls every object by default, one SyncRun each, records in section 6 lists", async () => {
    const f = fakeJobberFetch(fixtures());
    const r = await pullSource("jobber", {
      ...base,
      fetchImpl: f.fetch,
      tokenStore: memoryTokenStore(fresh()),
    });
    expect(r.syncRuns.map((s) => s.object)).toEqual([...SOURCE_OBJECTS.jobber]);
    expect(r.syncRuns.every((s) => s.complete && s.cycleId === "a-c05")).toBe(
      true,
    );
    expect(Object.keys(r.records).sort()).toEqual([
      "expenses",
      "invoices",
      "jobs",
      "payments",
      "quotes",
      "timeEntries",
      "visits",
      "workers",
    ]);
    expect(r.records.timeEntries).toHaveLength(5);
  });

  it("one object type per action: users + timeSheetEntries only, no object queries made", async () => {
    const f = fakeJobberFetch(fixtures());
    const r = await pullSource("jobber", {
      ...base,
      objects: ["timeSheetEntries"],
      fetchImpl: f.fetch,
      tokenStore: memoryTokenStore(fresh()),
    });
    expect(r.syncRuns.map((s) => s.object)).toEqual(["timeSheetEntries"]);
    expect(Object.keys(r.records)).toEqual(["timeEntries"]);
    expect(
      f.calls.graphql.some((c) => c.operation.startsWith("PayrollPilot_")),
    ).toBe(false);
  });

  it("refreshes through the caller's token store (e.g. a Convex row) and saves the rotated token there", async () => {
    let row: StoredTokens | null = {
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: "fake-rt-0",
    };
    const saves: StoredTokens[] = [];
    const store = callbackTokenStore(
      async () => row,
      async (t) => {
        row = t;
        saves.push(t);
      },
    );
    const f = fakeJobberFetch(fixtures());
    await pullSource("jobber", {
      ...base,
      objects: ["users"],
      fetchImpl: f.fetch,
      tokenStore: store,
    });
    expect(saves).toHaveLength(1);
    expect(row?.refreshToken).toBe("fake-refresh-1");
  });

  it("rejects an unknown object name", async () => {
    await expect(
      pullSource("jobber", {
        ...base,
        objects: ["clients"],
        tokenStore: memoryTokenStore(fresh()),
      }),
    ).rejects.toThrow(/unknown jobber object/);
  });
});

describe("pullSource('qbo')", () => {
  const fetchImpl = (async (url: string | URL | Request) => {
    const sql = new URL(String(url)).searchParams.get("query") ?? "";
    const entity = /FROM (\w+)/.exec(sql)?.[1] as "Purchase" | "Bill";
    if (sql.includes("count(*)"))
      return Response.json({
        QueryResponse: { totalCount: qboFx[entity].length },
      });
    return Response.json({ QueryResponse: { [entity]: qboFx[entity] } });
  }) as typeof fetch;

  it("needs a realm id; returns only the asked entity", async () => {
    await expect(
      pullSource("qbo", {
        ...base,
        fetchImpl,
        tokenStore: memoryTokenStore(fresh()),
      }),
    ).rejects.toThrow(/realmId/);
    const r = await pullSource("qbo", {
      ...base,
      from: "2026-10-11",
      to: "2026-10-24",
      realmId: "fake-realm",
      objects: ["Bill"],
      fetchImpl,
      tokenStore: memoryTokenStore(fresh()),
    });
    expect(r.syncRuns.map((s) => [s.object, s.pulled, s.complete])).toEqual([
      ["Bill", 1, true],
    ]);
    expect(r.records.expenses?.map((x) => x.id)).toEqual(["qbo:Bill:301:1"]);
  });
});

describe("pullSource('gusto')", () => {
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    const page = Number(u.searchParams.get("page") ?? 1);
    let body = (gustoFx as Record<string, unknown>)[u.pathname];
    const key =
      u.searchParams.get("terminated") ??
      u.searchParams.get("processing_statuses");
    if (key && body && !Array.isArray(body))
      body = (body as Record<string, unknown>)[key] ?? [];
    if (Array.isArray(body) && page > 1) body = [];
    return body === undefined
      ? new Response("nf", { status: 404 })
      : Response.json(body);
  }) as typeof fetch;

  it("looks the company up from the token and pulls the asked objects", async () => {
    const r = await pullSource("gusto", {
      ...base,
      from: "2026-07-01",
      to: "2026-10-10",
      objects: ["employees", "payrolls_unprocessed"],
      fetchImpl,
      tokenStore: memoryTokenStore(fresh()),
    });
    expect(r.syncRuns.map((s) => [s.object, s.complete])).toEqual([
      ["employees", true],
      ["payrolls_unprocessed", true],
    ]);
    expect(r.records.workers).toHaveLength(4);
    expect(r.records.payrolls?.map((p) => p.sourceId)).toEqual([
      "fake-pr-0002",
    ]);
  });

  it("no usable token -> an incomplete SyncRun per asked object, not a throw", async () => {
    const r = await pullSource("gusto", {
      ...base,
      objects: ["employees", "contractors"],
      fetchImpl,
      tokenStore: memoryTokenStore(null),
    });
    expect(r.syncRuns.map((s) => [s.object, s.complete, s.expected])).toEqual([
      ["employees", false, null],
      ["contractors", false, null],
    ]);
    expect(r.syncRuns[0]?.error).toMatch(/No Gusto token/);
  });
});
