// Company R package (pure): ingest-r's anonymized bundles -> strict contract tables that
// `sync.ingestFixture` loads as is (apps/web/scripts/ingest.ts reads <table>.json + company.json).
// Nothing is guessed: a row the contract cannot hold without inventing a value goes to an "unloadable"
// list with the reason; a worker whose role or pay type is unknown is not inserted ("blocked").
// No IO here: seed/build-r-package.ts reads data/private/r/ and writes the package.

import type { z } from "zod";
import * as S from "../../packages/engine/src/schemas.ts";

type Rec = Record<string, unknown>;
export type Role = "field" | "manager" | "owner" | "office";
export type PayType = "hourly" | "salary" | "contractor_venmo" | "commission";

/** data/private/r/m4-rules.json (eval/m4-r.ts RSetup), the fields used here. `role`/`status` are optional extras. */
export type RRules = {
  timezone?: string;
  payFrequency?: "weekly" | "biweekly";
  workers?: {
    id: string;
    payType?: PayType;
    rateCents?: number | null;
    paymentUnit?: string | null;
    role?: Role;
    status?: "active" | "inactive";
  }[];
  rules?: { id: string; type: string; params: Rec; status: string }[];
};

export type BuildOptions = {
  companyId?: string;
  /** current unpaid cycle (Mon..Sun, inclusive) */
  current: { start: string; end: string };
  timezone?: string;
  /** values the exports and rules don't carry; without them the company row is not written */
  settings?: Partial<{
    longShiftHours: number;
    otWeeklyHours: number;
    grossChangePct: number;
    employeesMayBeTexted: boolean;
    lowMarginPct: number;
  }>;
  /** worker id -> role, when the owner states it outside m4-rules.json */
  roles?: Record<string, Role>;
};

export type Unloadable = { table: string; id: string; reasons: string[] };
export type RPackage = {
  history: Record<string, Rec[] | Rec>;
  current: Record<string, Rec[] | Rec>;
  unloadable: Unloadable[];
  blocked: { id: string; reason: string }[];
  ownerDraws: Rec[];
  excluded: {
    personalVenmo: number;
    venmoNotWage: Record<string, number>;
    duplicateIds: number;
    droppedFields: Record<string, string[]>;
  };
  companyMissing: string[];
  notes: string[];
};

const TABLE_SCHEMA: Record<string, z.ZodObject> = {
  workers: S.Worker as unknown as z.ZodObject,
  cycles: S.Cycle as unknown as z.ZodObject,
  pastPayrolls: S.PastPayroll as unknown as z.ZodObject,
  quotes: S.Quote as unknown as z.ZodObject,
  jobs: S.Job as unknown as z.ZodObject,
  visits: S.Visit as unknown as z.ZodObject,
  invoices: S.Invoice as unknown as z.ZodObject,
  payments: S.Payment as unknown as z.ZodObject,
  expenses: S.Expense as unknown as z.ZodObject,
  timeEntries: S.TimeEntry as unknown as z.ZodObject,
  syncRuns: S.SyncRun as unknown as z.ZodObject,
};

const DAY = 86_400_000;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const localDay = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
/** Last instant of a local day, as ISO UTC (no cutoff time exists in the exports). */
const endOfLocalDay = (d: string, tz: string) => {
  const next = addDays(d, 1);
  // find the UTC instant of local midnight of `next` by probing the offset at noon
  const probe = new Date(`${next}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(probe);
  const offsetH = 12 - Number(local);
  return new Date(
    Date.parse(`${next}T00:00:00Z`) + offsetH * 3_600_000 - 1,
  ).toISOString();
};
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Keep only the contract's keys; fill a missing key with null where the contract allows null. Strict-parse. */
export function shape(
  table: string,
  row: Rec,
  dropped: Record<string, Set<string>>,
): { ok: Rec } | { reasons: string[] } {
  const schema = must(TABLE_SCHEMA[table], `schema ${table}`);
  const out: Rec = {};
  for (const [k, field] of Object.entries(schema.shape)) {
    if (k in row) out[k] = row[k];
    else if ((field as z.ZodType).safeParse(null).success) out[k] = null;
  }
  for (const k of Object.keys(row)) {
    if (k in schema.shape) continue;
    const set = dropped[table] ?? new Set<string>();
    set.add(k);
    dropped[table] = set;
  }
  const r = schema.strict().safeParse(out);
  if (r.success) return { ok: out };
  return {
    reasons: r.error.issues.map(
      (i) =>
        `${i.path.join(".") || "(row)"}: ${i.message}${out[String(i.path[0])] === null ? " (null: not in the source)" : ""}`,
    ),
  };
}

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

type Bundle = Rec & { records?: Rec };
const arr = (b: Bundle, k: string): Rec[] =>
  ((b.records?.[k] ?? b[k]) as Rec[] | undefined) ?? [];

export function buildRPackage(
  bundles: Bundle[],
  rules: RRules | null,
  o: BuildOptions,
): RPackage {
  const C = o.companyId ?? "r";
  const tz = o.timezone ?? rules?.timezone ?? "America/New_York";
  const unloadable: Unloadable[] = [];
  const blocked: RPackage["blocked"] = [];
  const notes: string[] = [];
  const droppedSets: Record<string, Set<string>> = {};
  let duplicateIds = 0;
  const merged = (k: string) => {
    const seen = new Map<string, Rec>();
    for (const b of bundles)
      for (const r of arr(b, k)) {
        const id = String(r.id);
        if (seen.has(id)) duplicateIds++;
        else seen.set(id, r);
      }
    return [...seen.values()];
  };

  // ---- cycles: Gusto pay periods from the journal + the current unpaid cycle
  const paid = bundles.flatMap((b) => arr(b, "paid"));
  const periods = new Map<string, { start: string; end: string }>();
  for (const p of paid) {
    if (!p.periodStart || !p.periodEnd) continue;
    if (p.sectionKind && p.sectionKind !== "regular") continue;
    periods.set(`${p.periodStart}|${p.periodEnd}`, {
      start: String(p.periodStart),
      end: String(p.periodEnd),
    });
  }
  periods.set(`${o.current.start}|${o.current.end}`, {
    start: o.current.start,
    end: o.current.end,
  });
  const sorted = [...periods.values()].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  for (const p of sorted)
    if (weekday(p.start) !== 1 || weekday(p.end) !== 0)
      notes.push(`period ${p.start}..${p.end} is not Mon..Sun`);
  const cycles: Rec[] = sorted.map((p, i) => ({
    id: `${C}-c${String(i + 1).padStart(2, "0")}`,
    companyId: C,
    number: i + 1,
    periodStart: p.start,
    periodEnd: p.end,
    cutoffAt: endOfLocalDay(p.end, tz),
    stage: p.start === o.current.start ? "setup" : "closed",
    gustoPayrollId: null,
    gustoOffCyclePayrollId: null,
    questionsAsked: 0,
  }));
  const currentCycle = must(
    cycles.find((c) => c.periodStart === o.current.start),
    "current cycle",
  );
  const cycleOf = (day: string | null | undefined) =>
    day
      ? cycles.find(
          (c) => day >= String(c.periodStart) && day <= String(c.periodEnd),
        )
      : undefined;
  const cycleByPeriod = (s: unknown, e: unknown) =>
    cycles.find((c) => c.periodStart === s && c.periodEnd === e);

  // ---- Venmo rows (A1's reader): class wage|reimbursement|tip|commission|referral|personal
  const venmo = bundles.flatMap((b) => [
    ...arr(b, "venmo"),
    ...arr(b, "venmoPayments"),
  ]);
  const vClass = (v: Rec) => String(v.class ?? v.kind ?? "");
  const vDay = (v: Rec) => String(v.date ?? v.entryDate ?? "").slice(0, 10);
  const personalVenmo = venmo.filter((v) => vClass(v) === "personal").length;
  const venmoNotWage: Record<string, number> = {};
  const venmoWageWorkers = new Set(
    venmo
      .filter((v) => vClass(v) === "wage" && v.workerId)
      .map((v) => String(v.workerId)),
  );

  // ---- workers: role/payType from the owner (m4-rules / roles), Venmo class; never guessed
  const ruleWorker = new Map((rules?.workers ?? []).map((w) => [w.id, w]));
  const ownerIds = new Set(
    paid
      .filter((p) => p.payKind === "owner_draw")
      .map((p) => String(p.workerId)),
  );
  const inputWorkers = new Map<string, Rec>();
  for (const w of merged("workers")) inputWorkers.set(String(w.id), w);
  for (const id of [...ruleWorker.keys(), ...venmoWageWorkers])
    if (!inputWorkers.has(id)) inputWorkers.set(id, { id, displayName: id });
  const lastPaidCycle = cycles.filter((c) => c.stage === "closed").at(-1);
  const active = new Set<string>();
  for (const e of bundles.flatMap((b) => arr(b, "timeEntries"))) {
    const d = String(
      e.date ?? (e.startAt ? localDay(String(e.startAt), tz) : ""),
    );
    const c = cycleOf(d);
    if (c && (c === currentCycle || c === lastPaidCycle))
      active.add(String(e.workerId));
  }
  for (const p of paid)
    if (
      lastPaidCycle &&
      cycleByPeriod(p.periodStart, p.periodEnd) === lastPaidCycle
    )
      active.add(String(p.workerId));
  const workers: Rec[] = [];
  const workerOk = new Set<string>();
  for (const [id, w] of inputWorkers) {
    const rw = ruleWorker.get(id);
    const payType: PayType | undefined =
      rw?.payType ??
      (venmoWageWorkers.has(id) ? "contractor_venmo" : undefined) ??
      (w.payType as PayType | undefined);
    const role: Role | undefined =
      rw?.role ??
      o.roles?.[id] ??
      (ownerIds.has(id) ? "owner" : undefined) ??
      (w.role as Role | undefined);
    if (!role || !payType) {
      blocked.push({
        id,
        reason: [!role && "role unknown", !payType && "payType unknown"]
          .filter(Boolean)
          .join(", "),
      });
      continue;
    }
    const status =
      rw?.status ??
      (w.status as "active" | "inactive" | undefined) ??
      (active.has(id) ? "active" : "inactive");
    const row: Rec = {
      id,
      companyId: C,
      displayName: String(w.displayName ?? id),
      role,
      payType,
      status,
      managerId: null,
      contactRef: null,
      jobber: (w.jobber as Rec | undefined) ?? null,
      gusto: (w.gusto as Rec | undefined) ?? null,
      venmoRateCents:
        payType === "contractor_venmo" && rw?.paymentUnit === "Hour"
          ? (rw.rateCents ?? null)
          : null,
    };
    const s = shape("workers", row, droppedSets);
    if ("ok" in s) {
      workers.push(s.ok);
      workerOk.add(id);
    } else unloadable.push({ table: "workers", id, reasons: s.reasons });
  }
  if (!rules?.workers?.some((w) => w.role) && !o.roles)
    notes.push(
      "no worker roles given (m4-rules.json workers[].role or --roles): only owners (owner draws) can be inserted",
    );

  // ---- generic tables
  const load = (
    table: string,
    rows: Rec[],
    fix: (r: Rec) => Rec | { reasons: string[] },
  ) => {
    const out: Rec[] = [];
    for (const r of rows) {
      const f = fix(r);
      if ("reasons" in f && Array.isArray(f.reasons) && !("id" in f)) {
        unloadable.push({
          table,
          id: String(r.id),
          reasons: f.reasons as string[],
        });
        continue;
      }
      const s = shape(table, { ...(f as Rec), companyId: C }, droppedSets);
      if ("ok" in s) out.push(s.ok);
      else unloadable.push({ table, id: String(r.id), reasons: s.reasons });
    }
    return out;
  };
  const needWorker = (id: unknown) => id == null || workerOk.has(String(id));
  /** A reference to a blocked worker is a fact we can't load: the row is unloadable, never nulled. */
  const blockedRef = (r: Rec, ...keys: string[]) => {
    const bad = keys.filter((k) => !needWorker(r[k]));
    return bad.length
      ? {
          reasons: bad.map((k) => `${k}: worker ${r[k]} is blocked or unknown`),
        }
      : null;
  };

  // jobs: exports carry {id, jobNumber, title}; the client comes from the time entries (a fact per row)
  const entryClient = new Map<string, string>();
  for (const e of bundles.flatMap((b) => arr(b, "timeEntries")))
    if (e.jobId && e.clientRef && !entryClient.has(String(e.jobId)))
      entryClient.set(String(e.jobId), String(e.clientRef));
  const jobs = load(
    "jobs",
    merged("jobs"),
    (j) =>
      blockedRef(j, "salespersonWorkerId") ?? {
        sourceId: j.sourceId ?? j.id,
        clientRef: j.clientRef ?? entryClient.get(String(j.id)),
        status: j.status ?? "unknown",
        ...j,
      },
  );
  const jobIds = new Set(jobs.map((j) => String(j.id)));
  const quotes = load(
    "quotes",
    merged("quotes"),
    (q) => blockedRef(q, "salespersonWorkerId") ?? q,
  );
  const visits = load("visits", merged("visits"), (v) => v);
  const invoices = load("invoices", merged("invoices"), (v) => v);
  const payments = load("payments", merged("payments"), (p) => ({
    ...p,
    kind: ["deposit", "final", "unknown"].includes(String(p.kind))
      ? p.kind
      : "unknown",
  }));
  const kindRule = new Map(
    (rules?.rules ?? [])
      .filter((r) => r.type === "expense_account_kind" && r.status !== "off")
      .map((r) => [String(r.params.accountName), String(r.params.kind)]),
  );
  const expenses = load(
    "expenses",
    merged("expenses"),
    (x) =>
      blockedRef(x, "reimbursableToWorkerId") ?? {
        ...x,
        kind: kindRule.get(String(x.accountName)) ?? "unknown",
      },
  );
  for (const v of venmo) {
    const c = vClass(v);
    if (c === "reimbursement")
      unloadable.push({
        table: "expenses",
        id: String(v.id),
        reasons: [
          "source: Venmo reimbursement; Expense.source allows only qbo|jobber (contract ask: add venmo)",
        ],
      });
    else if (c !== "wage" && c !== "personal")
      venmoNotWage[c || "unclassified"] =
        (venmoNotWage[c || "unclassified"] ?? 0) + 1;
  }

  // ---- time entries: ticking only as a fact; approved/payable never invented
  const timeEntries = load("timeEntries", merged("timeEntries"), (e) => {
    const reasons: string[] = [];
    if (!workerOk.has(String(e.workerId)))
      reasons.push(`workerId: worker ${e.workerId} is blocked or unknown`);
    const d = String(
      e.date ?? (e.startAt ? localDay(String(e.startAt), tz) : ""),
    );
    const c = cycleOf(d);
    if (!c) reasons.push(`cycleId: date ${d || "unknown"} is in no pay period`);
    if (e.jobId && !jobIds.has(String(e.jobId)))
      reasons.push(`jobId: job ${e.jobId} not loadable`);
    if (reasons.length) return { reasons };
    return {
      ...e,
      cycleId: c?.id,
      ticking: e.endAt
        ? false
        : typeof e.ticking === "boolean"
          ? e.ticking
          : null,
      visitId: e.visitId ?? null,
    };
  });

  // ---- past payrolls: Gusto wage rows (owner draws apart) + Venmo wage rows
  const ownerDraws: Rec[] = [];
  const pastPayrolls: Rec[] = [];
  for (const p of paid) {
    const c =
      cycleByPeriod(p.periodStart, p.periodEnd) ??
      cycleOf(String(p.periodEnd ?? ""));
    if (
      p.payKind === "owner_draw" ||
      (p.ownerDrawCents as number | undefined)
    ) {
      ownerDraws.push({
        workerId: p.workerId,
        cycleId: c?.id ?? null,
        ownerDrawCents: p.ownerDrawCents ?? p.grossCents,
        sourceId: p.sourceId,
      });
      if (p.payKind === "owner_draw") continue;
    }
    const reasons: string[] = [];
    if (!workerOk.has(String(p.workerId)))
      reasons.push(`workerId: worker ${p.workerId} is blocked or unknown`);
    if (!c)
      reasons.push(
        `cycleId: period ${p.periodStart}..${p.periodEnd} matches no cycle`,
      );
    if (p.sectionKind === "other")
      reasons.push("paidVia: journal section is neither regular nor off-cycle");
    const id = `pp:${p.sourceId}`;
    if (reasons.length) {
      unloadable.push({ table: "pastPayrolls", id, reasons });
      continue;
    }
    const lines = (p.jobLines as Rec[] | undefined)?.length
      ? (p.jobLines as Rec[]).map((l) => ({
          name: String(l.payType),
          hours: l.hours ?? null,
          rateCents: l.rateCents ?? null,
          amountCents: l.amountCents,
        }))
      : p.earningsCents
        ? Object.entries(p.earningsCents as Record<string, number>).map(
            ([name, amountCents]) => ({
              name,
              hours:
                (p.hours as Record<string, number> | undefined)?.[name] ?? null,
              rateCents: null,
              amountCents,
            }),
          )
        : [
            {
              name: "Gross",
              hours: null,
              rateCents: null,
              amountCents: p.grossCents,
            },
          ];
    const s = shape(
      "pastPayrolls",
      {
        id,
        companyId: C,
        cycleId: c?.id,
        sourceId: p.sourceId,
        workerId: p.workerId,
        paidVia:
          p.sectionKind === "off_cycle" ? "gusto_off_cycle" : "gusto_regular",
        earnings: lines,
        grossCents: p.grossCents,
      },
      droppedSets,
    );
    if ("ok" in s) pastPayrolls.push(s.ok);
    else unloadable.push({ table: "pastPayrolls", id, reasons: s.reasons });
  }
  for (const v of venmo.filter((x) => vClass(x) === "wage")) {
    const c = cycleOf(vDay(v));
    const id = `pp:venmo:${v.id}`;
    const reasons: string[] = [];
    if (!workerOk.has(String(v.workerId)))
      reasons.push(`workerId: worker ${v.workerId} is blocked or unknown`);
    if (!c) reasons.push(`cycleId: date ${vDay(v)} is in no pay period`);
    if (reasons.length) {
      unloadable.push({ table: "pastPayrolls", id, reasons });
      continue;
    }
    const s = shape(
      "pastPayrolls",
      {
        id,
        companyId: C,
        cycleId: c?.id,
        sourceId: String(v.sourceId ?? v.id),
        workerId: v.workerId,
        paidVia: "venmo",
        earnings: [
          {
            name: "Hours",
            hours: null,
            rateCents: null,
            amountCents: v.amountCents,
          },
        ],
        grossCents: v.amountCents,
      },
      droppedSets,
    );
    if ("ok" in s) pastPayrolls.push(s.ok);
    else unloadable.push({ table: "pastPayrolls", id, reasons: s.reasons });
  }

  const syncRuns = load(
    "syncRuns",
    bundles
      .flatMap((b) => (b.syncRuns as Rec[] | undefined) ?? [])
      .map((r, i) => ({
        id: `${C}-sr-${String(i + 1).padStart(3, "0")}`,
        ...r,
        cycleId: null,
      })),
    (r) => r,
  );

  // ---- company: settings from the rules where present, the rest from options; never defaulted
  const rule = (type: string) =>
    (rules?.rules ?? []).find((r) => r.type === type && r.status !== "off")
      ?.params;
  const settings = {
    longShiftHours:
      o.settings?.longShiftHours ??
      (rule("long_shift_threshold")?.hours as number | undefined),
    otWeeklyHours:
      o.settings?.otWeeklyHours ??
      (rule("overtime_policy")?.weeklyHours as number | undefined),
    grossChangePct:
      o.settings?.grossChangePct ??
      (rule("catch_all_threshold")?.grossChangePct as number | undefined),
    employeesMayBeTexted: o.settings?.employeesMayBeTexted,
    lowMarginPct: o.settings?.lowMarginPct,
  };
  const companyMissing = Object.entries(settings)
    .filter(([, v]) => v === undefined || v === null)
    .map(([k]) => k);
  const company = {
    id: C,
    name: "Company R (real, anonymized)",
    kind: "real",
    payFrequency: rules?.payFrequency ?? "biweekly",
    timezone: tz,
    settings,
  };

  // ---- folders: history = up to the last paid cycle; current = history + the current cycle (superset)
  const curStart = o.current.start;
  const before = (d: unknown) => d == null || String(d).slice(0, 10) < curStart;
  const histCycles = new Set(
    cycles.filter((c) => c.stage === "closed").map((c) => String(c.id)),
  );
  const pick = (all: boolean) => ({
    ...(companyMissing.length ? {} : { "company.json": company }),
    "workers.json": workers,
    "cycles.json": all
      ? cycles
      : cycles.filter((c) => histCycles.has(String(c.id))),
    "pastPayrolls.json": pastPayrolls.filter(
      (p) => all || histCycles.has(String(p.cycleId)),
    ),
    "quotes.json": quotes.filter((q) => all || before(q.sentAt)),
    "jobs.json": jobs,
    "visits.json": visits.filter((v) => all || before(v.startAt)),
    "invoices.json": invoices.filter((v) => all || before(v.issuedDate)),
    "payments.json": payments.filter((p) => all || before(p.entryDate)),
    "expenses.json": expenses.filter((x) => all || before(x.date)),
    "timeEntries.json": timeEntries.filter(
      (e) => all || histCycles.has(String(e.cycleId)),
    ),
    "syncRuns.json": syncRuns,
  });
  // quotes/jobs reference each other: a history quote may point at a job, which is always present
  const droppedFields = Object.fromEntries(
    Object.entries(droppedSets).map(([t, s]) => [t, [...s].sort()]),
  );
  return {
    history: pick(false),
    current: pick(true),
    unloadable,
    blocked,
    ownerDraws,
    excluded: { personalVenmo, venmoNotWage, duplicateIds, droppedFields },
    companyMissing,
    notes,
  };
}

/** Counts per table (rows), for the manifest. */
export const counts = (folder: Record<string, Rec[] | Rec>) =>
  Object.fromEntries(
    Object.entries(folder).map(([f, v]) => [
      f,
      Array.isArray(v) ? v.length : 1,
    ]),
  );
