// Gusto read connector (A owns; B owns gusto/write*). Plain async functions, GET only, no Convex import.
// Each pull returns records plus one SyncRun (source "gusto").

import type { SyncRun, Worker } from "../types.ts";
import { type GustoAuth, GustoClient, GUSTO_API_VERSION } from "./client.ts";
import {
  type GustoPayroll, normalizeContractor, normalizeEmployee, normalizePayroll,
  type RawCompensation, type RawContractor, type RawEmployee, type RawPayroll,
} from "./normalize.ts";

export { GustoClient, gustoAuthFromEnv, type GustoAuth } from "./client.ts";
export type { GustoPayroll } from "./normalize.ts";

export interface GustoPullOptions {
  client?: GustoClient;
  cycleId?: string | null;
  now?: () => Date;
}

type Pulled<R> = { records: R; syncRun: SyncRun };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function withRun<R>(
  auth: GustoAuth, companyId: string, object: string, method: string, opts: GustoPullOptions, empty: R,
  body: (c: GustoClient) => Promise<{ records: R; pulled: number; expected: number | null; problems: string[] }>,
): Promise<Pulled<R>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const base = { id: `${companyId}:gusto:${object}:${startedAt}`, companyId, cycleId: opts.cycleId ?? null, source: "gusto" as const, object, startedAt, method: `gusto ${GUSTO_API_VERSION} ${method}` };
  try {
    const r = await body(opts.client ?? new GustoClient(auth));
    const complete = r.problems.length === 0;
    return { records: r.records, syncRun: { ...base, finishedAt: now().toISOString(), pulled: r.pulled, expected: r.expected, complete, error: complete ? null : r.problems.join("; ") } };
  } catch (e) {
    return { records: empty, syncRun: { ...base, finishedAt: now().toISOString(), pulled: 0, expected: null, complete: false, error: errMsg(e) } };
  }
}

/** Pagination ended is the completeness signal; X-Total-Count, when present, must match too. */
function countProblems(object: string, pulled: number, totalCount: number | null): string[] {
  return totalCount !== null && totalCount !== pulled ? [`${object}: pulled ${pulled}, X-Total-Count ${totalCount}`] : [];
}

/** The company uuid the token is for (GET /v1/token_info). */
export async function companyUuidForToken(client: GustoClient): Promise<string> {
  const { body } = await client.get<{ resource?: { type?: string; uuid?: string } }>("/v1/token_info");
  if (body.resource?.type !== "Company" || !body.resource.uuid) throw new Error("Gusto token is not a company token");
  return body.resource.uuid;
}

/** Employees, active and terminated, with compensations (rate, payment_unit, flsa_status). */
export function pullEmployees(auth: GustoAuth, companyId: string, companyUuid: string, opts: GustoPullOptions = {}): Promise<Pulled<{ workers: Worker[] }>> {
  const path = `/v1/companies/${encodeURIComponent(companyUuid)}/employees`;
  return withRun(auth, companyId, "employees", `GET ${path}?include=all_compensations&terminated=false|true`, opts, { workers: [] }, async (c) => {
    const rows = new Map<string, RawEmployee>();
    let expected: number | null = 0;
    const problems: string[] = [];
    for (const terminated of ["false", "true"]) {
      const page = await c.getAll<RawEmployee>(path, { include: "all_compensations", terminated });
      for (const e of page.rows) rows.set(e.uuid, e);
      problems.push(...countProblems(`employees(terminated=${terminated})`, page.rows.length, page.totalCount));
      expected = page.totalCount === null || expected === null ? null : expected + page.totalCount;
    }
    // A job listed without its compensations: fetch them (GET /v1/jobs/{uuid}/compensations) rather than guess.
    for (const e of rows.values()) {
      for (const job of e.jobs ?? []) {
        if (!job.compensations) job.compensations = (await c.get<RawCompensation[]>(`/v1/jobs/${encodeURIComponent(job.uuid)}/compensations`)).body;
      }
    }
    return { records: { workers: [...rows.values()].map((e) => normalizeEmployee(e, companyId)) }, pulled: rows.size, expected, problems };
  });
}

export function pullContractors(auth: GustoAuth, companyId: string, companyUuid: string, opts: GustoPullOptions = {}): Promise<Pulled<{ workers: Worker[] }>> {
  const path = `/v1/companies/${encodeURIComponent(companyUuid)}/contractors`;
  return withRun(auth, companyId, "contractors", `GET ${path}`, opts, { workers: [] }, async (c) => {
    const page = await c.getAll<RawContractor>(path);
    return { records: { workers: page.rows.map((r) => normalizeContractor(r, companyId)) }, pulled: page.rows.length, expected: page.totalCount, problems: countProblems("contractors", page.rows.length, page.totalCount) };
  });
}

/** Processed regular and off-cycle payrolls whose pay period falls in [startDate, endDate], each fetched in detail. */
export function pullPayrolls(auth: GustoAuth, companyId: string, companyUuid: string, startDate: string, endDate: string, opts: GustoPullOptions = {}): Promise<Pulled<{ payrolls: GustoPayroll[] }>> {
  const path = `/v1/companies/${encodeURIComponent(companyUuid)}/payrolls`;
  const query = { processing_statuses: "processed", payroll_types: "regular,off_cycle", start_date: startDate, end_date: endDate };
  return withRun(auth, companyId, "payrolls_processed", `GET ${path}?processing_statuses=processed&start_date=${startDate}&end_date=${endDate} + GET each`, opts, { payrolls: [] }, async (c) => {
    const list = await c.getAll<RawPayroll>(path, query);
    const payrolls: GustoPayroll[] = [];
    const problems = countProblems("payrolls", list.rows.length, list.totalCount);
    for (const p of list.rows) {
      const uuid = p.payroll_uuid ?? p.uuid;
      const detail = (await c.get<RawPayroll>(`${path}/${encodeURIComponent(String(uuid))}`)).body;
      if (!detail.employee_compensations) problems.push(`payroll ${uuid}: no employee_compensations in detail`);
      payrolls.push(normalizePayroll(detail, companyId));
    }
    return { records: { payrolls }, pulled: payrolls.length, expected: list.rows.length, problems };
  });
}

/** Unprocessed payrolls (B's draft writer picks the one covering the cycle). List only, never prepared here. */
export function pullUnprocessed(auth: GustoAuth, companyId: string, companyUuid: string, opts: GustoPullOptions = {}): Promise<Pulled<{ payrolls: GustoPayroll[] }>> {
  const path = `/v1/companies/${encodeURIComponent(companyUuid)}/payrolls`;
  return withRun(auth, companyId, "payrolls_unprocessed", `GET ${path}?processing_statuses=unprocessed&payroll_types=regular,off_cycle`, opts, { payrolls: [] }, async (c) => {
    const list = await c.getAll<RawPayroll>(path, { processing_statuses: "unprocessed", payroll_types: "regular,off_cycle" });
    const payrolls = list.rows.map((p) => ({ ...normalizePayroll(p, companyId), employees: null }));
    return { records: { payrolls }, pulled: payrolls.length, expected: list.totalCount, problems: countProblems("payrolls", payrolls.length, list.totalCount) };
  });
}
