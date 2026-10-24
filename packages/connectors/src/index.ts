// One entry point for B's Convex "use node" sync actions: pullSource(source, ctx).
// No Convex import. Tokens go through a TokenStore the caller provides (Convex table / env instead of
// data/private files). Credentials are passed in, never read here. Read-only on every source.
// See README.md for SyncRun semantics, id conventions and live quirks.

import {
  companyUuidForToken,
  GustoClient,
  type GustoPayroll,
  pullContractors,
  pullEmployees,
  pullPayrolls,
  pullUnprocessed,
} from "./gusto/read.ts";
import { JobberClient } from "./jobber/client.ts";
import { pullCycle } from "./jobber/index.ts";
import { QboClient } from "./qbo/client.ts";
import { pullExpenses } from "./qbo/index.ts";
import type { StoredTokens, TokenStore } from "./tokens.ts";
import type {
  Expense,
  Invoice,
  Job,
  Payment,
  Quote,
  SyncRun,
  TimeEntry,
  Visit,
  Worker,
} from "./types.ts";

export type { GustoPayroll } from "./gusto/read.ts";
export type { StoredTokens, TokenStore } from "./tokens.ts";
export { fileTokenStore } from "./tokens.ts";
export type * from "./types.ts";

export type SourceName = "jobber" | "qbo" | "gusto";

/** SyncRun.object names per source; pass a subset in `objects` to run one action per object type. */
export const SOURCE_OBJECTS = {
  jobber: [
    "users",
    "timeSheetEntries",
    "visits",
    "quotes",
    "invoices",
    "paymentRecords",
    "expenses",
    "jobs",
  ],
  qbo: ["Purchase", "Bill"],
  gusto: [
    "employees",
    "contractors",
    "payrolls_processed",
    "payrolls_unprocessed",
  ],
} as const;

export interface PullContext {
  companyId: string;
  /** Convex cycle id, stamped on SyncRuns (and Jobber time entries); null when not a cycle pull */
  cycleId?: string | null;
  /** inclusive YYYY-MM-DD. Jobber: the pay period in `timezone`; QBO: TxnDate; Gusto: processed-payroll range */
  from: string;
  to: string;
  /** IANA timezone of the company (Jobber periods). Default UTC. */
  timezone?: string;
  /** OAuth app credentials (Convex env: JOBBER_CLIENT_ID/SECRET, QBO_CLIENT_ID/SECRET, GUSTO_CLIENT_ID/SECRET) */
  credentials: { clientId: string; clientSecret: string };
  /** QBO only: QBO_REALM_ID */
  realmId?: string;
  /** Gusto only: the demo company uuid; looked up from the token when absent */
  gustoCompanyUuid?: string;
  /** Where this source's rotating refresh token lives. Save it before using it (the connectors do). */
  tokenStore: TokenStore;
  /** subset of SOURCE_OBJECTS[source]; default all */
  objects?: string[];
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface SourceRecords {
  workers?: Worker[];
  timeEntries?: TimeEntry[];
  jobs?: Job[];
  visits?: Visit[];
  quotes?: Quote[];
  invoices?: Invoice[];
  payments?: Payment[];
  expenses?: Expense[];
  payrolls?: GustoPayroll[];
}

export interface PullOutcome {
  source: SourceName;
  records: SourceRecords;
  /** one per object pulled; a source failure is an incomplete SyncRun, never a throw */
  syncRuns: SyncRun[];
}

/** which record list each SyncRun object fills */
const RECORDS_OF: Record<string, keyof SourceRecords> = {
  users: "workers",
  timeSheetEntries: "timeEntries",
  visits: "visits",
  quotes: "quotes",
  invoices: "invoices",
  paymentRecords: "payments",
  expenses: "expenses",
  jobs: "jobs",
  Purchase: "expenses",
  Bill: "expenses",
  employees: "workers",
  contractors: "workers",
  payrolls_processed: "payrolls",
  payrolls_unprocessed: "payrolls",
};

function selected(
  source: SourceName,
  objects: string[] | undefined,
): Set<string> {
  const all: readonly string[] = SOURCE_OBJECTS[source];
  const want = objects ?? [...all];
  const unknown = want.filter((o) => !all.includes(o));
  if (unknown.length)
    throw new Error(
      `unknown ${source} object(s): ${unknown.join(", ")} (expected ${all.join(", ")})`,
    );
  return new Set(want);
}

const keepRuns = (runs: SyncRun[], want: Set<string>) =>
  runs.filter((r) => want.has(r.object));

/** Pull one source (optionally only some of its objects). Read-only. Plain async; no Convex import. */
export async function pullSource(
  source: SourceName,
  ctx: PullContext,
): Promise<PullOutcome> {
  const want = selected(source, ctx.objects);
  const common = {
    tokenStore: ctx.tokenStore,
    fetchImpl: ctx.fetchImpl,
    sleepImpl: ctx.sleepImpl,
    log: ctx.log,
  };

  if (source === "jobber") {
    const auth = { ...ctx.credentials, ...common };
    // time-entry completeness needs the users pull, so users always run; the other objects only when asked
    const needObjects = [...want].some(
      (o) => !["users", "timeSheetEntries"].includes(o),
    );
    const r = await pullCycle(auth, ctx.companyId, ctx.from, ctx.to, {
      client: new JobberClient(auth),
      cycleId: ctx.cycleId ?? null,
      timezone: ctx.timezone ?? "UTC",
      now: ctx.now,
      objects: needObjects,
    });
    const records: SourceRecords = {};
    for (const o of want) {
      const key = RECORDS_OF[o] as keyof SourceRecords;
      (records as Record<string, unknown>)[key] = (
        r.records as unknown as Record<string, unknown[]>
      )[key];
    }
    return { source, records, syncRuns: keepRuns(r.syncRuns, want) };
  }

  if (source === "qbo") {
    if (!ctx.realmId) throw new Error("qbo needs realmId (QBO_REALM_ID)");
    const auth = { ...ctx.credentials, realmId: ctx.realmId, ...common };
    const r = await pullExpenses(auth, ctx.companyId, ctx.from, ctx.to, {
      client: new QboClient(auth),
      cycleId: ctx.cycleId ?? null,
      now: ctx.now,
    });
    const expenses = r.records.expenses.filter((x) =>
      want.has(x.id.split(":")[1] ?? ""),
    );
    return {
      source,
      records: { expenses },
      syncRuns: keepRuns(r.syncRuns, want),
    };
  }

  const auth = { ...ctx.credentials, ...common };
  const client = new GustoClient(auth);
  const opts = { client, cycleId: ctx.cycleId ?? null, now: ctx.now };
  let uuid = ctx.gustoCompanyUuid;
  if (!uuid) {
    try {
      uuid = await companyUuidForToken(client);
    } catch (e) {
      // no company -> nothing can be pulled: every asked object is an incomplete run
      const at = (ctx.now ?? (() => new Date()))().toISOString();
      const error = e instanceof Error ? e.message : String(e);
      return {
        source,
        records: {},
        syncRuns: [...want].map((object) => ({
          id: `${ctx.companyId}:gusto:${object}:${at}`,
          companyId: ctx.companyId,
          cycleId: ctx.cycleId ?? null,
          source: "gusto",
          object,
          startedAt: at,
          finishedAt: at,
          pulled: 0,
          expected: null,
          complete: false,
          method: "gusto token_info",
          error,
        })),
      };
    }
  }
  const workers: Worker[] = [];
  const payrolls: GustoPayroll[] = [];
  const syncRuns: SyncRun[] = [];
  if (want.has("employees")) {
    const r = await pullEmployees(auth, ctx.companyId, uuid, opts);
    workers.push(...r.records.workers);
    syncRuns.push(r.syncRun);
  }
  if (want.has("contractors")) {
    const r = await pullContractors(auth, ctx.companyId, uuid, opts);
    workers.push(...r.records.workers);
    syncRuns.push(r.syncRun);
  }
  if (want.has("payrolls_processed")) {
    const r = await pullPayrolls(
      auth,
      ctx.companyId,
      uuid,
      ctx.from,
      ctx.to,
      opts,
    );
    payrolls.push(...r.records.payrolls);
    syncRuns.push(r.syncRun);
  }
  if (want.has("payrolls_unprocessed")) {
    const r = await pullUnprocessed(auth, ctx.companyId, uuid, opts);
    payrolls.push(...r.records.payrolls);
    syncRuns.push(r.syncRun);
  }
  const records: SourceRecords = {};
  if (want.has("employees") || want.has("contractors"))
    records.workers = workers;
  if (want.has("payrolls_processed") || want.has("payrolls_unprocessed"))
    records.payrolls = payrolls;
  return { source, records, syncRuns };
}

/** A TokenStore over any async get/set (e.g. a Convex table row via runQuery/runMutation). */
export function callbackTokenStore(
  get: () => Promise<StoredTokens | null>,
  set: (t: StoredTokens) => Promise<void>,
): TokenStore {
  return { load: get, save: set };
}
