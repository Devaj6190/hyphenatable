// One section 6 dataset per company and cycle for B's loader: live records (upstream ids, web links)
// merged with fixture-only records (time entries, payments, past payrolls), joined through the pushers' id
// maps so fixture records point at live ids. Every record carries `origin` ("live" | "fixture"), `ourId`
// (the fixture / answer-key id, or null) and `url` (where a person checks it, or null).
// Pure core (assembleDataset) + a read-only CLI that pulls, assembles and writes data/private/assembled/.

import type { Fixtures } from "./compare.ts";
import type { GustoPayroll } from "./gusto/normalize.ts";
import type { JobberRecords } from "./jobber/index.ts";
import { JOBBER_INVOICE_ADJUSTMENT } from "./jobber/objects.ts";
import type { Period } from "./time.ts";
import type { Expense, SyncRun, Worker } from "./types.ts";

type Rec = Record<string, unknown> & { id: string };
export type Origin = "live" | "fixture";
export type Tagged<T> = T & {
  origin: Origin;
  ourId: string | null;
  url: string | null;
};

export interface AssembleInput {
  companyId: string;
  cycle: Rec & { periodStart: string; periodEnd: string };
  period: Period;
  fx: Fixtures & { pastPayrolls?: Rec[] };
  maps: {
    jobber: Record<string, unknown>;
    qbo: Record<string, unknown>;
    gusto: Record<string, unknown>;
  };
  /** absent = that source was not pulled (fixture records stand in, tagged fixture) */
  live: {
    jobber?: JobberRecords;
    qbo?: Expense[];
    gusto?: { workers: Worker[]; payrolls: GustoPayroll[] };
    syncRuns: SyncRun[];
  };
  now?: () => Date;
}

export interface AssembledDataset {
  generatedAt: string;
  companyId: string;
  cycleId: string;
  period: Period;
  sources: Record<"jobber" | "qbo" | "gusto", "live" | "fixture">;
  tables: {
    workers: Tagged<Rec>[];
    timeEntries: Tagged<Rec>[];
    jobs: Tagged<Rec>[];
    visits: Tagged<Rec>[];
    quotes: Tagged<Rec>[];
    invoices: Tagged<Rec>[];
    payments: Tagged<Rec>[];
    expenses: Tagged<Rec>[];
    /** fixture stand-in for history Gusto does not have (not a section 6 table) */
    pastPayrolls: Tagged<Rec>[];
    /** live Gusto payrolls (processed history + unprocessed), workers remapped */
    gustoPayrolls: Tagged<Rec>[];
  };
  syncRuns: SyncRun[];
  /** live records the maps do not know (kept, ourId null) and live records skipped (counted only) */
  unmatched: Record<string, number>;
}

const bucket = (m: Record<string, unknown>, k: string) =>
  (m[k] ?? {}) as Record<string, string>;
const inDates = (v: unknown, p: Period) =>
  typeof v === "string" &&
  v.slice(0, 10) >= p.startDate &&
  v.slice(0, 10) <= p.endDate;
const inInstants = (v: unknown, p: Period) =>
  typeof v === "string" && v >= p.startUtc && v < p.endUtc;
const MARKER = /^(?:payrollpilot:)?([a-z]+-[a-z]+-?\d+)(?:#.*)?$/;

export function assembleDataset(input: AssembleInput): AssembledDataset {
  const { fx, maps, live, period } = input;
  const jm = maps.jobber;
  // ourId -> canonical id: the live id where the pusher created it upstream, else our id
  const canon = (kind: string, ourId: unknown): string | null => {
    if (typeof ourId !== "string") return null;
    const up = bucket(jm, kind)[ourId];
    return up && up !== "done" ? `jobber:${up}` : ourId;
  };
  const rev = (kind: string) =>
    new Map(Object.entries(bucket(jm, kind)).map(([o, u]) => [u, o]));
  const url = (sourceId: string) => live.jobber?.webUris?.[sourceId] ?? null;
  const unmatched: Record<string, number> = {};
  const count = (k: string) => {
    unmatched[k] = (unmatched[k] ?? 0) + 1;
  };

  // ---- workers: fixture is the config truth; Jobber / Gusto blocks come from live where mapped ----
  const gustoByUuid = new Map(
    (live.gusto?.workers ?? [])
      .filter((w) => w.gusto?.employeeUuid)
      .map((w) => [w.gusto?.employeeUuid as string, w]),
  );
  const gustoMap = (maps.gusto.workers ?? {}) as Record<
    string,
    { employeeUuid: string }
  >;
  const liveUsers = new Map(
    (live.jobber?.workers ?? []).map((w) => [w.jobber?.userId as string, w]),
  );
  const usedUsers = new Set<string>();
  const usedUuids = new Set<string>();
  const workers: Tagged<Rec>[] = (fx.workers ?? []).map((w) => {
    const userId = bucket(jm, "users")[w.id];
    const lu = userId ? liveUsers.get(userId) : undefined;
    if (userId && lu) usedUsers.add(userId);
    const uuid = gustoMap[w.id]?.employeeUuid;
    const lg = uuid ? gustoByUuid.get(uuid) : undefined;
    if (uuid && lg) usedUuids.add(uuid);
    return {
      ...w,
      id: canon("users", w.id) as string,
      managerId: canon("users", w.managerId),
      ...(lu
        ? { displayName: lu.displayName, status: lu.status, jobber: lu.jobber }
        : {}),
      ...(lg ? { gusto: lg.gusto } : {}),
      origin: lu || lg ? "live" : "fixture",
      ourId: w.id,
      url: null,
    };
  });
  for (const [userId, lu] of liveUsers) {
    if (usedUsers.has(userId)) continue;
    count("users");
    workers.push({
      ...(lu as unknown as Rec),
      origin: "live",
      ourId: null,
      url: null,
    });
  }
  for (const uuid of gustoByUuid.keys())
    if (!usedUuids.has(uuid)) count("gustoEmployeesUnmapped");
  const workerOf = (gustoWorkerId: string) => {
    const uuid = gustoWorkerId.replace(/^gusto:employee:/, "");
    const ours = Object.entries(gustoMap).find(
      ([, v]) => v.employeeUuid === uuid,
    )?.[0];
    return ours ? (canon("users", ours) as string) : gustoWorkerId;
  };

  // ---- live Jobber records, tagged with ourId through the map ----
  const tagLive = <T extends { sourceId: string }>(
    kind: string,
    xs: T[] | undefined,
  ): Tagged<Rec>[] => {
    const r = rev(kind);
    return (xs ?? []).map((x) => {
      const ourId = r.get(x.sourceId) ?? null;
      if (!ourId) count(kind);
      return {
        ...(x as unknown as Rec),
        origin: "live" as const,
        ourId,
        url: url(x.sourceId),
      };
    });
  };
  const liveJobs = tagLive("jobs", live.jobber?.jobs);
  const liveVisits = tagLive("visits", live.jobber?.visits);
  const liveQuotes = tagLive("quotes", live.jobber?.quotes);
  const liveInvoices = tagLive("invoices", live.jobber?.invoices);
  const liveEntries = tagLive("entries", live.jobber?.timeEntries);
  // Jobber's own invoice records (kind unknown) are kept; they are counted apart from unmatched below
  const livePayments = tagLive("payments", live.jobber?.payments);
  const liveJobberExpenses = tagLive("expenses", live.jobber?.expenses);
  const liveQbo: Tagged<Rec>[] = (live.qbo ?? []).map((x) => {
    const ourId =
      MARKER.exec(x.sourceId)?.[1] ?? reverseQbo(maps.qbo, x.id) ?? null;
    if (!ourId) count("qboExpenses");
    return { ...(x as unknown as Rec), origin: "live", ourId, url: null };
  });

  // ---- fixture records for this cycle, references remapped to live ids; skipped when live has them ----
  const haveLive = (xs: Tagged<Rec>[]) =>
    new Set(xs.map((x) => x.ourId).filter(Boolean) as string[]);
  const fixtureOnly = <T extends Rec>(
    xs: T[],
    liveOnes: Tagged<Rec>[],
    kind: string,
    remap: (r: T) => Partial<Rec>,
  ): Tagged<Rec>[] => {
    const seen = haveLive(liveOnes);
    return xs
      .filter((r) => !seen.has(r.id))
      .map((r) => ({
        ...r,
        ...remap(r),
        id: canon(kind, r.id) as string,
        origin: "fixture" as const,
        ourId: r.id,
        url: null,
      }));
  };
  const entries = (fx.timeEntries ?? []).filter(
    (e) => e.cycleId === input.cycle.id,
  );
  const visits = (fx.visits ?? []).filter((v) => inInstants(v.startAt, period));
  const payments = (fx.payments ?? []).filter((x) =>
    inDates(x.entryDate, period),
  );
  // an invoice issued earlier but paid in this cycle comes along, so every payment's invoice resolves
  const paidInvoices = new Set(
    payments.map((x) => x.invoiceId).filter(Boolean) as string[],
  );
  const liveInvoiceOurs = new Set(
    liveInvoices.map((i) => i.ourId).filter(Boolean) as string[],
  );
  const invoices = (fx.invoices ?? []).filter(
    (i) =>
      inDates(i.issuedDate, period) ||
      paidInvoices.has(i.id) ||
      liveInvoiceOurs.has(i.id),
  );
  const jExpenses = (fx.expenses ?? []).filter(
    (x) => x.source === "jobber" && inDates(x.date, period),
  );
  const qExpenses = (fx.expenses ?? []).filter(
    (x) => x.source === "qbo" && inDates(x.date, period),
  );
  const jobIds = new Set<string>();
  for (const r of [...entries, ...visits, ...invoices])
    if (typeof r.jobId === "string") jobIds.add(r.jobId);
  for (const x of [...jExpenses, ...qExpenses])
    if (typeof x.matchedJobId === "string") jobIds.add(x.matchedJobId);
  for (const j of liveJobs) if (j.ourId) jobIds.add(j.ourId);
  const depositQuotes = new Set(
    payments.map((x) => x.quoteId).filter(Boolean) as string[],
  );
  for (const q of fx.quotes ?? [])
    if (depositQuotes.has(q.id) && typeof q.jobId === "string")
      jobIds.add(q.jobId);
  const jobs = (fx.jobs ?? []).filter((j) => jobIds.has(j.id));
  // quotes: of in-scope jobs, plus any quote a cycle payment (deposit) was recorded on
  const quoteIds = new Set(
    [...jobs.map((j) => j.quoteId), ...payments.map((x) => x.quoteId)].filter(
      Boolean,
    ) as string[],
  );
  const quotes = (fx.quotes ?? []).filter(
    (q) =>
      quoteIds.has(q.id) ||
      (typeof q.jobId === "string" && jobIds.has(q.jobId)),
  );
  const W = (id: unknown) => canon("users", id);

  const tables = {
    workers,
    timeEntries: [
      ...liveEntries,
      ...fixtureOnly(entries, liveEntries, "entries", (e) => ({
        workerId: W(e.workerId),
        approvedBy: W(e.approvedBy),
        jobId: canon("jobs", e.jobId),
        visitId: canon("visits", e.visitId),
      })),
    ],
    jobs: [
      ...liveJobs,
      ...fixtureOnly(jobs, liveJobs, "jobs", (j) => ({
        salespersonWorkerId: W(j.salespersonWorkerId),
        quoteId: canon("quotes", j.quoteId),
        parentJobId: canon("jobs", j.parentJobId),
        clientRef: canon("clients", j.clientRef),
      })),
    ],
    visits: [
      ...liveVisits,
      ...fixtureOnly(visits, liveVisits, "visits", (v) => ({
        jobId: canon("jobs", v.jobId),
        assignedWorkerIds: ((v.assignedWorkerIds as string[]) ?? []).map((w) =>
          W(w),
        ),
      })),
    ],
    quotes: [
      ...liveQuotes,
      ...fixtureOnly(quotes, liveQuotes, "quotes", (q) => ({
        jobId: canon("jobs", q.jobId),
        salespersonWorkerId: W(q.salespersonWorkerId),
      })),
    ],
    invoices: [
      ...liveInvoices,
      ...fixtureOnly(invoices, liveInvoices, "invoices", (i) => ({
        jobId: canon("jobs", i.jobId),
      })),
    ],
    payments: [
      ...livePayments,
      ...fixtureOnly(payments, livePayments, "payments", (x) => ({
        invoiceId: canon("invoices", x.invoiceId),
        quoteId: canon("quotes", x.quoteId),
      })),
    ],
    expenses: [
      ...liveJobberExpenses,
      ...fixtureOnly(jExpenses, liveJobberExpenses, "expenses", (x) => ({
        matchedJobId: canon("jobs", x.matchedJobId),
      })),
      ...liveQbo,
      // fixture QBO expenses keep their id (no Jobber kind); only the job link is remapped
      ...qExpenses
        .filter((x) => !haveLive(liveQbo).has(x.id))
        .map((x) => ({
          ...x,
          matchedJobId: canon("jobs", x.matchedJobId),
          origin: "fixture" as const,
          ourId: x.id,
          url: null,
        })),
    ],
    pastPayrolls: (fx.pastPayrolls ?? []).map((p) => ({
      ...p,
      workerId: W(p.workerId),
      origin: "fixture" as const,
      ourId: p.id,
      url: null,
    })),
    gustoPayrolls: (live.gusto?.payrolls ?? []).map((p) => ({
      ...(p as unknown as Rec),
      employees:
        p.employees?.map((e) => ({ ...e, workerId: workerOf(e.workerId) })) ??
        null,
      origin: "live" as const,
      ourId: null,
      url: null,
    })),
  };
  // Jobber's invoice adjustments are expected strangers: not "unmatched"
  const adjustments = livePayments.filter(
    (p) => p.paymentType === JOBBER_INVOICE_ADJUSTMENT && !p.ourId,
  ).length;
  if (adjustments) {
    unmatched.payments = (unmatched.payments ?? 0) - adjustments;
    if (!unmatched.payments) delete unmatched.payments;
    unmatched.jobberInvoiceAdjustments = adjustments;
  }
  return {
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    companyId: input.companyId,
    cycleId: input.cycle.id,
    period,
    sources: {
      jobber: live.jobber ? "live" : "fixture",
      qbo: live.qbo ? "live" : "fixture",
      gusto: live.gusto ? "live" : "fixture",
    },
    tables,
    syncRuns: live.syncRuns,
    unmatched,
  };
}

function reverseQbo(
  map: Record<string, unknown>,
  id: string,
): string | undefined {
  const qboId = id.split(":")[2];
  for (const k of ["purchases", "bills"]) {
    const hit = Object.entries(bucket(map, k)).find(([, up]) => up === qboId);
    if (hit) return hit[0];
  }
  return undefined;
}

// ---------------------------------------------------------------- CLI (read-only)
//   bun --env-file=.env run packages/connectors/src/assemble.ts --company a --cycle a-c05 [--skip qbo,gusto] [--private-dir <data/private>]
// Pulls each source whose token file exists in data/private/ (read-only), assembles, writes
// data/private/assembled/<company>-<cycle>.json (0600, derived, never committed), prints counts only.

async function cli() {
  const { parseArgs } = await import("node:util");
  const { access, mkdir, readFile, writeFile } = await import(
    "node:fs/promises"
  );
  const { fileURLToPath } = await import("node:url");
  const { loadFixtures, loadIdMap } = await import("./compare.ts");
  const { pullSource } = await import("./index.ts");
  const { pullCycle } = await import("./jobber/index.ts");
  const { JobberClient } = await import("./jobber/client.ts");
  const { addDays, resolvePeriod } = await import("./time.ts");
  const { fileTokenStore, privatePath } = await import("./tokens.ts");

  const { values } = parseArgs({
    options: {
      company: { type: "string" },
      cycle: { type: "string" },
      skip: { type: "string" },
      "private-dir": { type: "string" },
    },
  });
  // the checkout whose data/private holds the tokens and maps (default: this one); tokens are used in place, never copied
  const priv = (name: string) =>
    values["private-dir"]
      ? `${values["private-dir"].replace(/\/$/, "")}/${name}`
      : privatePath(name);
  const company = values.company;
  const cycleId = values.cycle;
  if (!company || !cycleId)
    throw new Error(
      "usage: assemble.ts --company <id> --cycle <cycleId> [--skip jobber,qbo,gusto]",
    );
  const skip = new Set((values.skip ?? "").split(",").filter(Boolean));
  const fxDir = fileURLToPath(
    new URL(`../../../data/fixtures/${company}`, import.meta.url),
  );
  const fx = (await loadFixtures(fxDir)) as AssembleInput["fx"];
  fx.pastPayrolls = JSON.parse(
    await readFile(`${fxDir}/pastPayrolls.json`, "utf8").catch(() => "[]"),
  );
  const co = JSON.parse(await readFile(`${fxDir}/company.json`, "utf8")) as {
    timezone: string;
  };
  const cycles = JSON.parse(
    await readFile(`${fxDir}/cycles.json`, "utf8"),
  ) as AssembleInput["cycle"][];
  const cycle = cycles.find((c) => c.id === cycleId);
  if (!cycle) throw new Error(`no cycle ${cycleId} in ${fxDir}/cycles.json`);
  // periodEnd is the last millisecond (inclusive); the connectors take an exclusive end
  const period = resolvePeriod(
    cycle.periodStart,
    new Date(Date.parse(cycle.periodEnd) + 1).toISOString(),
    co.timezone,
  );
  const maps = {
    jobber: await loadIdMap(
      company,
      "jobber",
      priv(`${company}-jobber-map.json`),
    ),
    qbo: await loadIdMap(company, "qbo", priv(`${company}-qbo-map.json`)),
    gusto: await loadIdMap(company, "gusto", priv(`${company}-gusto-map.json`)),
  };
  const has = async (p: string) =>
    access(p).then(
      () => true,
      () => false,
    );
  const env = process.env;
  const log = (l: string) => console.error(l);
  const live: AssembleInput["live"] = { syncRuns: [] };

  const jobberToken = priv("jobber-token.json");
  if (
    !skip.has("jobber") &&
    (await has(jobberToken)) &&
    env.JOBBER_CLIENT_ID &&
    env.JOBBER_CLIENT_SECRET
  ) {
    const auth = {
      clientId: env.JOBBER_CLIENT_ID,
      clientSecret: env.JOBBER_CLIENT_SECRET,
      tokenStore: fileTokenStore(jobberToken),
      log,
    };
    const r = await pullCycle(auth, company, period.startUtc, period.endUtc, {
      client: new JobberClient(auth),
      cycleId,
      timezone: co.timezone,
    });
    live.jobber = r.records;
    live.syncRuns.push(...r.syncRuns);
  } else
    log(
      "jobber: not pulled (skipped, no token file or no JOBBER_CLIENT_*); fixture records stand in",
    );

  const gustoToken = priv("gusto-token.json");
  if (
    !skip.has("gusto") &&
    (await has(gustoToken)) &&
    env.GUSTO_CLIENT_ID &&
    env.GUSTO_CLIENT_SECRET
  ) {
    const r = await pullSource("gusto", {
      companyId: company,
      cycleId,
      from: addDays(period.endDate, -364),
      to: period.endDate,
      credentials: {
        clientId: env.GUSTO_CLIENT_ID,
        clientSecret: env.GUSTO_CLIENT_SECRET,
      },
      tokenStore: fileTokenStore(gustoToken),
      gustoCompanyUuid:
        (maps.gusto.companyUuid as string | undefined) ?? undefined,
      log,
    });
    live.gusto = {
      workers: r.records.workers ?? [],
      payrolls: r.records.payrolls ?? [],
    };
    live.syncRuns.push(...r.syncRuns);
  } else log("gusto: not pulled; fixture records stand in");

  const qboToken = priv("qbo-token.json");
  if (
    !skip.has("qbo") &&
    (await has(qboToken)) &&
    env.QBO_CLIENT_ID &&
    env.QBO_CLIENT_SECRET &&
    env.QBO_REALM_ID
  ) {
    const r = await pullSource("qbo", {
      companyId: company,
      cycleId,
      from: period.startDate,
      to: period.endDate,
      realmId: env.QBO_REALM_ID,
      credentials: {
        clientId: env.QBO_CLIENT_ID,
        clientSecret: env.QBO_CLIENT_SECRET,
      },
      tokenStore: fileTokenStore(qboToken),
      log,
    });
    live.qbo = r.records.expenses ?? [];
    live.syncRuns.push(...r.syncRuns);
  } else log("qbo: not pulled; fixture records stand in");

  const d = assembleDataset({
    companyId: company,
    cycle,
    period,
    fx,
    maps,
    live,
  });
  const out = priv(`assembled/${company}-${cycleId}.json`);
  await mkdir(priv("assembled"), { recursive: true, mode: 0o700 });
  await writeFile(out, JSON.stringify(d, null, 2), { mode: 0o600 });
  console.log(summarizeDataset(d));
  console.log(`wrote data/private/assembled/${company}-${cycleId}.json`);
}

if (import.meta.main) {
  cli().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

/** Counts only, per table and origin. */
export function summarizeDataset(d: AssembledDataset): string {
  const lines = [
    `${d.companyId} ${d.cycleId} ${d.period.startDate}..${d.period.endDate}  sources: jobber ${d.sources.jobber}, qbo ${d.sources.qbo}, gusto ${d.sources.gusto}`,
  ];
  for (const [name, rows] of Object.entries(d.tables)) {
    const live = rows.filter((r) => r.origin === "live").length;
    const linked = rows.filter((r) => r.url).length;
    lines.push(
      `  ${name.padEnd(14)} ${String(rows.length).padStart(5)}  live ${String(live).padStart(4)}  fixture ${String(rows.length - live).padStart(4)}${linked ? `  with url ${linked}` : ""}`,
    );
  }
  const incomplete = d.syncRuns
    .filter((s) => !s.complete)
    .map((s) => `${s.source}:${s.object}`);
  lines.push(
    `  syncRuns ${d.syncRuns.length}, incomplete ${incomplete.length}${incomplete.length ? ` (${incomplete.join(", ")})` : ""}`,
  );
  const um = Object.entries(d.unmatched).map(([k, v]) => `${k} ${v}`);
  lines.push(
    `  live records not in the id maps: ${um.length ? um.join(", ") : "none"}`,
  );
  return lines.join("\n");
}
