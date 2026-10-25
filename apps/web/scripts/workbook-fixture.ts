// Writes app/_fixtures/workbook.json: the workbook for every cycle of companies A and B, until drafts.get is live.
// Open cycles: Stage 1 and Stage 2 straight from the engine (computeStage1 / computeStage2), the same way its golden
// tests run them. Every rule in the fixtures is still proposed, so open-cycle totals are a preview with proposed
// rules treated as approved; the UI says so beside the totals. Closed cycles: what Gusto and Venmo actually paid
// (pastPayrolls), summed here (ponytail: move the sum into the engine). The web app never computes pay.
// Each person also gets structured fields for the workbook's breakdown: per-workweek hours split by the engine's
// own overtime functions (checked against computeStage1's earnings, the script throws on any drift), every
// earning with its hourly rate, and the salary basis. The UI reads these and never parses the explain lines.
// Run: bun apps/web/scripts/workbook-fixture.ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bucketHours,
  dayFromNumber,
  dayNumber,
  localDate,
  workweekAnchor,
} from "@payrollpilot/engine/payroll/hours";
import {
  type Cycle,
  computeStage1,
  computeStage2,
  type Rule,
  type Worker,
} from "@payrollpilot/engine/payroll/index";
import { centsFor, hours2 } from "@payrollpilot/engine/payroll/money";
import {
  parseOvertimePolicy,
  splitWeek,
} from "@payrollpilot/engine/payroll/overtime";
import { payRate } from "@payrollpilot/engine/payroll/rates";
import { PERIODS_PER_YEAR } from "@payrollpilot/engine/payroll/salaried";

const ROOT = join(import.meta.dirname, "../../..");
const load = <T>(company: string, file: string): T =>
  JSON.parse(
    readFileSync(join(ROOT, "data/fixtures", company, `${file}.json`), "utf8"),
  );

type PastPayroll = {
  id: string;
  cycleId: string;
  workerId: string;
  paidVia: "gusto_regular" | "gusto_off_cycle" | "venmo";
  earnings: {
    name: string;
    hours: number | null;
    rateCents: number | null;
    amountCents: number;
  }[];
  grossCents: number;
};

/** One earning as the workbook shows it. `hourRateCents` is what one hour of it pays (rate × multiplier). */
type EarningLine = {
  name: string;
  seconds: number | null;
  hours: number | null;
  hourRateCents: number | null;
  multiplier: number | null;
  amountCents: number;
};

const sumHours = (hs: (number | null)[]) =>
  Math.round(hs.reduce<number>((s, h) => s + (h ?? 0) * 100, 0)) / 100;

const OVERTIME = ["Overtime", "Double Overtime"];

const hoursOf = (
  earnings: { name: string; hours: number | null }[],
  name: string,
) => earnings.find((e) => e.name === name)?.hours ?? null;

function build(companyId: "a" | "b") {
  const company = load<{
    id: string;
    timezone: string;
    payFrequency: keyof typeof PERIODS_PER_YEAR;
  }>(companyId, "company");
  const seed = JSON.parse(
    readFileSync(join(ROOT, "seed/companies", `${companyId}.json`), "utf8"),
  ) as { lowMarginPct?: number };
  const cycles = load<Cycle[]>(companyId, "cycles");
  const workers = load<Worker[]>(companyId, "workers");
  const entries = load<
    { id: string; cycleId: string | null; workerId: string }[]
  >(companyId, "timeEntries");
  const expenses = load<never[]>(companyId, "expenses");
  const jobs = load<{ id: string; jobNumber: number; title: string }[]>(
    companyId,
    "jobs",
  );
  // Preview: proposed rules treated as approved, as the engine's golden tests do. Labelled in the UI.
  const rules = load<Rule[]>(companyId, "rules").map(
    (r): Rule => ({ ...r, status: "active" }),
  );
  const past = load<PastPayroll[]>(companyId, "pastPayrolls");
  const syncRuns = load<
    {
      id: string;
      cycleId: string;
      source: string;
      object: string;
      pulled: number;
      expected: number;
      complete: boolean;
    }[]
  >(companyId, "syncRuns");

  const out = cycles.map((cycle) => {
    const base = {
      cycle: {
        id: cycle.id,
        number: cycle.number,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        stage: cycle.stage,
        questionsAsked: cycle.questionsAsked,
        gustoPayrollId: cycle.gustoPayrollId,
      },
      syncRuns: syncRuns
        .filter((s) => s.cycleId === cycle.id)
        .map(({ id, source, object, pulled, expected, complete }) => ({
          id,
          source,
          object,
          pulled,
          expected,
          complete,
        })),
    };

    if (cycle.stage === "closed") {
      const paid = past.filter((p) => p.cycleId === cycle.id);
      const regular = paid.filter((p) => p.paidVia === "gusto_regular");
      return {
        ...base,
        basis: "paid" as const,
        draftId: null,
        draftStatus: null,
        stage1: {
          lines: regular.map((p) => ({
            workerId: p.workerId,
            kind: p.earnings.some((e) => e.name === "Salary")
              ? ("salary" as const)
              : ("hourly" as const),
            regularHours: hoursOf(p.earnings, "Regular Hours"),
            overtimeHours: hoursOf(p.earnings, "Overtime"),
            rateCents:
              p.earnings.find((e) =>
                ["Regular Hours", "Salary"].includes(e.name),
              )?.rateCents ?? null,
            grossCents: p.grossCents,
            held: false,
            reason: null,
            heldFlagIds: [],
            recordSystem: "Gusto" as const,
            recordId: p.id,
            loggedHours: sumHours(p.earnings.map((e) => e.hours)),
            // As Gusto paid it: its Overtime rate is already the overtime rate.
            earnings: p.earnings.map(
              (e): EarningLine => ({
                name: e.name,
                seconds: null,
                hours: e.hours,
                hourRateCents: e.hours === null ? null : e.rateCents,
                multiplier: null,
                amountCents: e.amountCents,
              }),
            ),
            weeks: null,
            salary: null,
          })),
          totalCents: regular.reduce((s, p) => s + p.grossCents, 0),
          overtime: null,
          totals: {
            hours: sumHours(
              regular.flatMap((p) => p.earnings.map((e) => e.hours)),
            ),
            overtimeHours: sumHours(
              regular.flatMap((p) =>
                p.earnings
                  .filter((e) => OVERTIME.includes(e.name))
                  .map((e) => e.hours),
              ),
            ),
            venmoCents: paid
              .filter((p) => p.paidVia === "venmo")
              .reduce((s, p) => s + p.grossCents, 0),
          },
          venmo: paid
            .filter((p) => p.paidVia === "venmo")
            .map((p) => ({
              workerId: p.workerId,
              hours: hoursOf(p.earnings, "Hours"),
              rateCents:
                p.earnings.find((e) => e.name === "Hours")?.rateCents ?? null,
              amountCents: p.grossCents,
              recordSystem: "Gusto" as const,
              recordId: p.id,
            })),
          venmoHeld: [],
        },
        stage2: {
          draftId: null,
          lines: paid
            .filter((p) => p.paidVia === "gusto_off_cycle")
            .flatMap((p) =>
              p.earnings.map((e) => ({
                workerId: p.workerId,
                name: e.name,
                amountCents: e.amountCents,
                recordId: p.id,
              })),
            ),
          totalCents: paid
            .filter((p) => p.paidVia === "gusto_off_cycle")
            .reduce((s, p) => s + p.grossCents, 0),
          held: [],
        },
        jobs: null,
        totalProfitCents: null,
      };
    }

    const cycleEntries = entries.filter((e) => e.cycleId === cycle.id);
    // A line traces to the worker's time entries; a line with none (salary) to its draft line.
    const sourceOf = (draftId: string, workerId: string) => {
      const ids = cycleEntries
        .filter((e) => e.workerId === workerId)
        .map((e) => e.id);
      return ids.length > 0
        ? { recordSystem: "Jobber" as const, recordId: ids.join(", ") }
        : {
            recordSystem: "Workbook" as const,
            recordId: `${draftId}/${workerId}`,
          };
    };
    const s1 = computeStage1(cycle, cycleEntries as never, workers, rules, {
      company: company as never,
      expenses,
    });
    const s2 = computeStage2({
      cycle,
      company: {
        id: company.id,
        timezone: company.timezone,
        lowMarginPct: seed.lowMarginPct ?? null,
      },
      jobs: jobs as never,
      quotes: load(companyId, "quotes"),
      invoices: load(companyId, "invoices"),
      payments: load(companyId, "payments"),
      expenses,
      entries: cycleEntries as never,
      workers,
      rules,
    });
    const pay = Object.values(s1.pay);

    // Per-workweek split, with the same engine functions and inputs computeStage1 used (no held entries here).
    const tz = company.timezone;
    const ot = parseOvertimePolicy(rules);
    const startDay = localDate(cycle.periodStart, tz);
    const endDay = localDate(cycle.periodEnd, tz);
    const { anchor } = workweekAnchor(
      startDay,
      ot.ok ? ot.policy.workweek : null,
    );
    const { byWorker } = bucketHours(cycleEntries as never, {
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      timeZone: tz,
      anchor,
      held: new Set(),
    });
    const weekStarts: number[] = [];
    for (let d = anchor; d <= dayNumber(endDay); d += 7) weekStarts.push(d);
    const loggedHours = (workerId: string) =>
      hours2(byWorker.get(workerId)?.seconds ?? 0);
    const weeksOf = (p: (typeof pay)[number]) => {
      if (p.kind !== "hourly" || p.excluded || !ot.ok) return null;
      const policy = ot.policy;
      const weeks = weekStarts.map((d) => {
        const days =
          byWorker.get(p.workerId)?.weeks.get(dayFromNumber(d)) ?? new Map();
        const split = splitWeek(days, policy);
        const seconds = [...days.values()].reduce((a, b) => a + b, 0);
        return {
          start: dayFromNumber(Math.max(d, dayNumber(startDay))),
          end: dayFromNumber(Math.min(d + 6, dayNumber(endDay))),
          seconds,
          hours: hours2(seconds),
          regularSeconds: split["Regular Hours"],
          regularHours: hours2(split["Regular Hours"]),
          overtimeSeconds: split.Overtime,
          overtimeHours: hours2(split.Overtime),
          doubleOvertimeSeconds: split["Double Overtime"],
          doubleOvertimeHours: hours2(split["Double Overtime"]),
        };
      });
      const keys = {
        "Regular Hours": "regularSeconds",
        Overtime: "overtimeSeconds",
        "Double Overtime": "doubleOvertimeSeconds",
      } as const;
      for (const [name, key] of Object.entries(keys)) {
        const fromWeeks = weeks.reduce((s, w) => s + w[key], 0);
        const fromEngine =
          p.earnings.find((e) => e.name === name)?.seconds ?? 0;
        if (fromWeeks !== fromEngine)
          throw new Error(
            `${cycle.id} ${p.workerId}: weeks give ${fromWeeks}s of ${name}, computeStage1 ${fromEngine}s`,
          );
      }
      return weeks;
    };
    const salaryOf = (p: (typeof pay)[number]) => {
      const worker = workers.find((w) => w.id === p.workerId);
      if (p.kind !== "salary" || p.excluded || !worker) return null;
      const rate = payRate(worker, rules);
      return rate.ok
        ? {
            rateCents: rate.rateCents,
            unit: rate.unit,
            periodsPerYear: PERIODS_PER_YEAR[company.payFrequency],
          }
        : null;
    };
    const earningsOf = (p: (typeof pay)[number]): EarningLine[] =>
      p.earnings.map((e) => ({
        name: e.name,
        seconds: e.seconds,
        hours: e.hours,
        hourRateCents:
          e.seconds === null ? null : centsFor(3600, e.rateCents, e.multiplier),
        multiplier: e.seconds === null ? null : e.multiplier,
        amountCents: e.amountCents,
      }));
    const gusto = pay.filter((p) => p.kind !== "venmo" && !p.excluded);
    const recon = new Map(s2.report.recon.jobs.map((j) => [j.jobId, j]));
    return {
      ...base,
      basis: "engine" as const,
      draftId: s1.draft.id,
      draftStatus: s1.draft.status,
      stage1: {
        lines: pay
          .filter((p) => p.kind !== "venmo")
          .map((p) => {
            const heldFlagIds =
              s1.draft.lines.find((l) => l.workerId === p.workerId)
                ?.heldFlagIds ?? [];
            return {
              workerId: p.workerId,
              kind:
                p.kind === "salary" ? ("salary" as const) : ("hourly" as const),
              regularHours: hoursOf(p.earnings, "Regular Hours"),
              overtimeHours: hoursOf(p.earnings, "Overtime"),
              rateCents: p.rateCents,
              grossCents: p.excluded ? null : p.grossCents,
              held: p.excluded || heldFlagIds.length > 0,
              reason: p.reason,
              heldFlagIds,
              ...sourceOf(s1.draft.id, p.workerId),
              loggedHours: loggedHours(p.workerId),
              earnings: earningsOf(p),
              weeks: weeksOf(p),
              salary: salaryOf(p),
            };
          }),
        totalCents: s1.draft.totals.grossCents,
        overtime: ot.ok
          ? {
              ruleId: ot.policy.ruleId,
              weekly: ot.policy.weekly && {
                overHours: ot.policy.weekly.overSec / 3600,
                multiplier: ot.policy.weekly.multiplier,
              },
              daily: ot.policy.daily.map((d) => ({
                overHours: d.overSec / 3600,
                multiplier: d.multiplier,
              })),
            }
          : null,
        totals: {
          hours: s1.draft.totals.hours,
          overtimeHours: sumHours(
            gusto.flatMap((p) =>
              p.earnings
                .filter((e) => OVERTIME.includes(e.name))
                .map((e) => e.hours),
            ),
          ),
          venmoCents: s1.draft.venmoList.reduce((s, v) => s + v.amountCents, 0),
        },
        venmo: s1.draft.venmoList.map((v) => ({
          ...v,
          ...sourceOf(s1.draft.id, v.workerId),
        })),
        venmoHeld: pay
          .filter((p) => p.kind === "venmo" && p.excluded)
          .map((p) => ({
            workerId: p.workerId,
            reason: p.reason ?? "",
            hours: loggedHours(p.workerId),
          })),
      },
      stage2: {
        draftId: s2.draft.id,
        lines: [...s2.report.payouts, ...s2.report.venmoTips].map((p) => ({
          workerId: p.workerId,
          name: p.name,
          amountCents: p.amountCents,
          recordId: s2.draft.id,
        })),
        totalCents: s2.draft.totals.grossCents,
        held: s2.report.held,
      },
      totalProfitCents: s2.report.totalProfitCents,
      jobs: s2.report.profits.map((p) => {
        const r = recon.get(p.jobId);
        const job = jobs.find((j) => j.id === p.jobId);
        return {
          jobId: p.jobId,
          jobNumber: job?.jobNumber ?? null,
          title: job?.title ?? null,
          revenueCents: r?.revenueCents ?? null,
          laborCents: r?.laborCents ?? null,
          jobCostCents: r?.jobCostCents ?? null,
          profitCents: p.profitCents,
          marginPct: p.marginPct,
          low: p.low,
          provisional: r?.provisional ?? false,
          hints: p.hints,
        };
      }),
      lowMarginPct: seed.lowMarginPct ?? null,
    };
  });

  return {
    workers: Object.fromEntries(
      workers.map((w) => [w.id, { name: w.displayName, payType: w.payType }]),
    ),
    cycles: out,
  };
}

const fixture = {
  source:
    "engine on data/fixtures for open cycles (proposed rules treated as approved); Gusto and Venmo records for closed cycles",
  companies: { a: build("a"), b: build("b") },
};
const outFile = join(import.meta.dirname, "../app/_fixtures/workbook.json");
writeFileSync(outFile, `${JSON.stringify(fixture, null, 2)}\n`);
// Same layout as the repo's formatter, so a re-run shows only real changes.
execFileSync("bunx", ["biome", "format", "--write", outFile], {
  stdio: "ignore",
  shell: process.platform === "win32",
});
console.log("wrote app/_fixtures/workbook.json");
