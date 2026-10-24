// Seed generator: writes data/fixtures/<company>/*.json (shared-context section 6 shapes) and the answer key.
//
//   bun run seed/generate.ts --company a [--out <dir>]
//
// Deterministic: the same config and code always produce byte-identical files (seed/__tests__ checks a hash).
// Past cycles follow the company's rules and stay clean; the current cycle gets the planted errors from
// seed/lib/plant.ts. Never invents a rate the config does not give; unknowns stay null.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ConfigB, generateB } from "./lib/company-b";
import { must } from "./lib/must";
import { JOBBER_EXPENSE_TITLES, STREETS, VENDORS, WORK } from "./lib/names";
import { buildAnswerKey, plantCurrent } from "./lib/plant";
import { rng } from "./lib/random";
import {
  addDays,
  DAY_MS,
  local,
  seconds,
  shortDate,
  weekday,
  workdays,
} from "./lib/time";

// ---------------------------------------------------------------- types

export type Rec = Record<string, unknown>;
type WorkerCfg = {
  n: number;
  name: string;
  role: string;
  payType: string;
  status?: string;
  jobberStatus?: string;
  jobberRate: number | null;
  gustoRate?: number;
  venmoRate?: number | null;
  onboarded?: boolean;
  rates?: Record<string, number>;
  jobberRates?: Record<string, number>;
  firstCycle?: string;
  /** Real Gusto demo uuids, written by `seed/push-gusto.ts --apply-map`; fake placeholders until then. */
  gustoIds?: { employeeUuid: string; jobUuid: string | null };
};
type CycleCfg = {
  id: string;
  number: number;
  start: string;
  end: string;
  current?: boolean;
};
export type Config = {
  seed: string;
  company: {
    id: string;
    name: string;
    kind: string;
    payFrequency: string;
    timezone: string;
    settings: Rec;
  };
  lowMarginPct: number;
  holidays: string[];
  cycles: CycleCfg[];
  workers: WorkerCfg[];
  shift: { start: string; end: string };
  past: {
    daysPerCycle: Record<string, number>;
    shiftEnd: Record<string, string>;
    jobsPerCycle: number;
    marginRange: [number, number];
    lightingJob: Record<string, number>;
    disposalSubJob: Record<string, number>;
    tip: { cycle: string; job: number; amountCents: number };
    firstJobNumber: number;
    salespeople: { default: string[]; lighting: string };
    questions: {
      cycle: string;
      to: string;
      day: number;
      text: string;
      options: string[] | null;
    }[];
  };
  current: {
    cycle: string;
    snapshot: string;
    gustoPayrollId?: string | null;
    schedule: Record<
      string,
      { days: number[]; extendedDays?: number[]; extendedEnd?: string }
    >;
    jobByDay: string[];
    jobs: {
      id: string;
      number: number;
      title: string;
      client: string;
      status: string;
      salesperson: string | null;
      quote: string | null;
      start: string;
      end: string;
      marginPct?: number;
      totalCents?: number | null;
    }[];
    visits: { id: string; job: string; day: number; assigned?: string[] }[];
    quotes: {
      id: string;
      job: string | null;
      salesperson: string | null;
      sentAt: string;
      status: string;
      amountCents?: number;
    }[];
    invoices: {
      id: string;
      job: string;
      issued: string | null;
      due: string | null;
      status: string;
    }[];
    payments: {
      id: string;
      invoice: string | null;
      quote: string | null;
      date: string;
      amountCents: number | "invoiceTotal";
      type: string;
      kind: string;
    }[];
    expenses: {
      id: string;
      source: string;
      date: string;
      amountCents: number;
      vendor?: string;
      description: string;
      account?: string;
      job: string | null;
      kind: string;
    }[];
    pinnedEntryIds: Record<string, string>;
  };
  rules: { id: string; type: string; params: Rec; confidence: number }[];
};

/** A time entry before its id is assigned. `tags` are plant markers, stripped on output. */
export type Draft = {
  workerId: string;
  day: string;
  start: string;
  end: string | null;
  jobId: string | null;
  ticking: boolean;
  approved: boolean;
  category: string;
  hasNote: boolean;
  tags: string[];
};

export type Ctx = {
  cfg: Config;
  companyId: string;
  workers: Rec[];
  cycles: Rec[];
  days: string[]; // current cycle working days
  snapshotIso: string;
  drafts: Draft[]; // current cycle entries before ids
  entries: Rec[]; // all entries with ids (after assignment)
  jobs: Rec[];
  visits: Rec[];
  quotes: Rec[];
  invoices: Rec[];
  payments: Rec[];
  expenses: Rec[];
  pastPayrolls: Rec[];
  questions: Rec[];
  syncRuns: Rec[];
  tagged(tag: string): Rec[];
};

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const workerId = (n: number) => `a-w${pad(n, 2)}`;
const roundTo = (x: number, step: number) => Math.round(x / step) * step;
const hoursOf = (e: Rec) => (e.durationSec as number) / 3600;

// ---------------------------------------------------------------- workers and cycles

function rateAt(
  table: Record<string, number> | undefined,
  cycleId: string,
): number | null {
  if (!table) return null;
  let r: number | null = null;
  for (const [c, v] of Object.entries(table).sort()) if (c <= cycleId) r = v;
  return r;
}

function buildWorkers(cfg: Config): Rec[] {
  const C = cfg.company.id;
  const fakeUuid = (n: number, kind: string) =>
    `00000000-0000-4000-${kind}-${pad(n, 12)}`;
  return cfg.workers.map((w) => {
    const id = workerId(w.n);
    const unit = w.payType === "salary" ? "Year" : "Hour";
    const gusto =
      w.payType === "contractor_venmo"
        ? null
        : {
            employeeUuid: w.gustoIds?.employeeUuid ?? fakeUuid(w.n, "a000"),
            contractorUuid: null,
            jobUuid: w.gustoIds ? w.gustoIds.jobUuid : fakeUuid(w.n, "b000"),
            rateCents: w.gustoRate ?? null,
            paymentUnit: unit,
            flsaStatus: w.payType === "salary" ? "Exempt" : "Nonexempt",
            onboarded: w.onboarded ?? true,
          };
    return {
      id,
      companyId: C,
      displayName: w.name,
      role: w.role,
      payType: w.payType,
      status: w.status ?? "active",
      managerId:
        w.role === "field" ? "a-w11" : w.role === "manager" ? "a-w12" : null,
      contactRef: `contact:${id}`,
      jobber: {
        userId: `jobber-user:${id}`,
        labourRateCents: w.jobberRate,
        status: w.jobberStatus ?? "ACTIVATED",
      },
      gusto,
      venmoRateCents:
        w.payType === "contractor_venmo" ? (w.venmoRate ?? null) : null,
    };
  });
}

function buildCycles(cfg: Config): Rec[] {
  return cfg.cycles.map((c) => ({
    id: c.id,
    companyId: cfg.company.id,
    number: c.number,
    periodStart: local(c.start, "00:00"),
    periodEnd: new Date(
      Date.parse(local(addDays(c.end, 1), "00:00")) - 1,
    ).toISOString(),
    cutoffAt: local(addDays(c.end, -1), "18:00"), // Friday 18:00 local
    stage: c.current ? "setup" : "closed",
    gustoPayrollId: c.current ? (cfg.current.gustoPayrollId ?? null) : null,
    gustoOffCyclePayrollId: null,
    questionsAsked: c.current
      ? 0
      : cfg.past.questions.filter((q) => q.cycle === c.id).length,
  }));
}

function entryRec(
  ctx: { companyId: string },
  id: string,
  cycleId: string,
  d: Omit<Draft, "tags">,
  snapshotIso: string | null,
  visitId: string | null,
): Rec {
  const startAt = local(d.day, d.start);
  const endAt = d.end === null ? null : local(d.day, d.end);
  const durationSec = d.ticking
    ? seconds(startAt, snapshotIso as string)
    : seconds(startAt, endAt as string);
  return {
    id,
    companyId: ctx.companyId,
    cycleId,
    sourceId: id,
    workerId: d.workerId,
    jobId: d.jobId,
    visitId,
    startAt,
    endAt,
    durationSec,
    ticking: d.ticking,
    approved: d.approved,
    approvedBy: d.approved ? "a-w11" : null,
    payable: true,
    category: d.category,
    label: null,
    hasNote: d.hasNote,
  };
}

function expenseRec(
  companyId: string,
  e: {
    id: string;
    source: string;
    date: string;
    amountCents: number;
    vendor?: string | null;
    description: string;
    account?: string | null;
    job: string | null;
    kind: string;
  },
  jobNumber: (id: string) => number,
): Rec {
  const isQbo = e.source === "qbo";
  return {
    id: e.id,
    companyId,
    source: e.source,
    sourceId: e.id,
    date: e.date,
    amountCents: e.amountCents,
    vendor: isQbo ? (e.vendor ?? null) : null,
    description: e.description,
    accountName: isQbo ? (e.account ?? null) : null,
    customerRef: isQbo && e.job ? String(jobNumber(e.job)) : null,
    paymentType: isQbo ? "CreditCard" : null,
    kind: e.kind,
    matchedJobId: e.job,
    matchConfidence: e.job ? 1 : null,
  };
}

// ---------------------------------------------------------------- costing (Jobber job costing: hours x Jobber labour rate + job-cost expenses)

function jobCost(
  jobId: string,
  entries: Rec[],
  expenses: Rec[],
  jobs: Rec[],
  jobberRate: (w: string, c: string) => number,
): number {
  const ids = new Set([
    jobId,
    ...jobs.filter((j) => j.parentJobId === jobId).map((j) => j.id as string),
  ]);
  let cost = 0;
  for (const e of entries)
    if (ids.has(e.jobId as string))
      cost += Math.round(
        hoursOf(e) * jobberRate(e.workerId as string, e.cycleId as string),
      );
  for (const x of expenses)
    if (x.kind === "job_cost" && ids.has(x.matchedJobId as string))
      cost += x.amountCents as number;
  return cost;
}

// ---------------------------------------------------------------- past cycles

function buildPast(ctx: Ctx, wcfg: Map<string, WorkerCfg>) {
  const { cfg, companyId: C } = ctx;
  const P = cfg.past;
  let jobN = 11,
    visitN = 11,
    quoteN = 11,
    invN = 11,
    payN = 11,
    qN = 1,
    clientN = 11;
  let jobNumber = P.firstJobNumber;
  // past streets never reuse a current-cycle street, so a disposal hint can only point at one job
  const streetPool = STREETS.filter(
    (s) => !cfg.current.jobs.some((j) => j.title.endsWith(s)),
  );
  const streetOrder = rng(`${cfg.seed}:streets`);
  const takeStreet = () =>
    streetPool.splice(streetOrder.int(0, streetPool.length - 1), 1)[0];
  const jobberRate = (w: string, c: string) =>
    rateAt(must(wcfg.get(w), `worker ${w}`).jobberRates, c) ??
    must(wcfg.get(w), `worker ${w}`).jobberRate ??
    0;

  for (const c of cfg.cycles.filter((x) => !x.current)) {
    const r = rng(`${cfg.seed}:${c.id}`);
    const days = workdays(c.start, c.end, cfg.holidays);
    // jobs: consecutive pairs of working days
    const chunks: string[][] = [];
    for (let i = 0; i < days.length; i += 2) chunks.push(days.slice(i, i + 2));
    const cycleJobs: Rec[] = [];
    const dayJob = new Map<string, Rec>();
    chunks.forEach((chunk, k) => {
      const lighting = P.lightingJob[c.id] === k;
      const disposalParent = P.disposalSubJob[c.id] === k;
      const work = lighting
        ? must(WORK.find((w) => w.kind === "lighting"))
        : r.pick(
            WORK.filter(
              (w) =>
                w.kind !== "lighting" &&
                (!disposalParent || w.kind === "hardscape"),
            ),
          );
      const street = takeStreet();
      const job: Rec = {
        id: `a-j${pad(jobN++, 2)}`,
        companyId: C,
        sourceId: "",
        jobNumber: jobNumber++,
        title: `${work.title} - ${street}`,
        clientRef: `a-cl-${pad(clientN++, 2)}`,
        status: "archived",
        salespersonWorkerId: lighting
          ? P.salespeople.lighting
          : r.pick(P.salespeople.default),
        quoteId: null,
        parentJobId: null,
        startAt: local(chunk[0], "07:00"),
        endAt: local(chunk[chunk.length - 1], "17:00"),
        totalCents: null,
        _days: chunk,
        _kind: work.kind,
        _street: street,
        _lighting: lighting,
      };
      job.sourceId = job.id;
      cycleJobs.push(job);
      for (const d of chunk) dayJob.set(d, job);
      if (disposalParent) {
        const last = chunk[chunk.length - 1];
        const sub: Rec = {
          id: `a-j${pad(jobN++, 2)}`,
          companyId: C,
          sourceId: "",
          jobNumber: jobNumber++,
          title: `Disposal run - ${street}`,
          clientRef: job.clientRef,
          status: "archived",
          salespersonWorkerId: null,
          quoteId: null,
          parentJobId: job.id,
          startAt: local(last, "07:00"),
          endAt: local(last, "17:00"),
          totalCents: null,
          _days: [],
          _sub: true,
        };
        sub.sourceId = sub.id;
        cycleJobs.push(sub);
      }
    });

    // entries
    const drafts: (Draft & { visitKey: string })[] = [];
    for (const [w, count] of Object.entries(P.daysPerCycle)) {
      const chosen = count >= days.length ? days : r.sample(days, count);
      for (const d of chosen) {
        const job = must(dayJob.get(d));
        drafts.push({
          workerId: w,
          day: d,
          start: cfg.shift.start,
          end: P.shiftEnd[w] ?? cfg.shift.end,
          jobId: job.id as string,
          ticking: false,
          approved: true,
          category: "GENERAL",
          hasNote: false,
          tags: [],
          visitKey: `${job.id}|${d}`,
        });
      }
    }
    drafts.sort((a, b) =>
      (a.day + a.start + a.workerId).localeCompare(
        b.day + b.start + b.workerId,
      ),
    );
    // visits: one per job-day, assigned to whoever logged time that day
    const visitIds = new Map<string, string>();
    for (const d of days) {
      const job = must(dayJob.get(d));
      const id = `a-v${pad(visitN++, 2)}`;
      visitIds.set(`${job.id}|${d}`, id);
      ctx.visits.push({
        id,
        companyId: C,
        jobId: job.id,
        sourceId: id,
        startAt: local(d, "07:00"),
        endAt: local(d, "15:30"),
        isComplete: true,
        assignedWorkerIds: [
          ...new Set(drafts.filter((x) => x.day === d).map((x) => x.workerId)),
        ].sort(),
      });
    }
    drafts.forEach((d, i) => {
      const id = `a-te-${c.number}${pad(i + 1, 3)}`;
      ctx.entries.push(
        entryRec(ctx, id, c.id, d, null, visitIds.get(d.visitKey) ?? null),
      );
    });

    // expenses
    let exN = 1;
    const exId = () => `a-ex-${c.number}${pad(exN++, 3)}`;
    const jobNum = (id: string) =>
      must(
        cycleJobs.find((j) => j.id === id) ?? ctx.jobs.find((j) => j.id === id),
      ).jobNumber as number;
    const add = (e: Parameters<typeof expenseRec>[1]) =>
      ctx.expenses.push(expenseRec(C, e, jobNum));
    for (const job of cycleJobs) {
      const first = (job._days as string[])[0];
      if (job._sub) {
        const parentLast = must(
          (
            must(cycleJobs.find((j) => j.id === job.parentJobId))
              ._days as string[]
          ).at(-1),
        );
        add({
          id: exId(),
          source: "jobber",
          date: parentLast,
          amountCents: r.int(12000, 22000),
          description: `Dump fee - ${(job.title as string).replace("Disposal run - ", "")}`,
          job: job.id as string,
          kind: "job_cost",
        });
        continue;
      }
      add({
        id: exId(),
        source: "qbo",
        date: first,
        amountCents: r.int(25000, 120000),
        vendor: r.pick(VENDORS.Materials),
        description: "Job materials",
        account: "Materials",
        job: job.id as string,
        kind: "job_cost",
      });
      if (r.chance(0.4))
        add({
          id: exId(),
          source: "qbo",
          date: first,
          amountCents: r.int(30000, 60000),
          vendor: r.pick(VENDORS["Equipment Rental"]),
          description: "Equipment day rate",
          account: "Equipment Rental",
          job: job.id as string,
          kind: "job_cost",
        });
      if (job._kind === "hardscape" && r.chance(0.5))
        add({
          id: exId(),
          source: "qbo",
          date: must((job._days as string[]).at(-1)),
          amountCents: r.int(12000, 25000),
          vendor: r.pick(VENDORS.Disposal),
          description: "Tipping fee",
          account: "Disposal",
          job: job.id as string,
          kind: "job_cost",
        });
      if (r.chance(0.5))
        add({
          id: exId(),
          source: "jobber",
          date: first,
          amountCents: r.int(3000, 12000),
          description: r.pick(JOBBER_EXPENSE_TITLES),
          job: job.id as string,
          kind: "job_cost",
        });
    }
    add({
      id: exId(),
      source: "qbo",
      date: days[2],
      amountCents: 4999,
      vendor: VENDORS.Software[0],
      description: "Monthly scheduling subscription",
      account: "Software",
      job: null,
      kind: "overhead",
    });
    if (c.number % 2 === 1)
      add({
        id: exId(),
        source: "qbo",
        date: days[1],
        amountCents: 38500,
        vendor: VENDORS.Insurance[0],
        description: "General liability premium",
        account: "Insurance",
        job: null,
        kind: "overhead",
      });
    // Fuel is deliberately ambiguous: one purchase tagged to a job, one not. No account-kind rule can be learned.
    add({
      id: exId(),
      source: "qbo",
      date: days[3],
      amountCents: r.int(6000, 11000),
      vendor: r.pick(VENDORS.Fuel),
      description: "Truck fuel",
      account: "Fuel",
      job: must(dayJob.get(days[3])).id as string,
      kind: "unknown",
    });
    add({
      id: exId(),
      source: "qbo",
      date: days[7],
      amountCents: r.int(6000, 11000),
      vendor: r.pick(VENDORS.Fuel),
      description: "Truck fuel",
      account: "Fuel",
      job: null,
      kind: "unknown",
    });

    // totals, quotes, invoices, payments
    ctx.jobs.push(...cycleJobs);
    const tipJob =
      P.tip.cycle === c.id ? cycleJobs.filter((j) => !j._sub)[P.tip.job] : null;
    for (const job of cycleJobs) {
      if (job._sub) continue;
      const cost = jobCost(
        job.id as string,
        ctx.entries,
        ctx.expenses,
        ctx.jobs,
        jobberRate,
      );
      const m = r.int(P.marginRange[0], P.marginRange[1]);
      const total = roundTo(cost / (1 - m / 100), 1000);
      job.totalCents = total;
      const first = (job._days as string[])[0];
      const last = must((job._days as string[]).at(-1));
      const sent = addDays(first, -14);
      const qid = `a-q${pad(quoteN++, 2)}`;
      job.quoteId = qid;
      ctx.quotes.push({
        id: qid,
        companyId: C,
        sourceId: qid,
        jobId: job.id,
        salespersonWorkerId: job.salespersonWorkerId,
        sentAt: local(sent, "10:00"),
        status: "converted",
        amountCents: total,
      });
      let deposit = 0;
      if (total > 300000) {
        deposit = roundTo(total * 0.3, 1000);
        const pid = `a-pay${pad(payN++, 2)}`;
        ctx.payments.push({
          id: pid,
          companyId: C,
          sourceId: pid,
          invoiceId: null,
          quoteId: qid,
          entryDate: addDays(sent, 3),
          amountCents: deposit,
          paymentType: "credit_card",
          kind: "deposit",
        });
      }
      const iid = `a-in${pad(invN++, 2)}`;
      const issued = addDays(last, 1);
      ctx.invoices.push({
        id: iid,
        companyId: C,
        sourceId: iid,
        jobId: job.id,
        issuedDate: issued,
        dueDate: addDays(issued, 14),
        status: "paid",
        totalCents: total,
      });
      const fid = `a-pay${pad(payN++, 2)}`;
      ctx.payments.push({
        id: fid,
        companyId: C,
        sourceId: fid,
        invoiceId: iid,
        quoteId: null,
        entryDate: addDays(issued, 7),
        amountCents: total - deposit,
        paymentType: r.pick(["check", "credit_card", "ach"]),
        kind: "final",
      });
      if (job === tipJob) {
        const tid = `a-pay${pad(payN++, 2)}`;
        ctx.payments.push({
          id: tid,
          companyId: C,
          sourceId: tid,
          invoiceId: iid,
          quoteId: null,
          entryDate: addDays(issued, 7),
          amountCents: P.tip.amountCents,
          paymentType: "tip",
          kind: "unknown",
        });
      }
    }

    // what was paid (stand-in for A-08's Gusto past payrolls; Venmo from the owner's list)
    buildPastPay(ctx, c, cycleJobs, tipJob, jobberRate);

    // routing history: questions asked and answered in this cycle
    const real = cycleJobs.filter((j) => !j._sub);
    for (const q of P.questions.filter((x) => x.cycle === c.id)) {
      const date = days[q.day];
      const j1 = must(dayJob.get(date));
      const j2 = real[(real.indexOf(j1) + 1) % real.length];
      const fill = (s: string) =>
        s
          .replaceAll("{date}", shortDate(date))
          .replaceAll("{job1}", String(j1.jobNumber))
          .replaceAll("{job2}", String(j2.jobNumber));
      const to = must(ctx.workers.find((w) => w.id === q.to));
      const id = `a-qn-${pad(qN++, 2)}`;
      ctx.questions.push({
        id,
        companyId: C,
        cycleId: c.id,
        flagIds: [],
        toWorkerId: q.to,
        toRole:
          to.role === "owner"
            ? "owner"
            : to.role === "manager"
              ? "manager"
              : "employee",
        text: fill(q.text),
        options: q.options ? q.options.map(fill) : null,
        kind: "text",
        status: "answered",
        approvedBy: "a-w12",
        approvedAt: local(date, "16:00"),
        sentAt: local(date, "16:01"),
        remindAt: null,
        expiresAt: null,
        interpretationId: null,
      });
    }
  }
}

function weeklySplit(
  entries: Rec[],
  periodStartDate: string,
  otWeekly: number,
): { regular: number; overtime: number } {
  const weeks = new Map<number, number>();
  for (const e of entries) {
    const localDate = new Date(
      Date.parse(e.startAt as string) - 7 * 3600 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    const wk = Math.floor(
      (Date.parse(`${localDate}T12:00:00Z`) -
        Date.parse(`${periodStartDate}T12:00:00Z`)) /
        (7 * DAY_MS),
    );
    weeks.set(wk, (weeks.get(wk) ?? 0) + hoursOf(e));
  }
  let regular = 0,
    overtime = 0;
  for (const h of weeks.values()) {
    regular += Math.min(h, otWeekly);
    overtime += Math.max(0, h - otWeekly);
  }
  return { regular, overtime };
}

function buildPastPay(
  ctx: Ctx,
  c: CycleCfg,
  cycleJobs: Rec[],
  tipJob: Rec | null,
  jobberRate: (w: string, c: string) => number,
) {
  const { cfg, companyId: C } = ctx;
  const otWeekly = cfg.company.settings.otWeeklyHours as number;
  let n = 1;
  const row = (workerIdV: string, paidVia: string, earnings: Rec[]) => {
    ctx.pastPayrolls.push({
      id: `a-pp-${c.number}${pad(n++, 2)}`,
      companyId: C,
      cycleId: c.id,
      workerId: workerIdV,
      paidVia,
      earnings,
      grossCents: earnings.reduce((s, e) => s + (e.amountCents as number), 0),
    });
  };
  const mine = (w: string) =>
    ctx.entries.filter((e) => e.cycleId === c.id && e.workerId === w);
  // tips split by hours on the job
  const tips = new Map<string, number>();
  if (tipJob) {
    const on = ctx.entries.filter((e) => e.jobId === tipJob.id);
    const total = on.reduce((s, e) => s + hoursOf(e), 0);
    const byW = new Map<string, number>();
    for (const e of on)
      byW.set(
        e.workerId as string,
        (byW.get(e.workerId as string) ?? 0) + hoursOf(e),
      );
    let left = cfg.past.tip.amountCents;
    const ws = [...byW.keys()].sort();
    ws.forEach((w, i) => {
      const share =
        i === ws.length - 1
          ? left
          : Math.round((cfg.past.tip.amountCents * must(byW.get(w))) / total);
      left -= share;
      tips.set(w, share);
    });
  }
  // commission (5% of in-person quoted job totals) and manager split (10% of job profit)
  const real = cycleJobs.filter((j) => !j._sub);
  const commission = new Map<string, number>();
  for (const j of real.filter((x) => x._lighting)) {
    const w = j.salespersonWorkerId as string;
    commission.set(
      w,
      (commission.get(w) ?? 0) + Math.round((j.totalCents as number) * 0.05),
    );
  }
  let profit = 0;
  for (const j of real)
    profit +=
      (j.totalCents as number) -
      jobCost(j.id as string, ctx.entries, ctx.expenses, ctx.jobs, jobberRate);
  const bonus = Math.round(profit * 0.1);

  for (const w of cfg.workers) {
    const id = workerId(w.n);
    if (w.firstCycle && w.firstCycle > c.id) continue;
    const rate = rateAt(w.rates, c.id);
    if (rate === null) continue;
    const es = mine(id);
    if (w.payType === "contractor_venmo") {
      const h = es.reduce((s, e) => s + hoursOf(e), 0);
      const earn: Rec[] = [
        {
          name: "Hours",
          hours: h,
          rateCents: rate,
          amountCents: Math.round(h * rate),
        },
      ];
      if (tips.get(id))
        earn.push({
          name: "Cash Tips",
          hours: null,
          rateCents: null,
          amountCents: must(tips.get(id)),
        });
      row(id, "venmo", earn);
      continue;
    }
    if (w.payType === "salary") {
      row(id, "gusto_regular", [
        {
          name: "Salary",
          hours: null,
          rateCents: rate,
          amountCents: Math.round(rate / 26),
        },
      ]);
    } else {
      const { regular, overtime } = weeklySplit(es, c.start, otWeekly);
      const earn: Rec[] = [
        {
          name: "Regular Hours",
          hours: regular,
          rateCents: rate,
          amountCents: Math.round(regular * rate),
        },
      ];
      if (overtime > 0)
        earn.push({
          name: "Overtime",
          hours: overtime,
          rateCents: Math.round(rate * 1.5),
          amountCents: Math.round(overtime * rate * 1.5),
        });
      row(id, "gusto_regular", earn);
    }
    const off: Rec[] = [];
    if (commission.get(id))
      off.push({
        name: "Commission",
        hours: null,
        rateCents: null,
        amountCents: must(commission.get(id)),
      });
    if (tips.get(id))
      off.push({
        name: "Paycheck Tips",
        hours: null,
        rateCents: null,
        amountCents: must(tips.get(id)),
      });
    if (id === "a-w11" && bonus > 0)
      off.push({
        name: "Bonus",
        hours: null,
        rateCents: null,
        amountCents: bonus,
      });
    if (off.length) row(id, "gusto_off_cycle", off);
  }
}

// ---------------------------------------------------------------- current cycle

function buildCurrent(ctx: Ctx, wcfg: Map<string, WorkerCfg>) {
  const { cfg, companyId: C } = ctx;
  const cur = cfg.current;
  const cycle = must(cfg.cycles.find((c) => c.id === cur.cycle));
  const jobberRate = (w: string, c: string) =>
    rateAt(must(wcfg.get(w), `worker ${w}`).jobberRates, c) ??
    must(wcfg.get(w), `worker ${w}`).jobberRate ??
    0;

  // jobs (totals filled after costing)
  for (const j of cur.jobs) {
    ctx.jobs.push({
      id: j.id,
      companyId: C,
      sourceId: j.id,
      jobNumber: j.number,
      title: j.title,
      clientRef: j.client,
      status: j.status,
      salespersonWorkerId: j.salesperson,
      quoteId: j.quote,
      parentJobId: null,
      startAt: local(j.start, "07:00"),
      endAt: local(j.end, "17:00"),
      totalCents: j.totalCents ?? null,
    });
  }
  const jobNum = (id: string) =>
    must(ctx.jobs.find((j) => j.id === id)).jobNumber as number;
  for (const e of cur.expenses) ctx.expenses.push(expenseRec(C, e, jobNum));

  // baseline entries from the schedule
  for (const [w, s] of Object.entries(cur.schedule)) {
    for (const i of s.days) {
      ctx.drafts.push({
        workerId: w,
        day: ctx.days[i],
        start: cfg.shift.start,
        end: s.extendedDays?.includes(i)
          ? (s.extendedEnd as string)
          : cfg.shift.end,
        jobId: cur.jobByDay[i],
        ticking: false,
        approved: true,
        category: "GENERAL",
        hasNote: false,
        tags: [`base:${w}:${i}`],
      });
    }
  }

  // planted errors (seed/lib/plant.ts)
  plantCurrent(ctx);

  // ids: pinned ids from fixtures v1 stay; new entries are numbered by start time from a-te-0141
  const pins = new Map(Object.entries(cur.pinnedEntryIds));
  const used = new Set<string>();
  const keyed = ctx.drafts.map((d) => ({
    d,
    key: `${d.workerId}|${local(d.day, d.start)}`,
  }));
  keyed.sort((a, b) =>
    (local(a.d.day, a.d.start) + a.d.workerId).localeCompare(
      local(b.d.day, b.d.start) + b.d.workerId,
    ),
  );
  const ids = new Map<Draft, string>();
  for (const { d, key } of keyed) {
    const pin = pins.get(key);
    if (pin && !used.has(pin) && !d.tags.includes("dup")) {
      ids.set(d, pin);
      used.add(pin);
    }
  }
  if (used.size !== pins.size) {
    const missing = [...pins.values()].filter((p) => !used.has(p));
    throw new Error(`pinned entry ids not reproduced: ${missing.join(", ")}`);
  }
  let next = 141;
  for (const { d } of keyed)
    if (!ids.has(d)) ids.set(d, `a-te-${pad(next++, 4)}`);

  const visitIdFor = (jobId: string | null, day: string) =>
    cur.visits.find(
      (v) => v.job === jobId && ctx.days[v.day] === day && !v.assigned,
    )?.id ?? null;
  const current: Rec[] = [];
  for (const { d } of keyed) {
    const rec = entryRec(
      ctx,
      must(ids.get(d)),
      cycle.id,
      d,
      ctx.snapshotIso,
      visitIdFor(d.jobId, d.day),
    );
    rec._tags = d.tags;
    current.push(rec);
  }
  current.sort((a, b) => (a.id as string).localeCompare(b.id as string));
  ctx.entries.push(...current);

  for (const v of cur.visits) {
    const day = ctx.days[v.day];
    ctx.visits.push({
      id: v.id,
      companyId: C,
      jobId: v.job,
      sourceId: v.id,
      startAt: local(day, "07:00"),
      endAt: local(day, "15:30"),
      isComplete: true,
      assignedWorkerIds:
        v.assigned ??
        [
          ...new Set(
            current
              .filter((e) => e.visitId === v.id)
              .map((e) => e.workerId as string),
          ),
        ].sort(),
    });
  }

  // totals from target margins
  for (const j of cur.jobs) {
    if (j.marginPct === undefined) continue;
    const cost = jobCost(j.id, ctx.entries, ctx.expenses, ctx.jobs, jobberRate);
    must(ctx.jobs.find((x) => x.id === j.id)).totalCents = roundTo(
      cost / (1 - j.marginPct / 100),
      1000,
    );
  }
  const total = (jobId: string) =>
    must(ctx.jobs.find((j) => j.id === jobId)).totalCents as number;
  for (const q of cur.quotes) {
    ctx.quotes.push({
      id: q.id,
      companyId: C,
      sourceId: q.id,
      jobId: q.job,
      salespersonWorkerId: q.salesperson,
      sentAt: local(q.sentAt.slice(0, 10), q.sentAt.slice(11)),
      status: q.status,
      amountCents: q.amountCents ?? total(q.job as string),
    });
  }
  for (const i of cur.invoices) {
    ctx.invoices.push({
      id: i.id,
      companyId: C,
      sourceId: i.id,
      jobId: i.job,
      issuedDate: i.issued,
      dueDate: i.due,
      status: i.status,
      totalCents: total(i.job),
    });
  }
  for (const p of cur.payments) {
    const inv = ctx.invoices.find((x) => x.id === p.invoice);
    ctx.payments.push({
      id: p.id,
      companyId: C,
      sourceId: p.id,
      invoiceId: p.invoice,
      quoteId: p.quote,
      entryDate: p.date,
      amountCents:
        p.amountCents === "invoiceTotal"
          ? (must(inv).totalCents as number)
          : p.amountCents,
      paymentType: p.type,
      kind: p.kind,
    });
  }
}

// ---------------------------------------------------------------- sync runs and rules

function buildSyncRuns(ctx: Ctx) {
  const C = ctx.companyId;
  const cur = ctx.cfg.current.cycle;
  const at = ctx.snapshotIso;
  const fin = new Date(Date.parse(at) + 60_000).toISOString();
  const count = (rows: Rec[], f: (r: Rec) => boolean) => rows.filter(f).length;
  const run = (
    id: string,
    cycleId: string | null,
    source: string,
    object: string,
    pulled: number,
    expected: number,
    method: string,
    startedAt = at,
    finishedAt = fin,
    error: string | null = null,
  ) =>
    ctx.syncRuns.push({
      id,
      companyId: C,
      cycleId,
      source,
      object,
      startedAt,
      finishedAt,
      pulled,
      expected,
      complete: pulled === expected && !error,
      method,
      error,
    });
  const curStart = must(ctx.cycles.find((c) => c.id === cur));
  const inCur = (date: string) =>
    local(date, "12:00") >= (curStart.periodStart as string) &&
    local(date, "12:00") <= (curStart.periodEnd as string);
  const nTe = count(ctx.entries, (e) => e.cycleId === cur);
  const nPurchase = count(
    ctx.expenses,
    (e) => e.source === "qbo" && inCur(e.date as string),
  );
  const nGusto = count(ctx.workers, (w) => w.gusto !== null);
  run(
    "a-sr-01",
    cur,
    "jobber",
    "timeSheetEntries",
    nTe,
    nTe,
    "graphql totalCount + timeSheetsByDay",
  );
  run(
    "a-sr-02",
    cur,
    "qbo",
    "Purchase",
    nPurchase,
    nPurchase,
    "query count(*)",
  );
  run("a-sr-03", cur, "gusto", "employees", nGusto, nGusto, "rest pagination");
  // CHK-23 fixture: the a-c04 time-entry pull missed one entry and was never re-run
  const c04 = must(ctx.cfg.cycles.find((c) => c.id === "a-c04"));
  const n4 = count(ctx.entries, (e) => e.cycleId === "a-c04");
  const c04end = addDays(c04.end, -1);
  run(
    "a-sr-04",
    "a-c04",
    "jobber",
    "timeSheetEntries",
    n4 - 1,
    n4,
    "graphql totalCount + timeSheetsByDay",
    local(c04end, "18:05"),
    local(c04end, "18:06"),
    `pulled ${n4 - 1} of totalCount ${n4}; timeSheetsByDay sum differs by 30600 s`,
  );
  const nJx = count(
    ctx.expenses,
    (e) => e.source === "jobber" && inCur(e.date as string),
  );
  const nV = count(ctx.visits, (v) =>
    inCur((v.startAt as string).slice(0, 10)),
  );
  run("a-sr-05", cur, "jobber", "expenses", nJx, nJx, "graphql totalCount");
  run("a-sr-06", cur, "jobber", "visits", nV, nV, "graphql totalCount");
  for (const c of ctx.cfg.cycles.filter(
    (x) => !x.current && x.id !== "a-c04",
  )) {
    const n = count(ctx.entries, (e) => e.cycleId === c.id);
    const end = addDays(c.end, -1);
    run(
      `a-sr-${pad(6 + c.number, 2)}`,
      c.id,
      "jobber",
      "timeSheetEntries",
      n,
      n,
      "graphql totalCount + timeSheetsByDay",
      local(end, "18:05"),
      local(end, "18:06"),
    );
  }
}

function buildRules(ctx: Ctx): Rec[] {
  const C = ctx.companyId;
  const hist = ctx.cfg.cycles.filter((c) => !c.current).map((c) => c.id);
  const rule = (
    id: string,
    type: string,
    params: Rec,
    confidence: number,
    evidence: string[],
  ) => ({
    id,
    companyId: C,
    type,
    params,
    status: "proposed",
    source: "history",
    provenance: {
      lessonId: null,
      flagId: null,
      answeredBy: null,
      approvedBy: null,
      approvedAt: null,
      evidence,
    },
    backtest: null,
    confidence,
  });
  const out = ctx.cfg.rules.map((r) =>
    rule(r.id, r.type, r.params, r.confidence, hist),
  );
  // pay_rate per active Gusto employee, from the latest past payroll (what was actually paid)
  let n = out.length + 1;
  const last = must(hist.at(-1));
  for (const w of ctx.cfg.workers) {
    const id = workerId(w.n);
    if (
      w.payType === "contractor_venmo" ||
      w.status === "inactive" ||
      w.role === "owner" ||
      w.role === "manager"
    )
      continue;
    const paid = ctx.pastPayrolls.find(
      (p) =>
        p.cycleId === last &&
        p.workerId === id &&
        p.paidVia === "gusto_regular",
    );
    if (!paid) continue;
    const rateCents = (paid.earnings as Rec[])[0].rateCents as number;
    const salary = w.payType === "salary";
    out.push(
      rule(
        `a-rule-${pad(n++, 2)}`,
        "pay_rate",
        {
          workerId: id,
          rateCents,
          paymentUnit: salary ? "Year" : "Hour",
          costRateCentsPerHour: salary
            ? Math.round(rateCents / 2080)
            : rateCents,
        },
        0.95,
        [paid.id as string],
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------- main

export function generate(cfg: Config): Record<string, unknown> {
  const C = cfg.company.id;
  const curCycle = must(cfg.cycles.find((c) => c.current));
  const ctx: Ctx = {
    cfg,
    companyId: C,
    workers: buildWorkers(cfg),
    cycles: buildCycles(cfg),
    days: workdays(curCycle.start, curCycle.end, cfg.holidays),
    snapshotIso: local(
      cfg.current.snapshot.slice(0, 10),
      cfg.current.snapshot.slice(11),
    ),
    drafts: [],
    entries: [],
    jobs: [],
    visits: [],
    quotes: [],
    invoices: [],
    payments: [],
    expenses: [],
    pastPayrolls: [],
    questions: [],
    syncRuns: [],
    tagged(tag) {
      return this.entries.filter((e) =>
        (e._tags as string[] | undefined)?.includes(tag),
      );
    },
  };
  const wcfg = new Map(cfg.workers.map((w) => [workerId(w.n), w]));
  buildPast(ctx, wcfg);
  buildCurrent(ctx, wcfg);
  buildSyncRuns(ctx);
  const rules = buildRules(ctx);
  const answerKey = buildAnswerKey(ctx);

  const strip = (rows: Rec[]) =>
    rows.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))),
    );
  const byId = (rows: Rec[]) =>
    [...rows].sort((a, b) =>
      (a.id as string).localeCompare(b.id as string, "en", { numeric: true }),
    );
  const { settings, ...rest } = cfg.company as Config["company"] & {
    utcOffset?: string;
  };
  delete (rest as Rec).utcOffset;
  return {
    "company.json": { ...rest, settings },
    "workers.json": ctx.workers,
    "cycles.json": ctx.cycles,
    "syncRuns.json": ctx.syncRuns,
    "timeEntries.json": strip(byId(ctx.entries)),
    "jobs.json": strip(byId(ctx.jobs)),
    "visits.json": byId(ctx.visits),
    "quotes.json": byId(ctx.quotes),
    "invoices.json": byId(ctx.invoices),
    "payments.json": byId(ctx.payments),
    "expenses.json": byId(ctx.expenses),
    "rules.json": rules,
    "pastPayrolls.json": ctx.pastPayrolls,
    "questions.json": ctx.questions,
    "answer-key.json": answerKey,
  };
}

/** Company A (and anything without `generator`) uses generate(); Company B's HVAC model is seed/lib/company-b.ts. */
export function generateAny(cfg: Config | ConfigB): Record<string, unknown> {
  return (cfg as ConfigB).generator === "hvac-weekly"
    ? generateB(cfg as ConfigB)
    : generate(cfg as Config);
}

export function loadConfig(company: string): Config {
  return JSON.parse(
    readFileSync(join(import.meta.dir, "companies", `${company}.json`), "utf8"),
  );
}

export function serialize(
  files: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([f, v]) => [
      f,
      `${JSON.stringify(v, null, 2)}\n`,
    ]),
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const company = arg("company");
  if (!company) {
    console.error(
      "usage: bun run seed/generate.ts --company <a|b> [--out <dir>]",
    );
    process.exit(2);
  }
  const out =
    arg("out") ?? join(import.meta.dir, "..", "data", "fixtures", company);
  mkdirSync(out, { recursive: true });
  const files = serialize(generateAny(loadConfig(company)));
  for (const [f, text] of Object.entries(files))
    writeFileSync(join(out, f), text);
  console.log(`wrote ${Object.keys(files).length} files to ${out}`);
}

// keep weekday exported for tests
export { weekday };
