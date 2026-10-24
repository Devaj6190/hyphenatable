// `--compare data/fixtures/<company>`: what a live pull returned vs what the seed fixtures say should be
// there. A pulled record is ours when its seed marker (payrollpilot:<ourId>, carried in QBO sourceIds)
// or the pusher's id map in data/private/<company>-<source>-map.json resolves it to a fixture id.
// Output is counts only per object: fixture (in scope), pulled, matched, missing, extra. No names.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobberRecords } from "./jobber/index.ts";
import { JOBBER_INVOICE_ADJUSTMENT } from "./jobber/objects.ts";
import type { Period } from "./time.ts";
import { privatePath } from "./tokens.ts";
import type { Expense, Worker } from "./types.ts";

type Rec = Record<string, unknown> & { id: string };
export type Fixtures = Partial<
  Record<
    | "workers"
    | "timeEntries"
    | "jobs"
    | "visits"
    | "quotes"
    | "invoices"
    | "payments"
    | "expenses",
    Rec[]
  >
>;

export interface CompareRow {
  object: string;
  /** fixture records in scope for this pull */
  fixture: number;
  pulled: number;
  matched: number;
  /** in scope in the fixtures, not pulled */
  missing: number;
  /** pulled but not resolvable to an in-scope fixture record */
  extra: number;
  /** the source cannot hold this object (pusher skipped it): its gaps are expected, never a failure */
  fixtureOnly?: boolean;
  /** short explanation printed after the row (counts and reasons only) */
  note?: string;
}

export async function loadFixtures(dir: string): Promise<Fixtures> {
  const fx: Fixtures = {};
  for (const k of [
    "workers",
    "timeEntries",
    "jobs",
    "visits",
    "quotes",
    "invoices",
    "payments",
    "expenses",
  ] as const) {
    try {
      fx[k] = JSON.parse(
        await readFile(join(dir, `${k}.json`), "utf8"),
      ) as Rec[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return fx;
}

/** The pusher's id map (ourId -> upstream id per object), or {} when none exists yet. */
export async function loadIdMap(
  company: string,
  source: "jobber" | "qbo" | "gusto",
  path = privatePath(`${company}-${source}-map.json`),
): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

const MARKER = /^(?:payrollpilot:)?([a-z]+-[a-z]+-?\d+)(?:#.*)?$/;

/** Count matches. `resolved` is the fixture id each pulled record maps to (null = not ours). */
export function compareIds(
  object: string,
  inScope: string[],
  resolved: (string | null)[],
): CompareRow {
  const scope = new Set(inScope);
  const hit = new Set<string>();
  let extra = 0;
  for (const id of resolved) {
    // not ours, out of scope, or a second upstream record claiming the same fixture id: extra
    if (id && scope.has(id) && !hit.has(id)) hit.add(id);
    else extra++;
  }
  return {
    object,
    fixture: scope.size,
    pulled: resolved.length,
    matched: hit.size,
    missing: scope.size - hit.size,
    extra,
  };
}

const reverse = (m: unknown): Map<string, string> =>
  new Map(
    Object.entries((m ?? {}) as Record<string, string>).map(([ours, up]) => [
      String(up),
      ours,
    ]),
  );
const inDates = (v: unknown, p: Period) =>
  typeof v === "string" &&
  v.slice(0, 10) >= p.startDate &&
  v.slice(0, 10) <= p.endDate;
const inInstants = (v: unknown, p: Period) =>
  typeof v === "string" && v >= p.startUtc && v < p.endUtc;

/** Jobber pull vs fixtures, through data/private/<company>-jobber-map.json. Ids in the map are bare Jobber EncodedIds. */
/**
 * Payments: through the map's `payments` bucket when the pusher recorded one; otherwise by content, since
 * Jobber can create payment records the pusher never saw (seen live: 4 OtherPaymentRecords on seeded
 * invoices, no `payments` bucket): same parent invoice/quote (via the map), same amount, entry date within
 * a day. Each fixture payment is claimed once.
 */
export function resolvePayments(
  pulled: JobberRecords["payments"],
  inScope: Rec[],
  map: Record<string, unknown>,
): (string | null)[] {
  const byId = reverse(map.payments);
  const inv = reverse(map.invoices);
  const quo = reverse(map.quotes);
  const claimed = new Set<string>();
  const strip = (r: string | null) => (r ? r.replace(/^jobber:/, "") : null);
  return pulled.map((p) => {
    const mapped = byId.get(p.sourceId);
    if (mapped) return mapped;
    // Jobber's own invoice records equal the invoice total; never let one stand in for a seed payment
    if (p.paymentType === JOBBER_INVOICE_ADJUSTMENT) return null;
    const invoiceId = inv.get(strip(p.invoiceId) ?? "") ?? null;
    const quoteId = quo.get(strip(p.quoteId) ?? "") ?? null;
    const day = Date.parse(p.entryDate.slice(0, 10));
    const hit = inScope.find(
      (f) =>
        !claimed.has(f.id) &&
        f.amountCents === p.amountCents &&
        ((invoiceId !== null && f.invoiceId === invoiceId) ||
          (quoteId !== null && f.quoteId === quoteId)) &&
        typeof f.entryDate === "string" &&
        Math.abs(Date.parse(f.entryDate.slice(0, 10)) - day) <= 86_400_000,
    );
    if (!hit) return null;
    claimed.add(hit.id);
    return hit.id;
  });
}

export function compareJobber(
  pulled: JobberRecords,
  fx: Fixtures,
  map: Record<string, unknown>,
  period: Period,
): CompareRow[] {
  const rev = (k: string) => reverse(map[k]);
  const ours = (k: string, ids: string[]) => {
    const r = rev(k);
    return ids.map((id) => r.get(id) ?? null);
  };
  const entries = (fx.timeEntries ?? []).filter((e) =>
    inInstants(e.startAt, period),
  );
  const visits = (fx.visits ?? []).filter((v) => inInstants(v.startAt, period));
  const invoices = (fx.invoices ?? []).filter((i) =>
    inDates(i.issuedDate, period),
  );
  const payments = (fx.payments ?? []).filter((x) =>
    inDates(x.entryDate, period),
  );
  const expenses = (fx.expenses ?? []).filter(
    (x) => x.source === "jobber" && inDates(x.date, period),
  );
  // jobs in scope = every job an in-window entry, visit, invoice or expense points at (the connector fetches
  // jobs by reference). Quotes do not widen it: a quote "sent" in the window can belong to a future job.
  const jobIds = new Set<string>();
  // Entries the source cannot hold (fixture-only) pull no job in: the connector only follows real records.
  const fixtureOnly = fixtureOnlyRows(map);
  const entryRefs = fixtureOnly.has("timeSheetEntries") ? [] : entries;
  for (const r of [...entryRefs, ...visits, ...invoices])
    if (typeof r.jobId === "string") jobIds.add(r.jobId);
  for (const x of expenses)
    if (typeof x.matchedJobId === "string") jobIds.add(x.matchedJobId);
  // quotes in scope = the quotes of in-scope jobs (converted quotes are often never sent, so sentAt is no filter)
  const quotes = (fx.quotes ?? []).filter(
    (q) => typeof q.jobId === "string" && jobIds.has(q.jobId),
  );
  const workers = (fx.workers ?? []).filter(
    (w) => w.jobber !== null && w.jobber !== undefined,
  );
  const src = (xs: { sourceId: string }[]) => xs.map((x) => x.sourceId);
  const rows: CompareRow[] = [
    compareIds(
      "users",
      workers.map((w) => w.id),
      ours(
        "users",
        pulled.workers.map((w) => w.jobber?.userId ?? ""),
      ),
    ),
    compareIds(
      "timeSheetEntries",
      entries.map((e) => e.id),
      ours("entries", src(pulled.timeEntries)),
    ),
    compareIds(
      "visits",
      visits.map((v) => v.id),
      ours("visits", src(pulled.visits)),
    ),
    compareIds(
      "quotes",
      quotes.map((q) => q.id),
      ours("quotes", src(pulled.quotes)),
    ),
    compareIds(
      "invoices",
      invoices.map((i) => i.id),
      ours("invoices", src(pulled.invoices)),
    ),
    compareIds(
      "paymentRecords",
      payments.map((x) => x.id),
      resolvePayments(pulled.payments, payments, map),
    ),
    compareIds(
      "expenses",
      expenses.map((x) => x.id),
      ours("expenses", src(pulled.expenses)),
    ),
    compareIds("jobs", [...jobIds], ours("jobs", src(pulled.jobs))),
  ];
  const adjustments = pulled.payments.filter(
    (p) => p.paymentType === JOBBER_INVOICE_ADJUSTMENT,
  ).length;
  for (const r of rows) {
    const why = fixtureOnly.get(r.object);
    if (why) {
      r.fixtureOnly = true;
      r.note = why;
    }
    if (r.object === "paymentRecords" && adjustments) {
      r.note = `${r.note ? `${r.note}; ` : ""}${adjustments} pulled are Jobber invoice adjustments (kind unknown), not customer payments`;
    }
  }
  return rows;
}

/** QBO pull vs fixtures: the seed marker in sourceId first, else the qbo map (purchases / bills). */
export function compareQbo(
  expenses: Expense[],
  fx: Fixtures,
  map: Record<string, unknown>,
  from: string,
  to: string,
): CompareRow[] {
  const rev = new Map([...reverse(map.purchases), ...reverse(map.bills)]);
  const resolved = expenses.map(
    (x) =>
      MARKER.exec(x.sourceId)?.[1] ?? rev.get(x.id.split(":")[2] ?? "") ?? null,
  );
  // one id per QBO record: split lines of one purchase count once
  const perRecord = new Map<string, string | null>();
  for (const [i, x] of expenses.entries()) {
    perRecord.set(x.id.split(":").slice(0, 3).join(":"), resolved[i] ?? null);
  }
  const scope = (fx.expenses ?? []).filter(
    (x) =>
      x.source === "qbo" &&
      typeof x.date === "string" &&
      x.date >= from &&
      x.date <= to,
  );
  return [
    compareIds(
      "expenses(qbo)",
      scope.map((x) => x.id),
      [...perRecord.values()],
    ),
  ];
}

/** Gusto employees vs fixtures, through data/private/<company>-gusto-map.json (workers[ourId].employeeUuid). */
export function compareGustoEmployees(
  workers: Worker[],
  fx: Fixtures,
  map: Record<string, unknown>,
): CompareRow[] {
  const byUuid = new Map(
    Object.entries(
      (map.workers ?? {}) as Record<string, { employeeUuid: string }>,
    ).map(([ours, v]) => [v.employeeUuid, ours]),
  );
  const scope = (fx.workers ?? []).filter(
    (w) => (w.gusto as { employeeUuid?: string | null } | null)?.employeeUuid,
  );
  return [
    compareIds(
      "employees",
      scope.map((w) => w.id),
      workers.map((w) => byUuid.get(w.gusto?.employeeUuid ?? "") ?? null),
    ),
  ];
}

export function formatCompare(rows: CompareRow[]): string {
  const head = `${"compare".padEnd(18)}${"fixture".padStart(8)}${"pulled".padStart(8)}${"matched".padStart(9)}${"missing".padStart(9)}${"extra".padStart(7)}  status`;
  return [
    head,
    ...rows.map((r) => {
      const status = r.fixtureOnly
        ? "expected: fixture-only by design"
        : r.missing || r.extra
          ? "MISMATCH"
          : "ok";
      return `${r.object.padEnd(18)}${String(r.fixture).padStart(8)}${String(r.pulled).padStart(8)}${String(r.matched).padStart(9)}${String(r.missing).padStart(9)}${String(r.extra).padStart(7)}  ${status}${r.note ? ` (${r.note})` : ""}`;
    }),
  ].join("\n");
}

/** A compare fails only on rows the source is meant to hold. */
export const compareFailed = (rows: CompareRow[]): boolean =>
  rows.some((r) => !r.fixtureOnly && (r.missing > 0 || r.extra > 0));

/** The pusher's `skipped` record: objects whose create mutation this account / scope does not have. */
const SKIPPED_TO_ROW: Record<string, string> = {
  entries: "timeSheetEntries",
  payments: "paymentRecords",
};
function fixtureOnlyRows(map: Record<string, unknown>): Map<string, string> {
  const objects =
    (
      map.skipped as
        | { objects?: Record<string, { mutations?: string[]; count?: number }> }
        | undefined
    )?.objects ?? {};
  const out = new Map<string, string>();
  for (const [kind, v] of Object.entries(objects)) {
    const row = SKIPPED_TO_ROW[kind] ?? kind;
    out.set(
      row,
      `no ${(v.mutations ?? []).join(" / ") || "create mutation"} for this app; ${v.count ?? "?"} fixture records stay fixture-only`,
    );
  }
  return out;
}
