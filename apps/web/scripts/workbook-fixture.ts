// Writes app/_fixtures/workbook.json: the workbook for every cycle of companies A and B, until drafts.get is live.
// Open cycles: Stage 1 and Stage 2 straight from the engine (computeStage1 / computeStage2), the same way its golden
// tests run them (every proposed rule treated as approved). Closed cycles: what Gusto and Venmo actually paid
// (pastPayrolls). The web app only displays these values; it never computes pay.
// Run: bun apps/web/scripts/workbook-fixture.ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Cycle,
  computeStage1,
  computeStage2,
  type Rule,
  type Worker,
} from "@payrollpilot/engine/payroll/index";

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

const hoursOf = (
  earnings: { name: string; hours: number | null }[],
  name: string,
) => earnings.find((e) => e.name === name)?.hours ?? null;

function build(companyId: "a" | "b") {
  const company = load<{ id: string; timezone: string }>(companyId, "company");
  const seed = JSON.parse(
    readFileSync(join(ROOT, "seed/companies", `${companyId}.json`), "utf8"),
  ) as { lowMarginPct?: number };
  const cycles = load<Cycle[]>(companyId, "cycles");
  const workers = load<Worker[]>(companyId, "workers");
  const entries = load<{ cycleId: string | null }[]>(companyId, "timeEntries");
  const expenses = load<never[]>(companyId, "expenses");
  const jobs = load<{ id: string; jobNumber: number; title: string }[]>(
    companyId,
    "jobs",
  );
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
            recordId: p.id,
          })),
          totalCents: regular.reduce((s, p) => s + p.grossCents, 0),
          venmo: paid
            .filter((p) => p.paidVia === "venmo")
            .map((p) => ({
              workerId: p.workerId,
              hours: hoursOf(p.earnings, "Hours"),
              rateCents:
                p.earnings.find((e) => e.name === "Hours")?.rateCents ?? null,
              amountCents: p.grossCents,
              recordId: p.id,
            })),
          venmoHeld: [],
        },
        stage2: {
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
    const s1 = computeStage1(
      cycle,
      cycleEntries as never,
      workers,
      rules,
      { company: company as never, expenses },
    );
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
              kind: p.kind === "salary" ? ("salary" as const) : ("hourly" as const),
              regularHours: hoursOf(p.earnings, "Regular Hours"),
              overtimeHours: hoursOf(p.earnings, "Overtime"),
              rateCents: p.rateCents,
              grossCents: p.excluded ? null : p.grossCents,
              held: p.excluded || heldFlagIds.length > 0,
              reason: p.reason,
              heldFlagIds,
              recordId: s1.draft.id,
            };
          }),
        totalCents: s1.draft.totals.grossCents,
        venmo: s1.draft.venmoList.map((v) => ({
          ...v,
          recordId: s1.draft.id,
        })),
        venmoHeld: pay
          .filter((p) => p.kind === "venmo" && p.excluded)
          .map((p) => ({ workerId: p.workerId, reason: p.reason ?? "" })),
      },
      stage2: {
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
