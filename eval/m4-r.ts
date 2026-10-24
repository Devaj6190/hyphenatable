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
    }),
  ),
});
export type AnonBundle = z.infer<typeof AnonBundle>;

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
    }),
  ),
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
};
export type Trail = {
  workerId: string;
  period: string;
  engineCents: number | null;
  paidCents: number | null;
  diffCents: number | null;
  explain: string[];
};
/** Counts only: what leaves data/private/ (summary.json, results.json m4.companyR). */
export const M4Summary = z.object({
  status: z.literal("measured"),
  measuredAt: z.iso.datetime(),
  rulesSource: z.enum(["owner_stated", "onboarding"]),
  periods: z.number().int(),
  notes: z.array(z.string()),
  pre: z.object({
    compared: z.number().int(),
    exact: z.number().int(),
    within100: z.number().int(),
    maxDiffCents: z.number().int(),
    unmatched: z.number().int(),
  }),
  post: z
    .object({
      compared: z.number().int(),
      exact: z.number().int(),
      within100: z.number().int(),
      maxDiffCents: z.number().int(),
      unmatched: z.number().int(),
    })
    .nullable(),
});
export type M4Summary = z.infer<typeof M4Summary>;

export type RBacktest = {
  periods: string[];
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
    const key = `${p.periodStart}..${p.periodEnd}`;
    periods.add(key);
    paidBy.set(
      `${p.workerId}|${key}`,
      (paidBy.get(`${p.workerId}|${key}`) ?? 0) + p.grossCents,
    );
  }
  const trails: Trail[] = [];
  const out: Pass = {
    compared: 0,
    exact: 0,
    within100: 0,
    maxDiffCents: 0,
    unmatched: 0,
  };
  for (const period of [...periods].sort()) {
    const [from, to] = period.split("..");
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
      out.compared++;
      if (d === 0) out.exact++;
      if (d <= 100) out.within100++;
      out.maxDiffCents = Math.max(out.maxDiffCents, d);
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
): RBacktest {
  const notes = new Set<string>();
  if (
    !setup.rules.some(
      (r) => r.type === "overtime_policy" && r.status === "active",
    )
  )
    notes.add(
      "no active overtime_policy rule: hourly workers with hours are excluded (never guessed)",
    );
  const pre = pass(bundle, setup, bundle.timeEntries, notes);
  const post = corrections
    ? pass(
        bundle,
        setup,
        applyCorrections(bundle.timeEntries, corrections),
        notes,
      )
    : null;
  return {
    periods: pre.periods,
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
