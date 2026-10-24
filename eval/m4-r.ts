// M4 Company R backtest (A-12): Stage 1 gross per pseudonymous worker and pay period, from ingest-r's
// anonymized output, vs what was actually paid (Gusto Payroll Journal gross). Reported before and after the
// owner's corrections. Pure: takes data, returns counts plus explain trails; the CLI (m4-r-run.ts) does the IO
// and writes trails only under data/private/.
import { computeStage1 } from "@payrollpilot/engine/payroll/stage1";
import type {
  Cycle,
  Rule,
  TimeEntry,
  Worker,
} from "@payrollpilot/engine/payroll/types";
import { z } from "zod";

const Id = z.string().regex(/^[A-Za-z0-9:_#.-]{1,80}$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** ingest-r's AnonymizedBundle (packages/connectors/src/anonymize.ts), the fields M4 reads. */
export const AnonBundle = z.object({
  namesAnonymized: z.literal(true),
  companyId: z.string(),
  workers: z.array(z.object({ id: Id, displayName: z.string() })),
  timeEntries: z.array(
    z.object({
      id: Id,
      workerId: Id,
      jobId: Id.nullable(),
      startAt: z.string().nullable(),
      endAt: z.string().nullable(),
      durationSec: z.number().int().min(0),
      approved: z.boolean().nullable(),
      payable: z.boolean().nullable(),
      category: z.string().nullable(),
      date: Day,
    }),
  ),
  paid: z.array(
    z.object({
      workerId: Id,
      periodStart: Day.nullable(),
      periodEnd: Day.nullable(),
      grossCents: z.number().int(),
      sourceId: z.string(),
      /** sectioned journal only: regular vs off-cycle, wage vs owner draw, per pay-type amounts and hours */
      sectionKind: z.enum(["regular", "off_cycle", "other"]).optional(),
      payKind: z.enum(["wage", "owner_draw"]).optional(),
      earningsCents: z.record(z.string(), z.number().int()).optional(),
      hours: z.record(z.string(), z.number()).optional(),
      ratesCents: z.record(z.string(), z.number().int()).optional(),
    }),
  ),
});
export type AnonBundle = z.infer<typeof AnonBundle>;

/** Pay types that are Stage 2 money (commission, bonus, profit share, tips) or not wages: never part of M4. */
export const STAGE2_PAY_TYPE =
  /commission|bonus|profit|tip|reimburs|correction/i;

/** What a paid row contributes to the Stage 1 comparison: regular sections, wages, Stage 1 pay types only. */
export function stage1PaidCents(p: AnonBundle["paid"][number]): {
  cents: number;
  leftOutCents: number;
} {
  if (
    p.payKind === "owner_draw" ||
    (p.sectionKind && p.sectionKind !== "regular")
  )
    return { cents: 0, leftOutCents: p.grossCents };
  if (!p.earningsCents) return { cents: p.grossCents, leftOutCents: 0 };
  let cents = 0;
  let leftOutCents = 0;
  for (const [name, v] of Object.entries(p.earningsCents))
    if (STAGE2_PAY_TYPE.test(name)) leftOutCents += v;
    else cents += v;
  return { cents, leftOutCents };
}

/** data/private/r/m4-rules.json: how Company R pays, as stated by the owner or proposed by onboarding. */
export const RSetup = z.object({
  source: z.enum(["owner_stated", "onboarding"]),
  timezone: z.string(),
  payFrequency: z.enum(["weekly", "biweekly"]),
  workers: z.array(
    z.object({
      id: Id,
      payType: z.enum(["hourly", "salary", "contractor_venmo", "commission"]),
      rateCents: z.number().int().positive().nullable(),
      paymentUnit: z
        .enum(["Hour", "Year", "Month", "Week", "Paycheck"])
        .nullable(),
      /** Several regular rates in the journal (rate depends on the job role, which timesheets don't carry). */
      multiRate: z.boolean().optional(),
      rates: z.array(z.number().int().positive()).optional(),
    }),
  ),
  /** Workers M4 does not compare, each with a reason (e.g. "paid outside Gusto"). */
  excluded: z.array(z.object({ id: Id, reason: z.string() })).optional(),
  /** Section 6 rules; at least an active overtime_policy. */
  rules: z.array(
    z.object({
      id: Id,
      companyId: z.string(),
      type: z.string(),
      params: z.record(z.string(), z.unknown()),
      status: z.enum(["proposed", "active", "off"]),
    }),
  ),
});
export type RSetup = z.infer<typeof RSetup>;

/** data/private/r/corrections.json: the owner's register corrections as section 6 Correction targets. */
export const RCorrections = z.array(
  z.object({
    id: Id,
    target: z.object({
      table: z.literal("timeEntries"),
      id: Id,
      field: z.enum([
        "durationSec",
        "workerId",
        "date",
        "payable",
        "category",
        "deleted",
      ]),
    }),
    after: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
);
export type RCorrections = z.infer<typeof RCorrections>;

export type Pass = {
  compared: number;
  exact: number;
  within100: number;
  maxDiffCents: number;
  /** Worker-periods paid with no engine line, or computed with nothing paid. */
  unmatched: number;
  /** Of within100: differences explainable by Jobber's 2-dp per-entry rounding (≤ 0.005 h × entries × rate). */
  withinRounding: number;
  /** Worker-periods not compared, by reason. */
  separate: Record<string, number>;
  perPeriod: PeriodStats[];
};
export type PeriodStats = {
  period: string;
  coverage: Coverage;
  compared: number;
  exact: number;
  within100: number;
  withinRounding: number;
  maxDiffCents: number;
};
export type Coverage = "full" | "partial" | "none";
/** The timesheet export's date window (local dates, inclusive). */
export type Window = { from: string; to: string; source: "entries" | "given" };

export const OUTSIDE_WINDOW = "outside the timesheet export window";

/** A pay period is compared only when it lies fully inside the timesheet export window. */
export function coverageOf(from: string, to: string, w: Window): Coverage {
  if (from >= w.from && to <= w.to) return "full";
  if (to < w.from || from > w.to) return "none";
  return "partial";
}

/** The export window: given (from SyncRun / export metadata), else the min and max entry date. */
export function exportWindow(
  entries: { date: string }[],
  given?: { from?: string; to?: string },
): Window | null {
  if (given?.from && given?.to)
    return { from: given.from, to: given.to, source: "given" };
  if (!entries.length) return null;
  const ds = entries.map((e) => e.date).sort();
  return {
    from: given?.from ?? ds[0],
    to: given?.to ?? (ds.at(-1) as string),
    source: "entries",
  };
}
export type Trail = {
  workerId: string;
  period: string;
  engineCents: number | null;
  paidCents: number | null;
  diffCents: number | null;
  explain: string[];
};
/** Counts only: what leaves data/private/ (summary.json, results.json m4.companyR). */
/** Reported separately: the journal shows several rates for the worker and timesheets don't say which applies. */
export const MULTI_RATE = "rate depends on job role, not in timesheets";

const Counts = {
  compared: z.number().int(),
  exact: z.number().int(),
  within100: z.number().int(),
  withinRounding: z.number().int(),
  maxDiffCents: z.number().int(),
};
const PassSchema = z.object({
  ...Counts,
  unmatched: z.number().int(),
  perPeriod: z.array(
    z.object({
      period: z.string(),
      coverage: z.enum(["full", "partial", "none"]),
      ...Counts,
    }),
  ),
  /** Worker-periods not compared, by reason (paid outside Gusto, rate depends on job role, ...). */
  separate: z.record(z.string(), z.number().int()),
});

export const M4Summary = z.object({
  status: z.literal("measured"),
  measuredAt: z.iso.datetime(),
  rulesSource: z.enum(["owner_stated", "onboarding"]),
  periods: z.number().int(),
  window: z
    .object({
      from: z.string(),
      to: z.string(),
      source: z.enum(["entries", "given"]),
    })
    .nullable(),
  coverage: z.object({
    full: z.number().int(),
    partial: z.number().int(),
    none: z.number().int(),
  }),
  notes: z.array(z.string()),
  pre: PassSchema,
  post: PassSchema.nullable(),
});
export type M4Summary = z.infer<typeof M4Summary>;

export type RBacktest = {
  periods: string[];
  window: Window | null;
  coverage: Record<Coverage, number>;
  notes: string[];
  pre: Pass;
  post: Pass | null;
  trails: { pre: Trail[]; post: Trail[] };
};

/** The UTC instant of local midnight on `day` in `tz`. */
export function localMidnight(day: string, tz: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      f.formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    const asUtc = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    t += Date.UTC(y, m - 1, d) - asUtc;
  }
  return t;
}

const addDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

function toEngine(bundle: AnonBundle, setup: RSetup, notes: Set<string>) {
  const workers: Worker[] = setup.workers.map((w) => ({
    id: w.id,
    companyId: bundle.companyId,
    displayName: w.id,
    role: "field",
    payType: w.payType,
    status: "active",
    managerId: null,
    contactRef: null,
    jobber: null,
    gusto:
      w.payType === "contractor_venmo"
        ? null
        : {
            employeeUuid: w.id,
            contractorUuid: null,
            jobUuid: null,
            rateCents: w.rateCents,
            paymentUnit: w.paymentUnit,
            flsaStatus: null,
            onboarded: true,
          },
    venmoRateCents: w.payType === "contractor_venmo" ? w.rateCents : null,
  }));
  const entries = (es: AnonBundle["timeEntries"]): TimeEntry[] =>
    es.map((e) => {
      if (e.startAt === null)
        notes.add(
          "some entries have no start time; placed at local noon of their date (never trimmed)",
        );
      if (e.payable === null)
        notes.add(
          "payable is unknown in the export; entries counted as worked",
        );
      return {
        id: e.id,
        companyId: bundle.companyId,
        cycleId: null,
        sourceId: e.id,
        workerId: e.workerId,
        jobId: e.jobId,
        visitId: null,
        startAt:
          e.startAt ??
          new Date(
            localMidnight(e.date, setup.timezone) + 12 * 3600_000,
          ).toISOString(),
        endAt: e.endAt,
        durationSec: e.durationSec,
        ticking: false,
        approved: e.approved ?? true,
        approvedBy: null,
        payable: e.payable ?? true,
        category: e.category ?? "GENERAL",
        label: null,
        hasNote: false,
      };
    });
  return { workers, entries: entries(bundle.timeEntries) };
}

export function applyCorrections(
  es: AnonBundle["timeEntries"],
  cs: RCorrections,
): AnonBundle["timeEntries"] {
  const byId = new Map(es.map((e) => [e.id, { ...e }]));
  const deleted = new Set<string>();
  for (const c of cs) {
    const e = byId.get(c.target.id);
    if (!e) throw new Error(`correction ${c.id}: no entry ${c.target.id}`);
    const f = c.target.field;
    if (f === "deleted") {
      if (c.after === true) deleted.add(e.id);
    } else if (f === "durationSec" && typeof c.after === "number")
      e.durationSec = c.after;
    else if (f === "date" && typeof c.after === "string") {
      // a moved day: the old clock times no longer apply; it is placed at local noon of the new day
      e.date = c.after;
      e.startAt = null;
      e.endAt = null;
    } else if (
      (f === "workerId" || f === "category") &&
      typeof c.after === "string"
    )
      e[f] = c.after;
    else if (f === "payable" && typeof c.after === "boolean")
      e.payable = c.after;
    else throw new Error(`correction ${c.id}: bad value for ${f}`);
  }
  return [...byId.values()].filter((e) => !deleted.has(e.id));
}

function pass(
  bundle: AnonBundle,
  setup: RSetup,
  es: AnonBundle["timeEntries"],
  notes: Set<string>,
  window: Window,
) {
  const { workers, entries } = toEngine(
    { ...bundle, timeEntries: es },
    setup,
    notes,
  );
  const rules = setup.rules as Rule[];
  const paidBy = new Map<string, number>();
  const periods = new Set<string>();
  for (const p of bundle.paid) {
    if (!p.periodStart || !p.periodEnd) {
      notes.add("some paid rows have no pay period and are left out");
      continue;
    }
    const { cents, leftOutCents } = stage1PaidCents(p);
    if (leftOutCents > 0)
      notes.add(
        "Stage 2 pay types (commission, bonus, profit share, tips), off-cycle sections and owner draws are left out of the Stage 1 comparison",
      );
    if (
      p.payKind === "owner_draw" ||
      (p.sectionKind && p.sectionKind !== "regular")
    )
      continue;
    const key = `${p.periodStart}..${p.periodEnd}`;
    periods.add(key);
    paidBy.set(
      `${p.workerId}|${key}`,
      (paidBy.get(`${p.workerId}|${key}`) ?? 0) + cents,
    );
  }
  const excluded = new Map((setup.excluded ?? []).map((x) => [x.id, x.reason]));
  for (const w of setup.workers)
    if (w.multiRate) excluded.set(w.id, MULTI_RATE);
  const trails: Trail[] = [];
  const out: Pass = {
    compared: 0,
    exact: 0,
    within100: 0,
    maxDiffCents: 0,
    unmatched: 0,
    withinRounding: 0,
    separate: {},
    perPeriod: [],
  };
  const rateOf = new Map(setup.workers.map((w) => [w.id, w.rateCents]));
  for (const period of [...periods].sort()) {
    const [from, to] = period.split("..");
    const coverage = coverageOf(from, to, window);
    const pp: PeriodStats = {
      period,
      coverage,
      compared: 0,
      exact: 0,
      within100: 0,
      withinRounding: 0,
      maxDiffCents: 0,
    };
    out.perPeriod.push(pp);
    if (coverage !== "full") {
      // Pay periods the timesheet export does not fully cover would compare a partial week with a full paycheck.
      for (const k of paidBy.keys())
        if (k.endsWith(`|${period}`))
          out.separate[OUTSIDE_WINDOW] =
            (out.separate[OUTSIDE_WINDOW] ?? 0) + 1;
      continue;
    }
    const cycle: Cycle = {
      id: `r:${period}`,
      companyId: bundle.companyId,
      number: 0,
      periodStart: new Date(localMidnight(from, setup.timezone)).toISOString(),
      periodEnd: new Date(
        localMidnight(addDay(to), setup.timezone) - 1,
      ).toISOString(),
      cutoffAt: new Date(
        localMidnight(addDay(to), setup.timezone),
      ).toISOString(),
      stage: "closed",
      gustoPayrollId: null,
      gustoOffCyclePayrollId: null,
      questionsAsked: 0,
    };
    const r = computeStage1(cycle, entries, workers, rules, {
      company: {
        id: bundle.companyId,
        timezone: setup.timezone,
        payFrequency: setup.payFrequency,
      },
    });
    const ids = new Set([
      ...[...paidBy.keys()]
        .filter((k) => k.endsWith(`|${period}`))
        .map((k) => k.split("|")[0]),
      // Venmo pay is not in the Gusto journal, so it is not compared
      ...Object.values(r.pay)
        .filter((p) => p.kind !== "venmo" && (p.grossCents > 0 || p.excluded))
        .filter((p) => r.draft.lines.some((l) => l.workerId === p.workerId))
        .map((p) => p.workerId),
    ]);
    for (const workerId of [...ids].sort()) {
      const why = excluded.get(workerId);
      if (why) {
        out.separate[why] = (out.separate[why] ?? 0) + 1;
        continue;
      }
      const paid = paidBy.get(`${workerId}|${period}`) ?? null;
      const p = r.pay[workerId];
      const engine = p && !p.excluded ? p.grossCents : null;
      const explain = [
        ...(r.explain[workerId] ?? []),
        ...(p?.reason ? [`reason: ${p.reason}`] : []),
      ];
      if (paid === null || engine === null) {
        out.unmatched++;
        trails.push({
          workerId,
          period,
          engineCents: engine,
          paidCents: paid,
          diffCents: null,
          explain,
        });
        continue;
      }
      const d = Math.abs(engine - paid);
      // Jobber rounds each entry to 0.01 h, so a payroll built from it can differ by up to 0.005 h per entry
      // at the worker's rate (times the highest multiplier the worker earned in the period).
      const t0 = Date.parse(cycle.periodStart);
      const t1 = Date.parse(cycle.periodEnd);
      const n = entries.filter(
        (e) =>
          e.workerId === workerId &&
          Date.parse(e.startAt) >= t0 &&
          Date.parse(e.startAt) <= t1,
      ).length;
      const rate = rateOf.get(workerId) ?? p?.rateCents ?? 0;
      const mult = Math.max(
        1,
        ...(p?.earnings ?? [])
          .filter((x) => (x.seconds ?? 0) > 0)
          .map((x) => x.multiplier),
      );
      const rounding = d > 0 && d <= 100 && d <= 0.005 * n * rate * mult;
      for (const s of [out, pp]) {
        s.compared++;
        if (d === 0) s.exact++;
        if (d <= 100) s.within100++;
        if (rounding) s.withinRounding++;
        s.maxDiffCents = Math.max(s.maxDiffCents, d);
      }
      trails.push({
        workerId,
        period,
        engineCents: engine,
        paidCents: paid,
        diffCents: engine - paid,
        explain,
      });
    }
  }
  return { out, trails, periods: [...periods].sort() };
}

export function backtestR(
  bundle: AnonBundle,
  setup: RSetup,
  corrections: RCorrections | null,
  /** The timesheet export's window, from SyncRun / export metadata; default: min and max entry date. */
  given?: { from?: string; to?: string },
): RBacktest {
  const notes = new Set<string>();
  const window = exportWindow(bundle.timeEntries, given) ?? {
    from: "9999-12-31",
    to: "0000-01-01",
    source: "entries" as const,
  };
  if (!bundle.timeEntries.length)
    notes.add(
      "no time entries: no pay period is covered by a timesheet export",
    );
  if (
    !setup.rules.some(
      (r) => r.type === "overtime_policy" && r.status === "active",
    )
  )
    notes.add(
      "no active overtime_policy rule: hourly workers with hours are excluded (never guessed)",
    );
  const pre = pass(bundle, setup, bundle.timeEntries, notes, window);
  const post = corrections
    ? pass(
        bundle,
        setup,
        applyCorrections(bundle.timeEntries, corrections),
        notes,
        window,
      )
    : null;
  const coverage: Record<Coverage, number> = { full: 0, partial: 0, none: 0 };
  for (const p of pre.out.perPeriod) coverage[p.coverage]++;
  return {
    periods: pre.periods,
    window: bundle.timeEntries.length || given?.from ? window : null,
    coverage,
    notes: [...notes].sort(),
    pre: pre.out,
    post: post?.out ?? null,
    trails: { pre: pre.trails, post: post?.trails ?? [] },
  };
}

/** Merge several ingest-r out files (exports and API pulls) by id. */
export function mergeBundles(bundles: AnonBundle[]): AnonBundle {
  if (!bundles.length) throw new Error("no ingest-r output");
  const uniq = <T>(xs: T[], key: (x: T) => string) => [
    ...new Map(xs.map((x) => [key(x), x])).values(),
  ];
  return {
    namesAnonymized: true,
    companyId: bundles[0].companyId,
    workers: uniq(
      bundles.flatMap((b) => b.workers),
      (w) => w.id,
    ),
    timeEntries: uniq(
      bundles.flatMap((b) => b.timeEntries),
      (e) => e.id,
    ),
    paid: uniq(
      bundles.flatMap((b) => b.paid),
      (p) => p.sourceId,
    ),
  };
}
