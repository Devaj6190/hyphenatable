// Writes app/_fixtures/stage2.json: the numbers Home shows at Review the draft, Review commissions and the next
// payroll, until Stage 2 is wired to Convex (C plan section 6 (e), (h)). Everything is from the engine on
// data/fixtures/a, the same way scripts/workbook-fixture.ts runs it: proposed rules treated as approved (a preview,
// labelled in the UI). The web app never computes pay; it only formats these cents.
//   - stage2: computeStage2 for cycle 5 over every job (job profit, what is held) and over the jobs whose invoice
//     Jobber shows paid in full (what is ready to pay now).
//   - laborShare: marginHistory's revenue and labor per cycle, as a share of revenue.
//   - people: each worker's gross this cycle (the workbook preview) beside the mean of their last 3 paid payrolls.
//   - nextPayroll: an example cycle 6 run where job a-j02's customer has paid (a synthetic final payment added
//     here), so its held split is released and worked out again by computeStage2.
// Run: bun apps/web/scripts/stage2-fixture.ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Cycle,
  computeStage1,
  computeStage2,
  type Invoice,
  type Job,
  type Payment,
  type Rule,
  type Worker,
} from "@payrollpilot/engine/payroll/index";
import { marginHistory } from "@payrollpilot/engine/payroll/marginHistory";

const ROOT = join(import.meta.dirname, "../../..");
const COMPANY = "a";
const CYCLE = "a-c05";
const load = <T>(file: string): T =>
  JSON.parse(
    readFileSync(join(ROOT, "data/fixtures", COMPANY, `${file}.json`), "utf8"),
  );

type Entry = { id: string; cycleId: string | null; workerId: string };
type PastPayroll = {
  id: string;
  cycleId: string;
  workerId: string;
  paidVia: "gusto_regular" | "gusto_off_cycle" | "venmo";
  grossCents: number;
};

const company = load<{
  id: string;
  timezone: string;
  settings: { lowMarginPct: number };
}>("company");
const cycles = load<Cycle[]>("cycles");
const cycle = cycles.find((c) => c.id === CYCLE) as Cycle;
const workers = load<Worker[]>("workers");
const jobs = load<Job[]>("jobs");
const invoices = load<Invoice[]>("invoices");
const payments = load<Payment[]>("payments");
const expenses = load<never[]>("expenses");
const entries = load<Entry[]>("timeEntries");
const rules = load<Rule[]>("rules").map(
  (r): Rule => ({ ...r, status: "active" }),
);
const past = load<PastPayroll[]>("pastPayrolls");
const workbook = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../app/_fixtures/workbook.json"),
    "utf8",
  ),
) as {
  companies: Record<
    string,
    {
      cycles: {
        cycle: { id: string };
        stage1: {
          lines: {
            workerId: string;
            regularHours: number | null;
            overtimeHours: number | null;
            grossCents: number | null;
          }[];
          venmo: {
            workerId: string;
            hours: number | null;
            amountCents: number;
          }[];
          venmoHeld: { workerId: string }[];
          totalCents: number;
        };
      }[];
    }
  >;
};

const stage2Input = {
  cycle,
  company: {
    id: company.id,
    timezone: company.timezone,
    lowMarginPct: company.settings.lowMarginPct,
  },
  jobs,
  quotes: load<never[]>("quotes"),
  invoices,
  payments,
  expenses,
  entries: entries.filter((e) => e.cycleId === CYCLE) as never[],
  workers,
  rules,
};

// Paid in full: Jobber shows the invoice paid and every payment on it is a final payment (a quote deposit
// counted as final, CHK-19, is not). Exact condition, nothing inferred.
const paidInFull = (jobId: string, inv = invoices, pay = payments) =>
  inv.some(
    (i) =>
      i.jobId === jobId &&
      i.status === "paid" &&
      pay
        .filter((p) => p.invoiceId === i.id)
        .reduce((s, p) => s + p.amountCents, 0) === i.totalCents,
  );

const all = computeStage2(stage2Input);
const scope = all.report.recon.jobs.map((j) => j.jobId);
const readyJobs = scope.filter((id) => paidInFull(id));
const ready = computeStage2({ ...stage2Input, jobIds: readyJobs });
const waitingJobs = scope.filter((id) => !readyJobs.includes(id));
const jobOf = (id: string) => jobs.find((j) => j.id === id);
const recon = new Map(all.report.recon.jobs.map((j) => [j.jobId, j]));

const jobRow = (id: string) => {
  const p = all.report.profits.find((x) => x.jobId === id);
  const r = recon.get(id);
  const job = jobOf(id);
  const inv = invoices.find((i) => i.jobId === id);
  return {
    jobId: id,
    jobNumber: job?.jobNumber ?? null,
    title: job?.title ?? null,
    revenueCents: r?.revenueCents ?? null,
    costCents:
      r && r.laborCents !== null ? r.laborCents + r.jobCostCents : null,
    profitCents: p?.profitCents ?? null,
    marginPct: p?.marginPct ?? null,
    low: p?.low ?? false,
    provisional: r?.provisional ?? false,
    paidInFull: readyJobs.includes(id),
    invoiceStatus: inv?.status ?? null,
    hints: p?.hints ?? [],
  };
};

// Labor share of revenue per cycle, from the engine's reconcile. Only complete cycles count toward "usual".
const history = marginHistory({
  cycles,
  company: { id: company.id, timezone: company.timezone },
  jobs,
  invoices,
  payments,
  expenses,
  entries: entries as never[],
  workers,
  rules,
});
const share = (labor: number | null, revenue: number | null) =>
  labor === null || !revenue ? null : Math.round((labor * 1000) / revenue) / 10;
const laborCycles = history.cycles.map((c) => ({
  cycleId: c.cycleId,
  periodStart: cycles.find((x) => x.id === c.cycleId)?.periodStart ?? null,
  revenueCents: c.revenueCents,
  laborCents: c.laborCents,
  laborSharePct: share(c.laborCents, c.revenueCents),
  complete: c.complete,
}));
const pastShares = laborCycles
  .filter((c) => c.cycleId !== CYCLE && c.complete && c.laborSharePct !== null)
  .map((c) => c.laborSharePct as number);
const usualShare = pastShares.length
  ? Math.round(
      (pastShares.reduce((s, x) => s + x, 0) / pastShares.length) * 10,
    ) / 10
  : null;
// This cycle is not complete (a job has no revenue of its own), so the share is over the jobs whose revenue is
// known, and the jobs left out are listed.
const known = all.report.recon.jobs.filter(
  (j) => j.revenueCents !== null && j.laborCents !== null,
);
const nowLabor = known.reduce((s, j) => s + (j.laborCents ?? 0), 0);
const nowRevenue = known.reduce((s, j) => s + (j.revenueCents ?? 0), 0);

// Each worker's gross this cycle beside the mean of their last 3 paid payrolls (Gusto regular or Venmo).
const wb = workbook.companies[COMPANY].cycles.find((c) => c.cycle.id === CYCLE);
if (!wb)
  throw new Error(`no workbook for ${CYCLE}; run workbook-fixture.ts first`);
const closed = cycles
  .filter((c) => c.stage === "closed")
  .sort((a, b) => a.number - b.number)
  .slice(-3)
  .map((c) => c.id);
const usualOf = (workerId: string) => {
  const paid = past.filter(
    (p) =>
      p.workerId === workerId &&
      closed.includes(p.cycleId) &&
      p.paidVia !== "gusto_off_cycle",
  );
  if (paid.length < closed.length) return null;
  return Math.round(paid.reduce((s, p) => s + p.grossCents, 0) / paid.length);
};
const vs = (now: number | null, usual: number | null) =>
  now === null || !usual ? null : Math.round(((now - usual) * 100) / usual);
const people = [
  ...wb.stage1.lines.map((l) => ({
    workerId: l.workerId,
    group:
      workers.find((w) => w.id === l.workerId)?.payType === "salary"
        ? ("salary" as const)
        : ("hourly" as const),
    hours:
      l.regularHours === null ? null : l.regularHours + (l.overtimeHours ?? 0),
    overtimeHours: l.overtimeHours,
    grossCents: l.grossCents,
  })),
  ...wb.stage1.venmo.map((v) => ({
    workerId: v.workerId,
    group: "venmo" as const,
    hours: v.hours,
    overtimeHours: null,
    grossCents: v.amountCents,
  })),
  ...wb.stage1.venmoHeld.map((v) => ({
    workerId: v.workerId,
    group: "venmo" as const,
    hours: null,
    overtimeHours: null,
    grossCents: null,
  })),
].map((p) => {
  const usualCents = usualOf(p.workerId);
  return { ...p, usualCents, vsUsualPct: vs(p.grossCents, usualCents) };
});

// Example next payroll: a-j02's customer pays the balance (synthetic invoice and payment, labelled), so the
// engine works the split out again over a-j02 alone.
const deposit = payments
  .filter((p) => p.invoiceId === null && p.id === "a-pay01")
  .reduce((s, p) => s + p.amountCents, 0);
const j02 = jobOf("a-j02") as Job;
const exInvoice = {
  ...(invoices[0] as Invoice),
  id: "a-in-example-02",
  sourceId: "a-in-example-02",
  jobId: "a-j02",
  status: "paid",
  totalCents: j02.totalCents,
} as Invoice;
const exPayment = {
  ...(payments.find((p) => p.invoiceId) as Payment),
  id: "a-pay-example-02",
  sourceId: "a-pay-example-02",
  invoiceId: exInvoice.id,
  amountCents: (j02.totalCents ?? 0) - deposit,
} as Payment;
const nextInvoices = [...invoices, exInvoice];
const nextPayments = [
  ...payments.map((p) =>
    p.id === "a-pay01" ? { ...p, invoiceId: exInvoice.id, kind: "final" } : p,
  ),
  exPayment,
] as Payment[];
const releasedJobs = ["a-j02"].filter((id) =>
  paidInFull(id, nextInvoices, nextPayments),
);
const released = computeStage2({
  ...stage2Input,
  jobs: jobs.map((j) => (j.id === "a-j02" ? { ...j, status: "archived" } : j)),
  invoices: nextInvoices,
  payments: nextPayments,
  jobIds: releasedJobs,
});

// Dakota's two simulated answers become correction proposals; computeStage1 works out what each changes.
type FullEntry = Entry & { startAt: string; endAt: string | null };
const cycleEntries = entries.filter((e) => e.cycleId === CYCLE) as FullEntry[];
const stage1Of = (es: FullEntry[]) =>
  computeStage1(cycle, es as never, workers, rules, {
    company: { ...company, payFrequency: "biweekly" } as never,
    expenses,
  }).pay;
const before = stage1Of(cycleEntries);
const hoursOf = (
  pay: ReturnType<typeof stage1Of>,
  workerId: string,
  name: string,
) => pay[workerId]?.earnings.find((e) => e.name === name)?.hours ?? 0;
const PROPOSALS = [
  {
    id: "a-fix-sam",
    flagId: "a-fl-04",
    workerId: "a-w03",
    what: "a-te-0111 and a-te-0113 become one shift, 11:00 to 20:00 UTC; a-te-0113 dropped",
    apply: (es: FullEntry[]) =>
      es
        .filter((e) => e.id !== "a-te-0113")
        .map((e) =>
          e.id === "a-te-0111"
            ? { ...e, endAt: "2026-10-14T20:00:00.000Z" }
            : e,
        ),
  },
  {
    id: "a-fix-jordan",
    flagId: "a-fl-09",
    workerId: "a-w02",
    what: "duplicate a-te-0146 dropped; a-te-0106 kept",
    apply: (es: FullEntry[]) => es.filter((e) => e.id !== "a-te-0146"),
  },
];
// Hours on the day the correction touches, before and after (the flagged entries' local day).
const dayHours = (es: FullEntry[], workerId: string, dayIso: string) => {
  const local = (iso: string) => iso.slice(0, 10);
  return (
    es
      .filter(
        (e) =>
          e.workerId === workerId &&
          e.endAt &&
          local(e.startAt) === local(dayIso),
      )
      .reduce(
        (s, e) => s + (Date.parse(e.endAt as string) - Date.parse(e.startAt)),
        0,
      ) / 3_600_000
  );
};
const corrections = PROPOSALS.map(({ apply, ...p }) => {
  const changed = apply(cycleEntries);
  const after = stage1Of(changed);
  const flagged = cycleEntries.find(
    (e) => e.workerId === p.workerId && p.what.includes(e.id),
  ) as FullEntry;
  return {
    ...p,
    dayHoursBefore: dayHours(cycleEntries, p.workerId, flagged.startAt),
    dayHoursAfter: dayHours(changed, p.workerId, flagged.startAt),
    overtimeBefore: hoursOf(before, p.workerId, "Overtime"),
    overtimeAfter: hoursOf(after, p.workerId, "Overtime"),
    grossBeforeCents: before[p.workerId]?.grossCents ?? null,
    grossAfterCents: after[p.workerId]?.grossCents ?? null,
    effectPayCents:
      (after[p.workerId]?.grossCents ?? 0) -
      (before[p.workerId]?.grossCents ?? 0),
  };
});

const payout = (p: {
  workerId: string;
  name: string;
  amountCents: number;
  explain: string[];
}) => ({
  workerId: p.workerId,
  name: p.name,
  amountCents: p.amountCents,
  explain: p.explain,
});

const fixture = {
  source:
    "scripts/stage2-fixture.ts: computeStage2 and marginHistory on data/fixtures/a (proposed rules treated as approved)",
  companies: {
    [COMPANY]: {
      cycleId: CYCLE,
      stage2: {
        draftId: ready.draft.id,
        jobs: scope.map(jobRow),
        revenueCents: all.report.recon.jobs.every(
          (j) => j.revenueCents !== null,
        )
          ? all.report.recon.jobs.reduce((s, j) => s + (j.revenueCents ?? 0), 0)
          : null,
        knownRevenueCents: all.report.recon.jobs.reduce(
          (s, j) => s + (j.revenueCents ?? 0),
          0,
        ),
        totalProfitCents: all.report.totalProfitCents,
        lowMarginPct: company.settings.lowMarginPct,
        ready: {
          jobIds: readyJobs,
          payouts: ready.report.payouts.map(payout),
          totalCents: ready.draft.totals.grossCents,
        },
        waiting: { jobIds: waitingJobs, held: all.report.held },
      },
      laborShare: {
        cycles: laborCycles,
        usualPct: usualShare,
        nowPct: share(nowLabor, nowRevenue),
        nowLaborCents: nowLabor,
        nowRevenueCents: nowRevenue,
        leftOutJobIds: all.report.recon.jobs
          .filter((j) => !known.includes(j))
          .map((j) => j.jobId),
      },
      review: {
        grossCents: wb.stage1.totalCents,
        venmoCents: wb.stage1.venmo.reduce((s, v) => s + v.amountCents, 0),
        people,
      },
      corrections,
      nextPayroll: {
        cycleId: "a-c06",
        example: true,
        releasedJobIds: releasedJobs,
        released: released.report.payouts.map(payout),
        releasedTotalCents: released.draft.totals.grossCents,
        note: "a-j02 shown paid in full: a synthetic invoice a-in-example-02 and payment a-pay-example-02 are added for the example",
      },
    },
  },
};
const outFile = join(import.meta.dirname, "../app/_fixtures/stage2.json");
writeFileSync(outFile, `${JSON.stringify(fixture, null, 2)}\n`);
execFileSync("bunx", ["biome", "format", "--write", outFile], {
  stdio: "ignore",
  shell: process.platform === "win32",
});
console.log("wrote app/_fixtures/stage2.json");
