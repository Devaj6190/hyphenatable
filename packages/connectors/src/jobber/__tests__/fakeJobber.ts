// In-memory Jobber: serves the recorded fixtures by operation name. No network.
import { JOBBER_GRAPHQL_URL, JOBBER_TOKEN_URL, type StoredTokens, type TokenStore } from "../client.ts";
import entriesFixture from "../__fixtures__/timeSheetEntries.json";
import objectsFixture from "../__fixtures__/objects.json";
import usersFixture from "../__fixtures__/users.json";

export type Fixtures = { users: typeof usersFixture; entries: typeof entriesFixture; objects: typeof objectsFixture };

export const fixtures = (): Fixtures => structuredClone({ users: usersFixture, entries: entriesFixture, objects: objectsFixture });

export function memoryTokenStore(initial: StoredTokens | null): TokenStore & { saved: StoredTokens[] } {
  let current = initial;
  const saved: StoredTokens[] = [];
  return {
    saved,
    async load() {
      return current;
    },
    async save(t) {
      current = t;
      saved.push(t);
    },
  };
}

export interface FakeCalls {
  graphql: { operation: string; variables: Record<string, unknown>; auth: string | null; version: string | null }[];
  token: URLSearchParams[];
}

export function fakeJobberFetch(fx: Fixtures, opts: { rotate?: boolean } = {}): { fetch: typeof fetch; calls: FakeCalls } {
  const calls: FakeCalls = { graphql: [], token: [] };
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const impl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if (u === JOBBER_TOKEN_URL) {
      const form = new URLSearchParams(String(init?.body));
      calls.token.push(form);
      n++;
      return json({ access_token: `fake-access-${n}`, refresh_token: opts.rotate === false ? undefined : `fake-refresh-${n}`, token_type: "Bearer", expires_in: 3600 });
    }
    if (u !== JOBBER_GRAPHQL_URL) return json({ error: "unknown url" }, 404);
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const operation = /query\s+(\w+)/.exec(body.query)?.[1] ?? "anonymous";
    const v = body.variables;
    calls.graphql.push({ operation, variables: v, auth: headers.get("authorization"), version: headers.get("x-jobber-graphql-version") });
    switch (operation) {
      case "PayrollPilotUsers":
        return json(fx.users[v.status as "ACTIVATED" | "DEACTIVATED"]);
      case "PayrollPilotUsersCount":
        return json(fx.users.COUNT);
      case "PayrollPilotTimeSheetEntries": {
        const page = (fx.entries.pages as Record<string, unknown>)[String(v.after ?? null)];
        return page ? json(page) : json({ errors: [{ message: "bad cursor" }] });
      }
      case "PayrollPilotUserTimeSheetsByDay": {
        const days = (fx.entries.byDay as Record<string, unknown[]>)[String(v.userId)] ?? [];
        return json({
          data: { user: { id: v.userId, timeSheetsByDay: { totalCount: days.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes: days } } },
          extensions: { cost: { throttleStatus: { maximumAvailable: 10000, currentlyAvailable: 9800, restoreRate: 500 } } },
        });
      }
      case "PayrollPilot_visits":
      case "PayrollPilot_quotes":
      case "PayrollPilot_invoices":
      case "PayrollPilot_paymentRecords":
      case "PayrollPilot_expenses":
      case "PayrollPilot_jobs": {
        const object = operation.slice("PayrollPilot_".length) as "visits" | "jobs";
        let nodes = fx.objects[object] as { id: string }[];
        if (object === "jobs") nodes = nodes.filter((n) => (v.ids as string[]).includes(n.id));
        const totalCount = (fx.objects.totalCounts as Record<string, number>)[object] ?? nodes.length;
        return json({ data: { [object]: { totalCount, pageInfo: { hasNextPage: false, endCursor: null }, nodes } } });
      }
      case "PayrollPilot_expenseStatus": {
        const nodes = (fx.objects.expenseStatus as Record<string, { id: string }[]>)[String(v.status)];
        if (!nodes) return json({ errors: [{ message: "status unavailable" }] });
        return json({ data: { expenses: { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes } } });
      }
      default:
        return json({ errors: [{ message: `unexpected operation ${operation}` }] });
    }
  };
  return { fetch: impl as typeof fetch, calls };
}
