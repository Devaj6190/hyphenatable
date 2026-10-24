import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileTokenStore,
  isWriteDocument,
  JOBBER_GRAPHQL_URL,
  JobberClient,
  throttleDelaySec,
} from "../client.ts";
import { USERS_COUNT_QUERY } from "../queries.ts";
import { memoryTokenStore } from "./fakeJobber.ts";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const tokenResponse = (n: number) =>
  ok({
    access_token: `fake-access-${n}`,
    refresh_token: `fake-refresh-${n}`,
    expires_in: 3600,
  });
const countData = (available: number) => ({
  data: { users: { totalCount: 4 } },
  extensions: {
    cost: {
      throttleStatus: {
        maximumAvailable: 10000,
        currentlyAvailable: available,
        restoreRate: 500,
      },
    },
  },
});

function scripted(graphql: (() => Response)[]) {
  let refreshes = 0;
  const seen: { url: string; body: string }[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    seen.push({ url: String(url), body: String(init?.body) });
    if (String(url) !== JOBBER_GRAPHQL_URL) return tokenResponse(++refreshes);
    const next = graphql.shift();
    if (!next) throw new Error("no more scripted responses");
    return next();
  }) as typeof fetch;
  return { fetchImpl, seen, refreshCount: () => refreshes };
}

describe("JobberClient", () => {
  it("refreshes with a form-encoded refresh_token grant and stores the rotated token", async () => {
    const store = memoryTokenStore({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: "fake-refresh-0",
    });
    const s = scripted([() => ok(countData(9000))]);
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "csecret",
      tokenStore: store,
      fetchImpl: s.fetchImpl,
      sleepImpl: async () => {},
    });
    await c.query(USERS_COUNT_QUERY);
    const form = new URLSearchParams(s.seen[0]?.body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "refresh_token",
      client_id: "cid",
      client_secret: "csecret",
      refresh_token: "fake-refresh-0",
    });
    expect(store.saved.at(-1)?.refreshToken).toBe("fake-refresh-1");
  });

  it("runs one in-flight refresh for concurrent requests", async () => {
    const store = memoryTokenStore({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: "fake-refresh-0",
    });
    const s = scripted([
      () => ok(countData(9000)),
      () => ok(countData(9000)),
      () => ok(countData(9000)),
    ]);
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "csecret",
      tokenStore: store,
      fetchImpl: s.fetchImpl,
      sleepImpl: async () => {},
    });
    await Promise.all([
      c.query(USERS_COUNT_QUERY),
      c.query(USERS_COUNT_QUERY),
      c.query(USERS_COUNT_QUERY),
    ]);
    expect(s.refreshCount()).toBe(1);
  });

  it("refreshes once on 401 and retries", async () => {
    const store = memoryTokenStore({
      accessToken: "stale",
      accessTokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: "fake-refresh-0",
    });
    const s = scripted([
      () => ok({ message: "unauthorized" }, 401),
      () => ok(countData(9000)),
    ]);
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "csecret",
      tokenStore: store,
      fetchImpl: s.fetchImpl,
      sleepImpl: async () => {},
    });
    await expect(c.query(USERS_COUNT_QUERY)).resolves.toEqual({
      users: { totalCount: 4 },
    });
    expect(s.refreshCount()).toBe(1);
  });

  it("sleeps (2000 - available) / 500 s below 1500 points", async () => {
    expect(throttleDelaySec(1500)).toBe(0);
    expect(throttleDelaySec(1000)).toBe(2);
    expect(throttleDelaySec(0)).toBe(4);
    const sleeps: number[] = [];
    const store = memoryTokenStore({
      accessToken: "a",
      accessTokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: "r",
    });
    const s = scripted([() => ok(countData(1000))]);
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "x",
      tokenStore: store,
      fetchImpl: s.fetchImpl,
      sleepImpl: async (ms) => void sleeps.push(ms),
    });
    await c.query(USERS_COUNT_QUERY);
    expect(sleeps).toEqual([2000]);
  });

  it("retries a THROTTLED error that arrives with HTTP 200", async () => {
    const sleeps: number[] = [];
    const store = memoryTokenStore({
      accessToken: "a",
      accessTokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: "r",
    });
    const s = scripted([
      () =>
        ok({
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
          extensions: { cost: { throttleStatus: { currentlyAvailable: 200 } } },
        }),
      () => ok(countData(9000)),
    ]);
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "x",
      tokenStore: store,
      fetchImpl: s.fetchImpl,
      sleepImpl: async (ms) => void sleeps.push(ms),
    });
    await expect(c.query(USERS_COUNT_QUERY)).resolves.toEqual({
      users: { totalCount: 4 },
    });
    expect(sleeps).toEqual([3600]);
  });

  it("refuses mutations: the connector is read-only", async () => {
    expect(
      isWriteDocument(
        "mutation X { timeSheetEntryCreate(input: {}) { userErrors { message } } }",
      ),
    ).toBe(true);
    expect(
      isWriteDocument(
        'query Q { users(searchTerm: "mutation") { totalCount } }',
      ),
    ).toBe(false);
    expect(isWriteDocument(USERS_COUNT_QUERY)).toBe(false);
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "x",
      tokenStore: memoryTokenStore(null),
      fetchImpl: (async () => ok({})) as unknown as typeof fetch,
    });
    await expect(c.query("mutation { x }")).rejects.toThrow(/read-only/);
  });

  it("fails clearly with no stored token", async () => {
    const c = new JobberClient({
      clientId: "cid",
      clientSecret: "x",
      tokenStore: memoryTokenStore(null),
      fetchImpl: (async () => ok({})) as unknown as typeof fetch,
    });
    await expect(c.query(USERS_COUNT_QUERY)).rejects.toThrow(/auth/);
  });

  // POSIX file modes do not exist on Windows
  it.skipIf(process.platform === "win32")(
    "file token store writes 0600 and round-trips",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "pp-jobber-"));
      const store = fileTokenStore(join(dir, "nested", "t.json"));
      expect(await store.load()).toBeNull();
      await store.save({
        accessToken: "a",
        accessTokenExpiresAt: 1,
        refreshToken: "r",
      });
      expect(
        JSON.parse(await readFile(join(dir, "nested", "t.json"), "utf8"))
          .refreshToken,
      ).toBe("r");
      expect((await stat(join(dir, "nested", "t.json"))).mode & 0o777).toBe(
        0o600,
      );
    },
  );
});
