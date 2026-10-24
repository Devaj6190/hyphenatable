import { describe, expect, it } from "vitest";
import type { StoredTokens, TokenStore } from "../../tokens.ts";
import fixture from "../__fixtures__/gusto.json";
import { GUSTO_TOKEN_URL, GustoClient, gustoUrl } from "../client.ts";
import {
  companyUuidForToken,
  pullContractors,
  pullEmployees,
  pullPayrolls,
  pullUnprocessed,
} from "../read.ts";

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

type Opts = {
  totalCounts?: Record<string, number>;
  status?: Record<string, number>;
  repeatPages?: boolean;
};
function fakeGusto(fx = structuredClone(fixture), opts: Opts = {}) {
  const calls: { method: string; url: URL; headers: Headers; body?: string }[] =
    [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    calls.push({
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: init?.body ? String(init.body) : undefined,
    });
    if (String(input) === GUSTO_TOKEN_URL)
      return Response.json({
        access_token: "fake-at-1",
        refresh_token: "fake-rt-1",
        expires_in: 7200,
      });
    const forced = opts.status?.[url.pathname];
    if (forced) return new Response("x", { status: forced });
    const page = Number(url.searchParams.get("page") ?? 1);
    let body = (fx as Record<string, unknown>)[url.pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    const key =
      url.searchParams.get("terminated") ??
      url.searchParams.get("processing_statuses");
    if (key && !Array.isArray(body))
      body = (body as Record<string, unknown>)[key] ?? [];
    if (Array.isArray(body) && page > 1 && !opts.repeatPages) body = [];
    const total = opts.totalCounts?.[`${url.pathname}?${key ?? ""}`];
    return Response.json(body, {
      headers: total !== undefined ? { "X-Total-Count": String(total) } : {},
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const auth = (
  f: { fetchImpl: typeof fetch },
  store = memStore({
    accessToken: "fake-at-0",
    accessTokenExpiresAt: Date.now() + 3_600_000,
    refreshToken: "fake-rt-0",
  }),
) => ({
  clientId: "cid",
  clientSecret: "cs",
  fetchImpl: f.fetchImpl,
  tokenStore: store,
  sleepImpl: async () => {},
});
const now = () => new Date("2026-10-24T12:00:00Z");

describe("Gusto client", () => {
  it("GET only on api.gusto-demo.com with the version header", async () => {
    const f = fakeGusto();
    expect(await companyUuidForToken(new GustoClient(auth(f)))).toBe(
      "fake-co-0001",
    );
    expect(f.calls[0]?.method).toBe("GET");
    expect(f.calls[0]?.headers.get("x-gusto-api-version")).toBe("2026-06-15");
    expect(f.calls[0]?.headers.get("authorization")).toBe("Bearer fake-at-0");
  });

  it("refuses any other host", () => {
    expect(() => gustoUrl("https://api.gusto.com/v1/token_info")).toThrow(
      /Refusing host/,
    );
    expect(() => gustoUrl("//evil.example/v1/x")).toThrow(/Refusing host/);
    expect(gustoUrl("/v1/token_info")).toBe(
      "https://api.gusto-demo.com/v1/token_info",
    );
  });

  it("refreshes on 401 with a refresh_token grant (registered redirect) and saves the rotated token", async () => {
    let first = true;
    const f = fakeGusto();
    const fetchImpl = (async (u: string | URL | Request, i?: RequestInit) => {
      if (first && String(u) !== GUSTO_TOKEN_URL) {
        first = false;
        return new Response("unauthorized", { status: 401 });
      }
      return f.fetchImpl(u, i);
    }) as typeof fetch;
    const store = memStore({
      accessToken: "stale",
      accessTokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: "fake-rt-0",
    });
    await companyUuidForToken(
      new GustoClient({ ...auth(f, store), fetchImpl }),
    );
    const tokenCall = f.calls.find((c) => c.method === "POST");
    expect(JSON.parse(tokenCall?.body ?? "{}")).toEqual({
      client_id: "cid",
      client_secret: "cs",
      redirect_uri: "http://localhost:3000/auth/gusto",
      grant_type: "refresh_token",
      refresh_token: "fake-rt-0",
    });
    expect(store.saved.at(-1)?.refreshToken).toBe("fake-rt-1");
  });

  it("fails instead of looping when an endpoint ignores page", async () => {
    const big = structuredClone(fixture);
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ...big["/v1/companies/fake-co-0001/contractors"][0],
      uuid: `c-${i}`,
    }));
    (big as Record<string, unknown>)["/v1/companies/fake-co-0001/contractors"] =
      rows;
    const r = await pullContractors(
      auth(fakeGusto(big, { repeatPages: true })),
      "a",
      "fake-co-0001",
      { now },
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain("ignored page=2");
  });
});

describe("pullEmployees", () => {
  it("active and terminated employees with the current compensation, in cents", async () => {
    const f = fakeGusto();
    const r = await pullEmployees(auth(f), "a", "fake-co-0001", { now });
    expect(r.syncRun).toMatchObject({
      source: "gusto",
      object: "employees",
      pulled: 4,
      expected: null,
      complete: true,
      error: null,
    });
    const by = Object.fromEntries(
      r.records.workers.map((w) => [w.gusto?.employeeUuid, w]),
    );
    expect(by["fake-emp-0001"]).toEqual({
      id: "gusto:employee:fake-emp-0001",
      companyId: "a",
      displayName: "Riley Park",
      role: null,
      payType: "hourly",
      status: "active",
      managerId: null,
      contactRef: null,
      jobber: null,
      venmoRateCents: null,
      gusto: {
        employeeUuid: "fake-emp-0001",
        contractorUuid: null,
        jobUuid: "fake-job-0001",
        rateCents: 2800,
        paymentUnit: "Hour",
        flsaStatus: "Nonexempt",
        onboarded: true,
      },
    });
    expect(by["fake-emp-0002"]?.gusto).toMatchObject({
      rateCents: 6240000,
      paymentUnit: "Year",
      flsaStatus: "Exempt",
    });
    expect(by["fake-emp-0002"]?.payType).toBe("salary");
    // job without inline compensations -> fetched from /v1/jobs/{uuid}/compensations; not onboarded kept
    expect(by["fake-emp-0003"]?.gusto).toMatchObject({
      rateCents: 3115,
      onboarded: false,
    });
    expect(
      f.calls.some(
        (c) => c.url.pathname === "/v1/jobs/fake-job-0003/compensations",
      ),
    ).toBe(true);
    // two jobs, none primary -> no job, no rate (never pick one)
    expect(by["fake-emp-0004"]).toMatchObject({
      status: "inactive",
      payType: null,
      gusto: { jobUuid: null, rateCents: null },
    });
    expect(
      f.calls
        .filter((c) => c.url.pathname.endsWith("/employees"))
        .every(
          (c) => c.url.searchParams.get("include") === "all_compensations",
        ),
    ).toBe(true);
  });

  it("X-Total-Count above pulled -> incomplete", async () => {
    const f = fakeGusto(undefined, {
      totalCounts: { "/v1/companies/fake-co-0001/employees?false": 4 },
    });
    const r = await pullEmployees(auth(f), "a", "fake-co-0001", { now });
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toBe(
      "employees(terminated=false): pulled 3, X-Total-Count 4",
    );
  });

  it("an HTTP failure is an incomplete SyncRun, not a throw", async () => {
    const f = fakeGusto(undefined, {
      status: { "/v1/companies/fake-co-0001/employees": 403 },
    });
    const r = await pullEmployees(auth(f), "a", "fake-co-0001", { now });
    expect(r.syncRun).toMatchObject({
      complete: false,
      pulled: 0,
      expected: null,
    });
    expect(r.records.workers).toEqual([]);
  });
});

describe("contractors and payrolls", () => {
  it("contractors: hourly rate in cents, fixed-wage rate null, payType left to config", async () => {
    const r = await pullContractors(auth(fakeGusto()), "a", "fake-co-0001", {
      now,
    });
    const [sky, biz] = r.records.workers;
    expect(sky).toMatchObject({
      id: "gusto:contractor:fake-con-0001",
      payType: null,
      status: "active",
      gusto: {
        contractorUuid: "fake-con-0001",
        rateCents: 2250,
        paymentUnit: "Hour",
      },
    });
    expect(biz).toMatchObject({
      displayName: "Fake Hauling LLC",
      status: "inactive",
      gusto: { rateCents: null, paymentUnit: null },
    });
  });

  it("processed payrolls are fetched in detail: per-employee gross and lines in cents", async () => {
    const f = fakeGusto();
    const r = await pullPayrolls(
      auth(f),
      "a",
      "fake-co-0001",
      "2026-07-01",
      "2026-10-10",
      { now },
    );
    expect(r.syncRun).toMatchObject({
      object: "payrolls_processed",
      pulled: 1,
      expected: 1,
      complete: true,
    });
    const list = f.calls.find(
      (c) => c.url.pathname === "/v1/companies/fake-co-0001/payrolls",
    );
    expect(Object.fromEntries(list?.url.searchParams ?? [])).toMatchObject({
      processing_statuses: "processed",
      payroll_types: "regular,off_cycle",
      start_date: "2026-07-01",
      end_date: "2026-10-10",
    });
    const [p] = r.records.payrolls;
    expect(p).toMatchObject({
      id: "gusto:payroll:fake-pr-0001",
      processed: true,
      payrollType: "regular",
      periodStart: "2026-09-27",
      periodEnd: "2026-10-10",
      grossCents: 484500,
    });
    expect(p?.employees?.[0]).toEqual({
      workerId: "gusto:employee:fake-emp-0001",
      employeeUuid: "fake-emp-0001",
      excluded: false,
      grossCents: 234500,
      netCents: 189042,
      hourly: [
        {
          name: "Regular Hours",
          hours: 80,
          amountCents: 224000,
          jobUuid: "fake-job-0001",
        },
        {
          name: "Overtime",
          hours: 2.5,
          amountCents: 10500,
          jobUuid: "fake-job-0001",
        },
      ],
      fixed: [],
    });
    expect(p?.employees?.[1]?.fixed).toEqual([
      { name: "Bonus", amountCents: 10000, jobUuid: null },
    ]);
  });

  it("a payroll detail without employee_compensations makes the run incomplete", async () => {
    const fx = structuredClone(fixture) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    delete fx["/v1/companies/fake-co-0001/payrolls/fake-pr-0001"]
      ?.employee_compensations;
    const r = await pullPayrolls(
      auth(fakeGusto(fx as unknown as typeof fixture)),
      "a",
      "fake-co-0001",
      "2026-07-01",
      "2026-10-10",
      { now },
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error).toContain("no employee_compensations");
  });

  it("unprocessed payrolls are listed only (no prepare, no detail)", async () => {
    const f = fakeGusto();
    const r = await pullUnprocessed(auth(f), "a", "fake-co-0001", { now });
    expect(r.records.payrolls).toEqual([
      expect.objectContaining({
        sourceId: "fake-pr-0002",
        processed: false,
        periodStart: "2026-10-11",
        periodEnd: "2026-10-24",
        employees: null,
      }),
    ]);
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
    expect(
      f.calls.some((c) => /prepare|submit|calculate/.test(c.url.pathname)),
    ).toBe(false);
  });
});
