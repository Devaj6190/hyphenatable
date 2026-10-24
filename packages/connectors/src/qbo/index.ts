// QuickBooks read connector: Purchases and Bills for a date range, count(*) completeness.
// Plain async functions; no Convex import.

import type { Expense, SyncRun } from "../types.ts";
import { QBO_MINOR_VERSION, type QboAuth, QboClient } from "./client.ts";
import {
  normalizeBill,
  normalizePurchase,
  type RawBill,
  type RawPurchase,
} from "./normalize.ts";

export { type QboAuth, QboClient, qboAuthFromEnv } from "./client.ts";

/** QBO's maximum page size. */
export const QBO_PAGE = 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const rangeWhere = (from: string, to: string) =>
  `WHERE TxnDate >= '${from}' AND TxnDate <= '${to}'`;
export const selectQuery = (
  entity: string,
  from: string,
  to: string,
  start: number,
  max: number,
) =>
  `SELECT * FROM ${entity} ${rangeWhere(from, to)} STARTPOSITION ${start} MAXRESULTS ${max}`;
export const countQuery = (entity: string, from: string, to: string) =>
  `SELECT count(*) FROM ${entity} ${rangeWhere(from, to)}`;

export interface QboPullOptions {
  cycleId?: string | null;
  client?: QboClient;
  now?: () => Date;
  /** test hook; QBO max is 1000 */
  pageSize?: number;
}

/** Pull Purchases and Bills with TxnDate in [from, to] (inclusive dates). One SyncRun per entity. */
export async function pullExpenses(
  auth: QboAuth,
  companyId: string,
  from: string,
  to: string,
  opts: QboPullOptions = {},
): Promise<{ records: { expenses: Expense[] }; syncRuns: SyncRun[] }> {
  if (!DATE.test(from) || !DATE.test(to))
    throw new Error(`QBO range must be YYYY-MM-DD dates: ${from} .. ${to}`);
  const client = opts.client ?? new QboClient(auth);
  const now = opts.now ?? (() => new Date());
  const pageSize = opts.pageSize ?? QBO_PAGE;
  const expenses: Expense[] = [];
  const syncRuns: SyncRun[] = [];

  const entities = [
    {
      entity: "Purchase",
      norm: (r: unknown) => normalizePurchase(r as RawPurchase, companyId),
    },
    {
      entity: "Bill",
      norm: (r: unknown) => normalizeBill(r as RawBill, companyId),
    },
  ];
  for (const { entity, norm } of entities) {
    const startedAt = now().toISOString();
    const base = {
      id: `${companyId}:qbo:${entity}:${startedAt}`,
      companyId,
      cycleId: opts.cycleId ?? null,
      source: "qbo" as const,
      object: entity,
      startedAt,
      method: `qbo-v3 query minorversion=${QBO_MINOR_VERSION} ${rangeWhere(from, to)} + count(*)`,
    };
    const rows: { Id: string }[] = [];
    try {
      for (let start = 1; ; start += pageSize) {
        const page = ((
          await client.query(selectQuery(entity, from, to, start, pageSize))
        ).QueryResponse[entity] ?? []) as { Id: string }[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      const expected = (await client.query(countQuery(entity, from, to)))
        .QueryResponse.totalCount;
      if (typeof expected !== "number")
        throw new Error(`count(*) on ${entity} returned no totalCount`);
      const unique = new Set(rows.map((r) => r.Id)).size;
      const problems: string[] = [];
      if (rows.length !== expected)
        problems.push(
          `${entity}: pulled ${rows.length}, count(*) ${expected} (diff ${rows.length - expected > 0 ? "+" : ""}${rows.length - expected})`,
        );
      if (unique !== rows.length)
        problems.push(
          `${entity}: ${rows.length - unique} duplicate ids across pages`,
        );
      const normalized = rows.flatMap(norm); // all or nothing per entity
      expenses.push(...normalized);
      syncRuns.push({
        ...base,
        finishedAt: now().toISOString(),
        pulled: rows.length,
        expected,
        complete: problems.length === 0,
        error: problems.join("; ") || null,
      });
    } catch (e) {
      syncRuns.push({
        ...base,
        finishedAt: now().toISOString(),
        pulled: rows.length,
        expected: null,
        complete: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { records: { expenses }, syncRuns };
}
