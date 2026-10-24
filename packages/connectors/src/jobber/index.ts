// Jobber connector entry point. Plain async functions; no Convex import.
// B's convex/sync/ calls pullCycle from a "use node" action and writes records + syncRuns.

import { resolvePeriod, weekWindows } from "../time.ts";
import type { SyncRun, TimeEntry, Worker } from "../types.ts";
import {
  JOBBER_GRAPHQL_VERSION,
  type JobberAuth,
  JobberClient,
} from "./client.ts";
import {
  type CompletenessResult,
  connectionCompleteness,
  timeEntryCompleteness,
} from "./completeness.ts";
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
  USERS_QUERY,
  USERS_QUERY_NO_RATE,
  visibleFields,
} from "./queries.ts";

export {
  authFromEnv,
  fileTokenStore,
  type JobberAuth,
  JobberClient,
  type TokenStore,
} from "./client.ts";

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

  const run = (
    object: string,
    method: string,
    startedAt: string,
    r: CompletenessResult,
  ): SyncRun => ({
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

  // ---- users: every status (ACTIVATED, NOT_INVITED, invites, DEACTIVATED), unfiltered ----
  // Workers added in Manage Team without a login invite are NOT_INVITED but still log hours.
  let rawUsers: RawUser[] | null = null;
  {
    const startedAt = now().toISOString();
    let method = `${METHOD} users(all statuses) first:50`;
    try {
      type D = { users: Connection<RawUser> };
      const withRate = (await visibleFields(client, "User")).has("labourRate");
      if (!withRate)
        method +=
          "; User.labourRate hidden from this app (scope), labourRateCents null";
      const page = await paginate<RawUser, D>(
        client,
        withRate ? USERS_QUERY : USERS_QUERY_NO_RATE,
        {},
        (d) => d.users,
      );
      const unique = new Map(page.nodes.map((u) => [u.id, u]));
      rawUsers = [...unique.values()];
      const r = connectionCompleteness(
        "users",
        page.nodes.length,
        page.totalCount,
        page.totalCountDrift,
      );
      const dup = page.nodes.length - unique.size;
      syncRuns.push(
        run(
          "users",
          method,
          startedAt,
          dup
            ? {
                ...r,
                complete: false,
                error: [r.error, `users: ${dup} duplicate ids across pages`]
                  .filter(Boolean)
                  .join("; "),
              }
            : r,
        ),
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
      const entries = await paginate<
        RawTimeSheetEntry,
        { timeSheetEntries: Connection<RawTimeSheetEntry> }
      >(
        client,
        TIME_SHEET_ENTRIES_QUERY,
        { startAfter: period.startUtc, startBefore: period.endUtc },
        (d) => d.timeSheetEntries,
      );
      rawEntries = entries.nodes;
      if (rawUsers === null)
        throw new Error(
          "timeSheetEntries pulled but users failed, so timeSheetsByDay totals are unavailable",
        );
      const byDay = new Map<string, number>();
      for (const u of rawUsers) {
        type D = {
          user: {
            id: string;
            timeSheetsByDay: Connection<RawTimeSheetUserDay>;
          } | null;
        };
        let count = 0;
        // Jobber rejects timeSheetsByDay ranges over 7 days (live, 2026-10-24): walk the period in 7-day windows.
        for (const w of weekWindows(period.startDate, period.endDate)) {
          const days = await paginate<RawTimeSheetUserDay, D>(
            client,
            USER_TIME_SHEETS_BY_DAY_QUERY,
            { userId: u.id, startDate: w.start, endDate: w.end },
            (d) => d.user?.timeSheetsByDay,
          );
          count += days.nodes.reduce((s, n) => s + n.entries.totalCount, 0);
        }
        byDay.set(u.id, count);
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
      syncRuns.push(
        run("timeSheetEntries", method, startedAt, {
          ...r,
          pulled: rawEntries.length,
        }),
      );
    }
  }

  const timeEntries = rawEntries.map((e) =>
    normalizeTimeSheetEntry(e, companyId, cycleId),
  );
  let objects: ObjectRecords = {
    jobs: [],
    visits: [],
    quotes: [],
    invoices: [],
    payments: [],
    expenses: [],
  };
  if (opts.objects !== false) {
    const entryJobIds = timeEntries.flatMap((e) =>
      e.jobId ? [e.jobId.slice("jobber:".length)] : [],
    );
    const pulled = await pullObjects(
      client,
      companyId,
      period,
      entryJobIds,
      now,
    );
    objects = pulled.records;
    for (const r of pulled.runs)
      syncRuns.push(
        run(
          r.object,
          `${METHOD} ${r.method.replace(/^jobber-graphql /, "")}`,
          r.startedAt,
          r.result,
        ),
      );
  }

  return {
    records: {
      workers: (rawUsers ?? []).map((u) => normalizeUser(u, companyId)),
      timeEntries,
      ...objects,
    },
    syncRuns,
  };
}
