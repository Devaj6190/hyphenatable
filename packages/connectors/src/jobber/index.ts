// Jobber connector entry point. Plain async functions; no Convex import.
// B's convex/sync/ calls pullCycle from a "use node" action and writes records + syncRuns.

import { resolvePeriod } from "../time.ts";
import type { SyncRun, TimeEntry, Worker } from "../types.ts";
import { type JobberAuth, JobberClient, JOBBER_GRAPHQL_VERSION } from "./client.ts";
import { type CompletenessResult, connectionCompleteness, timeEntryCompleteness } from "./completeness.ts";
import { normalizeTimeSheetEntry, normalizeUser } from "./normalize.ts";
import { type ObjectRecords, pullObjects } from "./objects.ts";
import {
  type Connection,
  paginate,
  type RawTimeSheetEntry,
  type RawTimeSheetUserDay,
  type RawUser,
  TIME_SHEET_ENTRIES_QUERY,
  USER_TIME_SHEETS_BY_DAY_QUERY,
  USERS_COUNT_QUERY,
  USERS_QUERY,
} from "./queries.ts";

export { authFromEnv, fileTokenStore, JobberClient, type JobberAuth, type TokenStore } from "./client.ts";

export interface PullOptions {
  /** Convex cycle id, if known; otherwise null and the caller sets it on insert. */
  cycleId?: string | null;
  /** IANA timezone for date-only periods and timeSheetsByDay (Company.timezone). Default UTC. */
  timezone?: string;
  /** Inject a pre-built client (tests, or a shared client in Convex). */
  client?: JobberClient;
  now?: () => Date;
  /** false = users and time entries only (v1). Default true. */
  objects?: boolean;
}

export interface JobberRecords extends ObjectRecords {
  workers: Worker[];
  timeEntries: TimeEntry[];
}

export interface PullResult {
  records: JobberRecords;
  syncRuns: SyncRun[];
}

const METHOD = `jobber-graphql ${JOBBER_GRAPHQL_VERSION}`;

/** Pull users and time entries for one pay period, with completeness. Never throws for a source failure: the SyncRun says so. */
export async function pullCycle(
  auth: JobberAuth,
  companyId: string,
  periodStart: string,
  periodEnd: string,
  opts: PullOptions = {},
): Promise<PullResult> {
  const client = opts.client ?? new JobberClient(auth);
  const now = opts.now ?? (() => new Date());
  const cycleId = opts.cycleId ?? null;
  const period = resolvePeriod(periodStart, periodEnd, opts.timezone ?? "UTC");
  const syncRuns: SyncRun[] = [];

  const run = (object: string, method: string, startedAt: string, r: CompletenessResult): SyncRun => ({
    id: `${companyId}:jobber:${object}:${startedAt}`,
    companyId,
    cycleId,
    source: "jobber",
    object,
    startedAt,
    finishedAt: now().toISOString(),
    pulled: r.pulled,
    expected: r.expected,
    complete: r.complete,
    method,
    error: r.error,
  });
  const failed = (e: unknown): CompletenessResult => ({
    pulled: 0,
    expected: null,
    complete: false,
    error: e instanceof Error ? e.message : String(e),
  });

  // ---- users (ACTIVATED + DEACTIVATED) ----
  let rawUsers: RawUser[] | null = null;
  {
    const startedAt = now().toISOString();
    const method = `${METHOD} users(status: ACTIVATED|DEACTIVATED) first:50`;
    try {
      type D = { users: Connection<RawUser> };
      const active = await paginate<RawUser, D>(client, USERS_QUERY, { status: "ACTIVATED" }, (d) => d.users);
      const inactive = await paginate<RawUser, D>(client, USERS_QUERY, { status: "DEACTIVATED" }, (d) => d.users);
      const all = await client.query<{ users: { totalCount: number } }>(USERS_COUNT_QUERY);
      rawUsers = [...active.nodes, ...inactive.nodes];
      const a = connectionCompleteness("users(ACTIVATED)", active.nodes.length, active.totalCount, active.totalCountDrift);
      const i = connectionCompleteness("users(DEACTIVATED)", inactive.nodes.length, inactive.totalCount, inactive.totalCountDrift);
      const errors = [a.error, i.error].filter(Boolean);
      const other = all.users.totalCount - (active.totalCount + inactive.totalCount);
      // Users in other statuses (NOT_INVITED, invites) are not pulled; if any of them has hours,
      // the time-entry per-user check marks that run incomplete. Here it is a note only.
      if (other !== 0) errors.push(`note: ${other} users in other statuses (not ACTIVATED/DEACTIVATED) not pulled`);
      syncRuns.push(
        run("users", method, startedAt, {
          pulled: rawUsers.length,
          expected: active.totalCount + inactive.totalCount,
          complete: a.complete && i.complete,
          error: errors.length ? errors.join("; ") : null,
        }),
      );
    } catch (e) {
      syncRuns.push(run("users", method, startedAt, failed(e)));
    }
  }

  // ---- time sheet entries ----
  let rawEntries: RawTimeSheetEntry[] = [];
  {
    const startedAt = now().toISOString();
    const method = `${METHOD} timeSheetEntries(startAt ${period.startUtc}..${period.endUtc}, START_AT ASC) first:50 + User.timeSheetsByDay(${period.startDate}..${period.endDate})`;
    try {
      const entries = await paginate<RawTimeSheetEntry, { timeSheetEntries: Connection<RawTimeSheetEntry> }>(
        client,
        TIME_SHEET_ENTRIES_QUERY,
        { startAfter: period.startUtc, startBefore: period.endUtc },
        (d) => d.timeSheetEntries,
      );
      rawEntries = entries.nodes;
      if (rawUsers === null) throw new Error("timeSheetEntries pulled but users failed, so timeSheetsByDay totals are unavailable");
      const byDay = new Map<string, number>();
      for (const u of rawUsers) {
        type D = { user: { id: string; timeSheetsByDay: Connection<RawTimeSheetUserDay> } | null };
        const days = await paginate<RawTimeSheetUserDay, D>(
          client,
          USER_TIME_SHEETS_BY_DAY_QUERY,
          { userId: u.id, startDate: period.startDate, endDate: period.endDate },
          (d) => d.user?.timeSheetsByDay,
        );
        byDay.set(u.id, days.nodes.reduce((s, n) => s + n.entries.totalCount, 0));
      }
      const result = timeEntryCompleteness({
        entryUserIds: rawEntries.map((e) => e.user?.id ?? null),
        totalCount: entries.totalCount,
        totalCountDrift: entries.totalCountDrift,
        byDayCountPerUser: byDay,
      });
      syncRuns.push(run("timeSheetEntries", method, startedAt, result));
    } catch (e) {
      const r = failed(e);
      syncRuns.push(run("timeSheetEntries", method, startedAt, { ...r, pulled: rawEntries.length }));
    }
  }

  const timeEntries = rawEntries.map((e) => normalizeTimeSheetEntry(e, companyId, cycleId));
  let objects: ObjectRecords = { jobs: [], visits: [], quotes: [], invoices: [], payments: [], expenses: [] };
  if (opts.objects !== false) {
    const entryJobIds = timeEntries.flatMap((e) => (e.jobId ? [e.jobId.slice("jobber:".length)] : []));
    const pulled = await pullObjects(client, companyId, period, entryJobIds, now);
    objects = pulled.records;
    for (const r of pulled.runs) syncRuns.push(run(r.object, `${METHOD} ${r.method.replace(/^jobber-graphql /, "")}`, r.startedAt, r.result));
  }

  return {
    records: { workers: (rawUsers ?? []).map((u) => normalizeUser(u, companyId)), timeEntries, ...objects },
    syncRuns,
  };
}
