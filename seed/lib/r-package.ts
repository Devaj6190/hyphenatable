// Company R package (pure): ingest-r's anonymized bundles -> strict contract tables that
// `sync.ingestFixture` loads as is (apps/web/scripts/ingest.ts reads <table>.json + company.json).
// Input shapes: packages/connectors/src/anonymize.ts (AnonymizedBundle), anonymize-reports.ts (Jobber
// reports), anonymize-money.ts (QBO ledger, Venmo). Nothing is guessed: a row the contract cannot hold
// without inventing a value goes to "unloadable" with the reason; a worker whose role or pay type has no
// evidence is not inserted ("blocked"). No IO here: seed/build-r-package.ts does the reading and writing.

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
  /** owner-facts.json says nobody is salaried (only the emptiness of `salaried` is read, never names) */
  noSalaried?: boolean;
};

export type Unloadable = { table: string; id: string; reasons: string[] };
export type RPackage = {
  history: Record<string, Rec[] | Rec>;
  current: Record<string, Rec[] | Rec>;
  unloadable: Unloadable[];
  /** entries after the current cycle: not an error, just outside every cycle */
  afterCurrentCycle: { table: string; id: string; date: string }[];
  blocked: { id: string; reason: string }[];
  /** nullable references set to null because the record they point at is blocked; counted per kind */
  unresolved: Record<string, string[]>;
  ownerDraws: Rec[];
  excluded: {
    personalOrUnknownVenmo: number;
    venmoNotLoaded: Record<string, number>;
    journalLabelJobs: number;
    invoiceTransactions: number;
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
/** UTC instant of local midnight starting `d` in `tz` (day precision: the reports carry dates, not times). */
export const startOfLocalDay = (d: string, tz: string) => {
  const probe = new Date(`${d}T12:00:00Z`);
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(probe),
  );
  return new Date(
    Date.parse(`${d}T00:00:00Z`) + (12 - h) * 3_600_000,
  ).toISOString();
};
/** Last instant of a local day (no cutoff time exists in the exports). */
const endOfLocalDay = (d: string, tz: string) =>
  new Date(Date.parse(startOfLocalDay(addDays(d, 1), tz)) - 1).toISOString();
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const isDay = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d);

/** Keep only the contract's keys; fill a missing key with null where the contract allows null. Strict-parse. */
export function shape(
  table: string,
  row: Rec,
  dropped: Record<string, Set<string>>,
): { ok: Rec } | { reasons: string[] } {
  const schema = must(TABLE_SCHEMA[table], `schema ${table}`);
  const out: Rec = {};
  for (const [k, field] of Object.entries(schema.shape)) {
    if (k in row && row[k] !== undefined) out[k] = row[k];
    else if ((field as z.ZodType).safeParse(null).success) out[k] = null;
  }
  for (const k of Object.keys(row)) {
    if (k in schema.shape || k.startsWith("_")) continue;
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
  const afterCurrentCycle: RPackage["afterCurrentCycle"] = [];
  const blocked: RPackage["blocked"] = [];
  const unresolved: Record<string, string[]> = {};
  const notes: string[] = [];
  const droppedSets: Record<string, Set<string>> = {};
  let duplicateIds = 0;
  const merged = (...keys: string[]) => {
    const seen = new Map<string, Rec>();
    for (const b of bundles)
      for (const k of keys)
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
    if (!isDay(p.periodStart) || !isDay(p.periodEnd)) continue;
    if (p.sectionKind && p.sectionKind !== "regular") continue;
    periods.set(`${p.periodStart}|${p.periodEnd}`, {
      start: p.periodStart,
      end: p.periodEnd,
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
  const isAfterCurrent = (day: string) => day > o.current.end;

  // ---- Venmo (anonymize-money.ts AnonVenmo): counterpartyWorkerId, datetime, direction, signed amountCents, class
  const venmo = bundles.flatMap((b) => arr(b, "venmo"));
  const vClass = (v: Rec) => String(v.class ?? "");
  const vDay = (v: Rec) =>
    isDay(v.datetime) ? localDay(String(v.datetime), tz) : "";
  const vWorker = (v: Rec) => (v.counterpartyWorkerId ?? null) as string | null;
  const venmoWage = venmo.filter(
    (v) => vClass(v) === "wage" && v.direction === "out" && vWorker(v),
  );
  const personalOrUnknownVenmo = venmo.filter(
    (v) => vClass(v) === "personal_or_unknown",
  ).length;
  const venmoNotLoaded: Record<string, number> = {};
  const venmoWageWorkers = new Set(venmoWage.map((v) => String(vWorker(v))));

  // ---- workers: role from the owner (m4-rules / roles / owner draw); pay type from evidence only
  const ruleWorker = new Map((rules?.workers ?? []).map((w) => [w.id, w]));
  const ownerIds = new Set(
    paid
      .filter((p) => p.payKind === "owner_draw")
      .map((p) => String(p.workerId)),
  );
  /** journal fact: earnings lines with hours and a rate */
  const hourlyLines = new Set(
    paid
      .filter(
        (p) =>
          p.payKind !== "owner_draw" &&
          ((p.jobLines as Rec[] | undefined) ?? []).some(
            (l) => Number(l.hours) > 0 && Number(l.rateCents) > 0,
          ),
      )
      .map((p) => String(p.workerId)),
  );
  const inputWorkers = new Map<string, Rec>();
  for (const w of merged("workers")) inputWorkers.set(String(w.id), w);
  for (const id of [...ruleWorker.keys(), ...venmoWageWorkers])
    if (!inputWorkers.has(id)) inputWorkers.set(id, { id, displayName: id });
  const lastPaidCycle = cycles.filter((c) => c.stage === "closed").at(-1);
  const active = new Set<string>();
  for (const e of bundles.flatMap((b) => arr(b, "timeEntries"))) {
    const c = cycleOf(
      String(e.date ?? (e.startAt ? localDay(String(e.startAt), tz) : "")),
    );
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
    const role: Role | undefined =
      rw?.role ??
      o.roles?.[id] ??
      (ownerIds.has(id) ? "owner" : undefined) ??
      (w.role as Role | undefined);
    let payType: PayType | undefined =
      rw?.payType ?? (w.payType as PayType | undefined);
    let payEvidence = rw?.payType ? "m4-rules" : "";
    if (!payType && hourlyLines.has(id))
      [payType, payEvidence] = ["hourly", "journal hours x rate"];
    if (!payType && venmoWageWorkers.has(id))
      [payType, payEvidence] = ["contractor_venmo", "Venmo wage rows"];
    if (payType === "salary" && o.noSalaried && payEvidence !== "m4-rules")
      payType = undefined;
    if (!role || !payType) {
      const why: string[] = [];
      if (!role) why.push("role: none in m4-rules, --roles or owner draws");
      if (!payType)
        why.push(
          ownerIds.has(id) && !hourlyLines.has(id)
            ? "payType: owner paid by owner draws; no contract payType fits (salary would be a guess; owner-facts: no salaried)"
            : "payType: no journal hours x rate lines, no Venmo wage rows, not in m4-rules",
        );
      blocked.push({ id, reason: why.join("; ") });
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

  // ---- generic loader
  const load = (
    table: string,
    rows: Rec[],
    fix: (r: Rec) => Rec | { reasons: string[] },
  ) => {
    const out: Rec[] = [];
    for (const r of rows) {
      const f = fix(r);
      if ("reasons" in f && !("companyId" in f) && Array.isArray(f.reasons)) {
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
  const workerKnown = (id: unknown) => id == null || workerOk.has(String(id));
  /** nullable salesperson: null when the worker is blocked, recorded as unresolved (Quote/Job allow null) */
  const salesperson = (table: string, r: Rec) => {
    const id = r.salespersonWorkerId;
    if (id == null || workerKnown(id)) return id ?? null;
    unresolved[`${table}.salespersonUnresolved`] = [
      ...(unresolved[`${table}.salespersonUnresolved`] ?? []),
      String(r.id),
    ];
    return null;
  };
  const day = (d: unknown) => (isDay(d) ? String(d).slice(0, 10) : null);
  const instant = (d: unknown) =>
    isDay(d) ? startOfLocalDay(String(d).slice(0, 10), tz) : null;

  // ---- jobs: from the Jobber jobs reports (AnonJobReport); journal-label jobs are not Jobber jobs
  const jobIndex = new Map(merged("jobs").map((j) => [String(j.id), j]));
  const reports = merged("jobsReport");
  const reportedJobIds = new Set(reports.map((r) => String(r.jobId)));
  const journalLabelJobs = [...jobIndex.keys()].filter(
    (id) => !reportedJobIds.has(id),
  ).length;
  const quoteRows = merged("quotes");
  const quoteForJob = new Map<string, string>();
  for (const q of quoteRows)
    for (const j of (q.jobIds as string[] | undefined) ?? [])
      if (!quoteForJob.has(j)) quoteForJob.set(j, String(q.id));
  const seenJob = new Set<string>();
  const jobs = load("jobs", reports, (r) => {
    if (!r.jobId) return { reasons: ["id: report row has no job id"] };
    if (seenJob.has(String(r.jobId))) {
      duplicateIds++;
      return {
        reasons: [`id: job ${r.jobId} already loaded from another report row`],
      };
    }
    seenJob.add(String(r.jobId));
    const j = jobIndex.get(String(r.jobId));
    return {
      id: r.jobId,
      sourceId: r.sourceId ?? r.id,
      jobNumber: j?.jobNumber,
      title: j?.title,
      clientRef: r.clientRef ?? undefined,
      status: r.status ?? undefined,
      salespersonWorkerId: salesperson("jobs", r),
      quoteId: quoteForJob.get(String(r.jobId)) ?? null,
      parentJobId: null,
      startAt: instant(r.startDate ?? r.createdDate),
      endAt: instant(r.closedDate ?? r.endDate),
      totalCents: r.totalCents ?? null,
    };
  });
  const jobIds = new Set(jobs.map((j) => String(j.id)));
  const oneJob = (r: Rec) => {
    const ids = ((r.jobIds as string[] | undefined) ?? []).filter((x) =>
      jobIds.has(x),
    );
    return ids.length === 1 ? ids[0] : null;
  };
  // quoteId must point at a loaded quote; drop links to quotes that end up unloadable later (nullable)

  // ---- quotes / invoices (AnonQuoteReport / AnonInvoiceReport): same facts, contract names
  const quotes = load("quotes", quoteRows, (q) => ({
    id: q.id,
    sourceId: q.sourceId ?? q.id,
    jobId: oneJob(q),
    salespersonWorkerId: salesperson("quotes", q),
    sentAt: instant(q.sentDate),
    status: q.status ?? undefined,
    amountCents: q.totalCents ?? null,
  }));
  const quoteIds = new Set(quotes.map((q) => String(q.id)));
  for (const j of jobs)
    if (j.quoteId && !quoteIds.has(String(j.quoteId))) j.quoteId = null;
  const invoices = load("invoices", merged("invoices"), (v) => ({
    id: v.id,
    sourceId: v.sourceId ?? v.id,
    jobId: oneJob(v),
    issuedDate: day(v.issuedDate),
    dueDate: day(v.dueDate),
    status: v.status ?? undefined,
    totalCents: v.totalCents ?? null,
  }));
  const visits = load("visits", merged("visits"), (v) => v);

  // ---- payments from Jobber transactions (AnonTransaction): invoice-type rows are not payments
  const tx = merged("transactions", "payments");
  const invoiceTransactions = tx.filter((t) => t.kind === "invoice").length;
  const payments = load(
    "payments",
    tx.filter((t) => t.kind !== "invoice"),
    (t) => ({
      id: t.id,
      sourceId: t.sourceId ?? t.id,
      invoiceId: t.invoiceId ?? null,
      quoteId: t.quoteId ?? null,
      entryDate: day(t.date ?? t.entryDate) ?? undefined,
      amountCents: t.amountCents ?? null,
      paymentType: t.method ?? t.paymentType ?? null,
      // deposit/final are facts of the transaction type; a refund has no contract kind
      kind: t.kind === "deposit" || t.kind === "final" ? t.kind : "unknown",
    }),
  );

  // ---- expenses: QBO export lines (AnonExpense) and Jobber expense report (AnonJobberExpense)
  const kindRule = new Map(
    (rules?.rules ?? [])
      .filter((r) => r.type === "expense_account_kind" && r.status !== "off")
      .map((r) => [String(r.params.accountName), String(r.params.kind)]),
  );
  const expenseOf = (x: Rec, source: "qbo" | "jobber") => {
    if (!workerKnown(x.reimbursableToWorkerId))
      return {
        reasons: [
          `reimbursableToWorkerId: worker ${x.reimbursableToWorkerId} is blocked (null would mean "not reimbursable")`,
        ],
      };
    if (x.jobId && !jobIds.has(String(x.jobId)))
      return {
        reasons: [
          `matchedJobId: job ${x.jobId} is not loadable (null would mean "no job")`,
        ],
      };
    return {
      id: x.id,
      source,
      sourceId: x.sourceId ?? x.id,
      date: day(x.date) ?? undefined,
      amountCents: x.amountCents ?? null,
      vendor: x.vendor ?? null,
      description: null,
      accountName: x.accountName ?? null,
      customerRef: x.customerRef ?? x.clientRef ?? null,
      paymentType: x.paymentType ?? null,
      kind: kindRule.get(String(x.accountName)) ?? "unknown",
      matchedJobId: source === "jobber" ? (x.jobId ?? null) : null,
      matchConfidence: source === "jobber" && x.jobId ? 1 : null,
      reimbursableToWorkerId: x.reimbursableToWorkerId ?? null,
      reimbursementStatus: null,
    };
  };
  const expenses = [
    ...load("expenses", merged("expenses"), (x) => expenseOf(x, "qbo")),
    ...load("expenses", merged("jobberExpenses"), (x) =>
      expenseOf(x, "jobber"),
    ),
  ];
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
    else if (c === "wage" && v.direction === "out" && vWorker(v)) continue;
    else if (c !== "personal_or_unknown") {
      const k =
        c === "wage" ? "wage (direction in or no worker)" : c || "unclassified";
      venmoNotLoaded[k] = (venmoNotLoaded[k] ?? 0) + 1;
    }
  }

  // ---- time entries: ticking only as a fact; approved/payable/category never invented
  const timeEntries: Rec[] = [];
  for (const e of merged("timeEntries")) {
    const d = String(
      e.date ?? (e.startAt ? localDay(String(e.startAt), tz) : ""),
    );
    const c = cycleOf(d);
    if (!c && d && isAfterCurrent(d)) {
      afterCurrentCycle.push({
        table: "timeEntries",
        id: String(e.id),
        date: d,
      });
      continue;
    }
    const reasons: string[] = [];
    if (!workerOk.has(String(e.workerId)))
      reasons.push(`workerId: worker ${e.workerId} is blocked or unknown`);
    if (!c) reasons.push(`cycleId: date ${d || "unknown"} is in no pay period`);
    if (e.jobId && !jobIds.has(String(e.jobId)))
      reasons.push(`jobId: job ${e.jobId} not loadable`);
    if (e.category == null)
      reasons.push(
        "category: null (the Timesheets export has no timeSheetCategory column)",
      );
    const row = {
      ...e,
      cycleId: c?.id,
      ticking: e.endAt
        ? false
        : typeof e.ticking === "boolean"
          ? e.ticking
          : null,
      visitId: e.visitId ?? null,
    };
    const s = shape("timeEntries", { ...row, companyId: C }, droppedSets);
    if ("ok" in s && !reasons.length) timeEntries.push(s.ok);
    else
      unloadable.push({
        table: "timeEntries",
        id: String(e.id),
        reasons: [...reasons, ...("reasons" in s ? s.reasons : [])],
      });
  }

  // ---- past payrolls: Gusto wage rows (owner draws apart) + Venmo wage payments
  const ownerDraws: Rec[] = [];
  const pastPayrolls: Rec[] = [];
  const addPP = (id: string, row: Rec, reasons: string[]) => {
    if (reasons.length)
      return void unloadable.push({ table: "pastPayrolls", id, reasons });
    const s = shape("pastPayrolls", { id, companyId: C, ...row }, droppedSets);
    if ("ok" in s) pastPayrolls.push(s.ok);
    else unloadable.push({ table: "pastPayrolls", id, reasons: s.reasons });
  };
  for (const p of paid) {
    const c =
      cycleByPeriod(p.periodStart, p.periodEnd) ?? cycleOf(day(p.periodEnd));
    if (p.payKind === "owner_draw" || Number(p.ownerDrawCents ?? 0) > 0) {
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
    addPP(
      `pp:${p.sourceId}`,
      {
        cycleId: c?.id,
        sourceId: p.sourceId,
        workerId: p.workerId,
        paidVia:
          p.sectionKind === "off_cycle" ? "gusto_off_cycle" : "gusto_regular",
        earnings: lines,
        grossCents: p.grossCents,
      },
      reasons,
    );
  }
  for (const v of venmoWage) {
    const d = vDay(v);
    const c = cycleOf(d);
    const reasons: string[] = [];
    if (!workerOk.has(String(vWorker(v))))
      reasons.push(`workerId: worker ${vWorker(v)} is blocked or unknown`);
    if (!c) reasons.push(`cycleId: date ${d || "unknown"} is in no pay period`);
    const cents = Math.abs(Number(v.amountCents)); // Venmo "out" amounts are negative in the statement
    addPP(
      `pp:venmo:${v.id}`,
      {
        cycleId: c?.id,
        sourceId: String(v.sourceId ?? v.id),
        workerId: vWorker(v),
        paidVia: "venmo",
        earnings: [
          { name: "Hours", hours: null, rateCents: null, amountCents: cents },
        ],
        grossCents: cents,
      },
      reasons,
    );
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
  const before = (d: unknown) =>
    d == null || String(d).slice(0, 10) < o.current.start;
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
  const droppedFields = Object.fromEntries(
    Object.entries(droppedSets).map(([t, s]) => [t, [...s].sort()]),
  );
  return {
    history: pick(false),
    current: pick(true),
    unloadable,
    afterCurrentCycle,
    blocked,
    unresolved,
    ownerDraws,
    excluded: {
      personalOrUnknownVenmo,
      venmoNotLoaded,
      journalLabelJobs,
      invoiceTransactions,
      duplicateIds,
      droppedFields,
    },
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
