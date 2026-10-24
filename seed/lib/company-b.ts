// Company B generator ("hvac-weekly"): a 30-person HVAC company paid weekly in California.
// Different on purpose from Company A: weekly cycles, California daily overtime, two crews with their own
// managers, commission on job profit for two salespeople, no tips, no Venmo, a different expense chart.
// Deterministic (seeded RNG); fixtures only, nothing here is pushed anywhere.
//
// Overtime as paid in past cycles (and as rules.json states it):
//   per day: first 8 h regular, over 8 h up to 12 h at 1.5x, over 12 h at 2x;
//   per workweek (Sun-Sat): regular hours over 40 at 1.5x (daily-OT hours do not count toward the 40);
//   seventh consecutive day: NOT modeled (no one in the data works 7 consecutive days).

import { must } from "./must";
import { B_INSTALL_WORK, B_SERVICE_WORK, B_STREETS } from "./names";
import { rng } from "./random";
import { addDays, local, seconds, shortDate } from "./time";

type Rec = Record<string, unknown>;
type WorkerCfgB = {
  n: number;
  name: string;
  role: string;
  payType: string;
  jobberRate: number | null;
  gustoRate: number;
  crew?: string;
};
type CycleCfgB = {
  id: string;
  number: number;
  start: string;
  end: string;
  current?: boolean;
};
type OtRule = {
  workweek: string;
  daily: { overHours: number; multiplier: number }[];
  weekly: { overHours: number; multiplier: number; counts: string };
  seventhConsecutiveDay: null | Rec;
};
export type ConfigB = {
  generator: "hvac-weekly";
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
  overtime: OtRule;
  cycles: CycleCfgB[];
  crews: {
    install: { manager: string; teams: string[][] };
    service: { manager: string; techs: string[] };
  };
  workers: WorkerCfgB[];
  salespeople: string[];
  commissionPctOfProfit: number;
  installDepositPct: number;
  installMarginRange: [number, number];
  serviceMarginRange: [number, number];
  serviceJobsPerCycle: number;
  firstJobNumber: number;
  snapshot: { dayAfterEnd: number; time: string };
  questions: {
    cycle: string;
    to: string;
    day: number;
    text: string;
    options: string[] | null;
  }[];
  expenseAccounts: Record<string, "job_cost" | "overhead">;
  vendors: Record<string, string[]>;
};

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const wid = (n: number) => `b-w${pad(n, 2)}`;
const roundTo = (x: number, step: number) => Math.round(x / step) * step;
const hours = (e: Rec) => (e.durationSec as number) / 3600;
const localDate = (iso: string) =>
  new Date(Date.parse(iso) - 7 * 3600_000).toISOString().slice(0, 10); // PDT for all B dates

/** California daily + weekly overtime split for one worker's entries in one workweek. Hours, not money. */
export function caOvertime(entries: Rec[]): {
  regular: number;
  overtime: number;
  doubleOvertime: number;
} {
  const byDay = new Map<string, number>();
  for (const e of entries)
    byDay.set(
      localDate(e.startAt as string),
      (byDay.get(localDate(e.startAt as string)) ?? 0) + hours(e),
    );
  let regular = 0;
  let overtime = 0;
  let doubleOvertime = 0;
  for (const h of byDay.values()) {
    regular += Math.min(h, 8);
    overtime += Math.min(Math.max(h - 8, 0), 4);
    doubleOvertime += Math.max(h - 12, 0);
  }
  if (regular > 40) {
    overtime += regular - 40;
    regular = 40;
  }
  return { regular, overtime, doubleOvertime };
}

type Ctx = {
  cfg: ConfigB;
  workers: Rec[];
  entries: Rec[];
  jobs: Rec[];
  visits: Rec[];
  quotes: Rec[];
  invoices: Rec[];
  payments: Rec[];
  expenses: Rec[];
  pastPayrolls: Rec[];
  questions: Rec[];
  tags: Map<string, Rec>;
};

export function generateB(cfg: ConfigB): Record<string, unknown> {
  const C = cfg.company.id;
  const wcfg = new Map(cfg.workers.map((w) => [wid(w.n), w]));
  const installTeamOf = new Map<string, number>();
  cfg.crews.install.teams.forEach((t, i) => {
    for (const w of t) installTeamOf.set(w, i);
  });
  const serviceTechs = new Set(cfg.crews.service.techs);
  const managerOf = (id: string, role: string) => {
    if (role === "owner") return null;
    if (installTeamOf.has(id)) return cfg.crews.install.manager;
    if (serviceTechs.has(id)) return cfg.crews.service.manager;
    return wid(1); // managers, office and sales report to the owner
  };

  const workers: Rec[] = cfg.workers.map((w) => {
    const id = wid(w.n);
    const hourly = w.payType === "hourly";
    return {
      id,
      companyId: C,
      displayName: w.name,
      role: w.role,
      payType: w.payType,
      status: "active",
      managerId: managerOf(id, w.role),
      contactRef: `contact:${id}`,
      jobber: {
        userId: `jobber-user:${id}`,
        labourRateCents: w.jobberRate,
        status: "ACTIVATED",
      },
      gusto: {
        employeeUuid: `00000000-0000-4000-c000-${pad(w.n, 12)}`,
        contractorUuid: null,
        jobUuid: `00000000-0000-4000-d000-${pad(w.n, 12)}`,
        rateCents: w.gustoRate,
        paymentUnit: hourly ? "Hour" : "Year",
        flsaStatus: hourly ? "Nonexempt" : "Exempt",
        onboarded: true,
      },
      venmoRateCents: null,
    };
  });

  const cycles: Rec[] = cfg.cycles.map((c) => ({
    id: c.id,
    companyId: C,
    number: c.number,
    periodStart: local(c.start, "00:00"),
    periodEnd: new Date(
      Date.parse(local(addDays(c.end, 1), "00:00")) - 1,
    ).toISOString(),
    cutoffAt: local(addDays(c.end, cfg.snapshot.dayAfterEnd), "10:00"), // Monday 10:00 local after the Saturday
    stage: c.current ? "setup" : "closed",
    gustoPayrollId: null,
    gustoOffCyclePayrollId: null,
    questionsAsked: c.current
      ? 0
      : cfg.questions.filter((q) => q.cycle === c.id).length,
  }));

  const ctx: Ctx = {
    cfg,
    workers,
    entries: [],
    jobs: [],
    visits: [],
    quotes: [],
    invoices: [],
    payments: [],
    expenses: [],
    pastPayrolls: [],
    questions: [],
    tags: new Map(),
  };
  const jobberRate = (w: string) =>
    must(wcfg.get(w), `worker ${w}`).jobberRate ?? 0;
  const counters = {
    job: 1,
    num: cfg.firstJobNumber,
    client: 1,
    visit: 1,
    quote: 1,
    inv: 1,
    pay: 1,
    qn: 1,
  };
  const streets = rng(`${cfg.seed}:streets`).sample(
    B_STREETS,
    B_STREETS.length,
  );
  let streetIdx = 0;
  const nextStreet = () => streets[streetIdx++ % streets.length];
  const cur = must(
    cfg.cycles.find((c) => c.current),
    "current cycle",
  );
  const snapshotDate = addDays(cur.end, cfg.snapshot.dayAfterEnd);
  const snapshotIso = local(snapshotDate, cfg.snapshot.time);

  for (const c of cfg.cycles) {
    const r = rng(`${cfg.seed}:${c.id}`);
    const days = [1, 2, 3, 4, 5].map((i) => addDays(c.start, i)); // Mon-Fri
    const sat = c.end;
    type Draft = {
      workerId: string;
      day: string;
      start: string;
      end: string;
      jobId: string | null;
      category: string;
      tag?: string;
    };
    const drafts: Draft[] = [];
    const cycleJobs: Rec[] = [];
    const newJob = (
      kind: "install" | "service",
      title: string,
      jobDays: string[],
      salesperson: string | null,
    ) => {
      const id = `b-j${pad(counters.job++, 3)}`;
      const job: Rec = {
        id,
        companyId: C,
        sourceId: id,
        jobNumber: counters.num++,
        title,
        clientRef: `b-cl-${pad(counters.client++, 3)}`,
        status: c.current ? "active" : "archived",
        salespersonWorkerId: salesperson,
        quoteId: null,
        parentJobId: null,
        startAt: jobDays.length ? local(jobDays[0], "07:00") : null,
        endAt: jobDays.length ? local(must(jobDays.at(-1)), "17:00") : null,
        totalCents: null,
        _kind: kind,
        _days: jobDays,
        _cycle: c.id,
      };
      cycleJobs.push(job);
      return job;
    };

    // install: each team does two jobs (2+3 or 3+2 days); one team per week also works Saturday morning
    const satTeam = c.number % cfg.crews.install.teams.length;
    cfg.crews.install.teams.forEach((team, t) => {
      const split = r.chance(0.5) ? [2, 3] : [3, 2];
      let d = 0;
      for (const len of split) {
        const jobDays = days.slice(d, d + len);
        d += len;
        if (t === satTeam && d === 5) jobDays.push(sat);
        const sp = cfg.salespeople[(counters.job + t) % cfg.salespeople.length];
        const job = newJob(
          "install",
          `${r.pick(B_INSTALL_WORK)} - ${nextStreet()}`,
          jobDays,
          sp,
        );
        for (const day of jobDays) {
          for (const w of team) {
            const saturday = day === sat;
            drafts.push({
              workerId: w,
              day,
              start: "07:00",
              end: saturday ? "12:00" : "15:30",
              jobId: job.id as string,
              category: "GENERAL",
            });
          }
        }
      }
    });

    // service: a pool of jobs; each tech runs two calls a day; one tech is on call Saturday morning
    const pool = Array.from({ length: cfg.serviceJobsPerCycle }, () =>
      newJob(
        "service",
        `${r.pick(B_SERVICE_WORK)} - ${nextStreet()}`,
        [],
        null,
      ),
    );
    const P = pool.length;
    cfg.crews.service.techs.forEach((w, i) => {
      days.forEach((day, di) => {
        const a = pool[(i * 2 + di * 3) % P];
        const b = pool[(i * 2 + 1 + di * 3) % P];
        drafts.push({
          workerId: w,
          day,
          start: "08:00",
          end: "12:00",
          jobId: a.id as string,
          category: "GENERAL",
        });
        drafts.push({
          workerId: w,
          day,
          start: "12:30",
          end: "17:00",
          jobId: b.id as string,
          category: "GENERAL",
        });
      });
    });
    // every other past week an evening emergency call makes a 12.5 h day (no single entry over 12 h):
    // 8 h regular, 4 h at 1.5x, 0.5 h at 2x, so the double-time tier is visible in the history
    if (!c.current && c.number % 2 === 0) {
      const tech =
        cfg.crews.service.techs[
          (c.number * 5) % cfg.crews.service.techs.length
        ];
      drafts.push({
        workerId: tech,
        day: days[2],
        start: "17:30",
        end: "21:30",
        jobId: pool[1].id as string,
        category: "GENERAL",
      });
    }
    const onCall =
      cfg.crews.service.techs[c.number % cfg.crews.service.techs.length];
    drafts.push({
      workerId: onCall,
      day: sat,
      start: "09:00",
      end: "13:00",
      jobId: pool[0].id as string,
      category: "GENERAL",
    });
    // office
    for (const day of days)
      drafts.push({
        workerId: wid(4),
        day,
        start: "08:00",
        end: "16:30",
        jobId: null,
        category: "OFFICE",
      });

    // plants (current cycle only) change drafts before ids are assigned
    if (c.current) plantDrafts(drafts, days, sat, cycleJobs);

    // service job days come from their calls
    for (const j of pool) {
      const ds = [
        ...new Set(drafts.filter((d) => d.jobId === j.id).map((d) => d.day)),
      ].sort();
      j._days = ds;
      j.startAt = ds.length ? local(ds[0], "08:00") : null;
      j.endAt = ds.length ? local(must(ds.at(-1)), "17:00") : null;
    }

    // ids by start time, then visits per job-day
    drafts.sort((a, b) =>
      (local(a.day, a.start) + a.workerId).localeCompare(
        local(b.day, b.start) + b.workerId,
      ),
    );
    const visitId = new Map<string, string>();
    for (const d of drafts) {
      if (!d.jobId) continue;
      const k = `${d.jobId}|${d.day}`;
      if (!visitId.has(k)) visitId.set(k, `b-v${pad(counters.visit++, 4)}`);
    }
    const cycleEntries: Rec[] = drafts.map((d, i) => {
      const id = `b-te-${c.number}${pad(i + 1, 3)}`;
      const startAt = local(d.day, d.start);
      const endAt = local(d.day, d.end);
      const w = must(
        workers.find((x) => x.id === d.workerId),
        d.workerId,
      );
      const e: Rec = {
        id,
        companyId: C,
        cycleId: c.id,
        sourceId: id,
        workerId: d.workerId,
        jobId: d.jobId,
        visitId: d.jobId ? must(visitId.get(`${d.jobId}|${d.day}`)) : null,
        startAt,
        endAt,
        durationSec: seconds(startAt, endAt),
        ticking: false,
        approved: true,
        approvedBy: w.managerId,
        payable: true,
        category: d.category,
        label: null,
        hasNote: d.tag === "chk03",
      };
      if (d.tag) ctx.tags.set(d.tag, e);
      return e;
    });
    ctx.entries.push(...cycleEntries);
    for (const [k, id] of visitId) {
      const [jobId, day] = k.split("|");
      const es = cycleEntries.filter((e) => e.visitId === id);
      ctx.visits.push({
        id,
        companyId: C,
        jobId,
        sourceId: id,
        startAt: es.map((e) => e.startAt as string).sort()[0],
        endAt:
          es
            .map((e) => e.endAt as string)
            .sort()
            .at(-1) ?? null,
        isComplete: local(day, "23:59") <= snapshotIso,
        assignedWorkerIds: [
          ...new Set(es.map((e) => e.workerId as string)),
        ].sort(),
      });
    }

    // expenses
    let exN = 1;
    const exId = () => `b-ex-${c.number}${pad(exN++, 3)}`;
    const vendor = (acct: string) => r.pick(must(cfg.vendors[acct], acct));
    const addEx = (
      source: "qbo" | "jobber",
      date: string,
      amountCents: number,
      acct: string | null,
      description: string,
      jobId: string | null,
      kind?: string,
    ) => {
      const job = jobId ? cycleJobs.find((j) => j.id === jobId) : null;
      const e: Rec = {
        id: exId(),
        companyId: C,
        source,
        sourceId: "",
        date,
        amountCents,
        vendor: source === "qbo" && acct ? vendor(acct) : null,
        description,
        accountName: source === "qbo" ? acct : null,
        customerRef: source === "qbo" && job ? String(job.jobNumber) : null,
        paymentType: source === "qbo" ? "CreditCard" : null,
        kind:
          kind ?? (acct ? must(cfg.expenseAccounts[acct], acct) : "job_cost"),
        matchedJobId: jobId,
        matchConfidence: jobId ? 1 : null,
      };
      e.sourceId = e.id;
      ctx.expenses.push(e);
      return e;
    };
    for (const j of cycleJobs) {
      const jd = j._days as string[];
      if (!jd.length) continue;
      if (j._kind === "install") {
        addEx(
          "qbo",
          jd[0],
          r.int(250000, 650000),
          "Equipment (Units)",
          "Equipment",
          j.id as string,
        );
        addEx(
          "qbo",
          jd[0],
          r.int(40000, 120000),
          "Ductwork & Parts",
          "Ductwork and fittings",
          j.id as string,
        );
        addEx(
          "qbo",
          jd[0],
          r.int(15000, 35000),
          "Permits",
          "Mechanical permit",
          j.id as string,
        );
        if (r.chance(0.5))
          addEx(
            "jobber",
            must(jd.at(-1)),
            r.int(8000, 25000),
            null,
            "Refrigerant top-off",
            j.id as string,
          );
      } else {
        if (r.chance(0.4))
          addEx(
            "qbo",
            jd[0],
            r.int(6000, 20000),
            "Refrigerant",
            "Refrigerant",
            j.id as string,
          );
        if (r.chance(0.4))
          addEx(
            "jobber",
            jd[0],
            r.int(3000, 15000),
            null,
            "Replacement parts",
            j.id as string,
          );
      }
    }
    addEx(
      "qbo",
      days[1],
      r.int(12000, 30000),
      "Shop Supplies",
      "Shop consumables",
      null,
    );
    addEx(
      "qbo",
      days[4],
      r.int(60000, 90000),
      "Vehicle Fuel",
      "Fleet fuel",
      null,
    );
    if (c.number % 2 === 1)
      addEx(
        "qbo",
        days[2],
        r.int(20000, 60000),
        "Tools & Small Equipment",
        "Gauges and hand tools",
        null,
      );
    if (c.current) plantExpenses(ctx, cycleJobs, days, exId);

    // totals, quotes, invoices, payments (Jobber job costing: hours x Jobber labour rate + job-cost expenses)
    ctx.jobs.push(...cycleJobs);
    for (const j of cycleJobs) {
      const jd = j._days as string[];
      const cost =
        ctx.entries
          .filter((e) => e.jobId === j.id)
          .reduce(
            (s, e) =>
              s + Math.round(hours(e) * jobberRate(e.workerId as string)),
            0,
          ) +
        ctx.expenses
          .filter((x) => x.matchedJobId === j.id && x.kind === "job_cost")
          .reduce((s, x) => s + (x.amountCents as number), 0);
      const [lo, hi] =
        j._kind === "install" ? cfg.installMarginRange : cfg.serviceMarginRange;
      const m = r.int(lo, hi);
      j.totalCents = jd.length
        ? roundTo(cost / (1 - m / 100), j._kind === "install" ? 1000 : 500)
        : null;
      j._cost = cost;
      if (!jd.length) continue;
      const last = must(jd.at(-1));
      const finished = local(last, "23:59") <= snapshotIso;
      let deposit = 0;
      let quoteId: string | null = null;
      if (j._kind === "install") {
        quoteId = `b-q${pad(counters.quote++, 3)}`;
        j.quoteId = quoteId;
        const sent = addDays(jd[0], -10);
        ctx.quotes.push({
          id: quoteId,
          companyId: C,
          sourceId: quoteId,
          jobId: j.id,
          salespersonWorkerId: j.salespersonWorkerId,
          sentAt: local(sent, "11:00"),
          status: "converted",
          amountCents: j.totalCents,
        });
        deposit = roundTo(
          ((j.totalCents as number) * cfg.installDepositPct) / 100,
          100,
        );
        const pid = `b-pay${pad(counters.pay++, 3)}`;
        ctx.payments.push({
          id: pid,
          companyId: C,
          sourceId: pid,
          invoiceId: null,
          quoteId,
          entryDate: addDays(sent, 2),
          amountCents: deposit,
          paymentType: "credit_card",
          kind: "deposit",
        });
      }
      const issued = addDays(last, 1);
      const iid = `b-in${pad(counters.inv++, 3)}`;
      const issuedOk = issued <= snapshotDate && finished;
      const payDate = addDays(issued, j._kind === "install" ? 5 : 3);
      const paid = issuedOk && payDate <= snapshotDate;
      ctx.invoices.push({
        id: iid,
        companyId: C,
        sourceId: iid,
        jobId: j.id,
        issuedDate: issuedOk ? issued : null,
        dueDate: issuedOk ? addDays(issued, 15) : null,
        status: paid ? "paid" : issuedOk ? "awaiting_payment" : "draft",
        totalCents: j.totalCents,
      });
      j._invoice = iid;
      if (paid) {
        const fid = `b-pay${pad(counters.pay++, 3)}`;
        ctx.payments.push({
          id: fid,
          companyId: C,
          sourceId: fid,
          invoiceId: iid,
          quoteId: null,
          entryDate: payDate,
          amountCents: (j.totalCents as number) - deposit,
          paymentType: r.pick(["check", "credit_card", "ach"]),
          kind: "final",
        });
      }
      j.status = !c.current
        ? "archived"
        : !finished
          ? "active"
          : paid
            ? "archived"
            : "requires_invoicing";
    }

    if (!c.current) {
      pastPay(ctx, c, cycleJobs);
      for (const q of cfg.questions.filter((x) => x.cycle === c.id)) {
        const date = days[q.day];
        const onDay = cycleJobs.filter((j) =>
          (j._days as string[]).includes(date),
        );
        const j1 = must(onDay[0]);
        const j2 = must(onDay[1] ?? cycleJobs[0]);
        const fill = (s: string) =>
          s
            .replaceAll("{date}", shortDate(date))
            .replaceAll("{job1}", String(j1.jobNumber))
            .replaceAll("{job2}", String(j2.jobNumber));
        const to = must(workers.find((w) => w.id === q.to));
        const id = `b-qn-${pad(counters.qn++, 2)}`;
        ctx.questions.push({
          id,
          companyId: C,
          cycleId: c.id,
          flagIds: [],
          toWorkerId: q.to,
          toRole: to.role === "owner" ? "owner" : "manager",
          text: fill(q.text),
          options: q.options ? q.options.map(fill) : null,
          kind: "text",
          status: "answered",
          approvedBy: wid(1),
          approvedAt: local(date, "16:00"),
          sentAt: local(date, "16:01"),
          remindAt: null,
          expiresAt: null,
          interpretationId: null,
        });
      }
    } else {
      plantPayments(ctx, cycleJobs);
    }
  }

  const syncRuns = buildSyncRuns(ctx, cycles, snapshotIso);
  const rules = buildRules(ctx);
  const answerKey = buildAnswerKeyB(ctx);
  const strip = (rows: Rec[]) =>
    rows.map((x) =>
      Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith("_"))),
    );
  const byId = (rows: Rec[]) =>
    [...rows].sort((a, b) =>
      String(a.id).localeCompare(String(b.id), "en", { numeric: true }),
    );
  return {
    "company.json": cfg.company,
    "workers.json": workers,
    "cycles.json": cycles,
    "syncRuns.json": syncRuns,
    "timeEntries.json": byId(ctx.entries),
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

// ---------------------------------------------------------------- past pay (what was paid)

function pastPay(ctx: Ctx, c: CycleCfgB, cycleJobs: Rec[]) {
  const { cfg } = ctx;
  let n = 1;
  const row = (workerId: string, paidVia: string, earnings: Rec[]) =>
    ctx.pastPayrolls.push({
      id: `b-pp-${c.number}${pad(n++, 2)}`,
      companyId: cfg.company.id,
      cycleId: c.id,
      workerId,
      paidVia,
      earnings,
      grossCents: earnings.reduce((s, e) => s + (e.amountCents as number), 0),
    });
  for (const w of cfg.workers) {
    const id = wid(w.n);
    if (w.payType === "hourly") {
      const es = ctx.entries.filter(
        (e) => e.cycleId === c.id && e.workerId === id,
      );
      const { regular, overtime, doubleOvertime } = caOvertime(es);
      const rate = w.gustoRate;
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
      if (doubleOvertime > 0)
        earn.push({
          name: "Double Overtime",
          hours: doubleOvertime,
          rateCents: rate * 2,
          amountCents: Math.round(doubleOvertime * rate * 2),
        });
      row(id, "gusto_regular", earn);
    } else {
      // salary, and the commission salespeople's base draw: annual / 52 per weekly cycle
      row(id, "gusto_regular", [
        {
          name: "Salary",
          hours: null,
          rateCents: w.gustoRate,
          amountCents: Math.round(w.gustoRate / 52),
        },
      ]);
    }
    if (w.payType === "commission") {
      const profit = cycleJobs
        .filter((j) => j._kind === "install" && j.salespersonWorkerId === id)
        .reduce(
          (s, j) => s + ((j.totalCents as number) - (j._cost as number)),
          0,
        );
      if (profit > 0)
        row(id, "gusto_off_cycle", [
          {
            name: "Commission",
            hours: null,
            rateCents: null,
            amountCents: Math.round((profit * cfg.commissionPctOfProfit) / 100),
          },
        ]);
    }
  }
}

// ---------------------------------------------------------------- plants (b-c05)

type DraftB = {
  workerId: string;
  day: string;
  start: string;
  end: string;
  jobId: string | null;
  category: string;
  tag?: string;
};

function plantDrafts(
  drafts: DraftB[],
  days: string[],
  sat: string,
  cycleJobs: Rec[],
) {
  const find = (w: string, day: string, start: string) =>
    must(
      drafts.find(
        (d) => d.workerId === w && d.day === day && d.start === start,
      ),
      `${w} ${day} ${start}`,
    );
  // CHK-01 a parts run with no job (b-w18, Wednesday evening)
  drafts.push({
    workerId: "b-w18",
    day: days[2],
    start: "17:15",
    end: "18:45",
    jobId: null,
    category: "GENERAL",
    tag: "chk01",
  });
  find("b-w18", days[2], "12:30").tag = "chk01ctx";
  // CHK-04 b-w21's afternoon call on Thursday starts 30 min before the morning call ends
  const ov = find("b-w21", days[3], "12:30");
  ov.start = "11:30";
  ov.tag = "chk04b";
  find("b-w21", days[3], "08:00").tag = "chk04a";
  // CHK-03 a real 13 h rooftop day for b-w07 (Wednesday): 8 regular, 4 at 1.5x, 1 at 2x
  const long = find("b-w07", days[2], "07:00");
  long.start = "06:00";
  long.end = "19:00";
  long.tag = "chk03";
  // CHK-22 b-w12 works 10.5 h days and a full Saturday on the team's last job: gross well over +25%
  const b12 = drafts.filter((d) => d.workerId === "b-w12");
  for (const d of b12) d.end = "17:30";
  const lastJob = must(b12.at(-1)).jobId;
  drafts.push({
    workerId: "b-w12",
    day: sat,
    start: "07:00",
    end: "17:00",
    jobId: lastJob,
    category: "GENERAL",
    tag: "chk22sat",
  });
  const job = must(cycleJobs.find((j) => j.id === lastJob));
  if (!(job._days as string[]).includes(sat)) (job._days as string[]).push(sat);
  job.endAt = local(sat, "17:00");
}

function plantExpenses(
  ctx: Ctx,
  cycleJobs: Rec[],
  days: string[],
  exId: () => string,
) {
  const C = ctx.cfg.company.id;
  // CHK-14 a Refrigerant purchase with no job tag (it was for the service job b-w17 worked Tuesday morning)
  const e14: Rec = {
    id: exId(),
    companyId: C,
    source: "qbo",
    sourceId: "",
    date: days[1],
    amountCents: 38640,
    vendor: "Polar Gas Supply",
    description: "R-410A cylinder",
    accountName: "Refrigerant",
    customerRef: null,
    paymentType: "CreditCard",
    kind: "job_cost",
    matchedJobId: null,
    matchConfidence: null,
  };
  e14.sourceId = e14.id;
  ctx.expenses.push(e14);
  ctx.tags.set("chk14", e14);
  // CHK-15 the first install job's Ductwork purchase also entered as a Jobber expense
  const install = must(cycleJobs.find((j) => j._kind === "install"));
  const duct = must(
    ctx.expenses.find(
      (x) =>
        x.matchedJobId === install.id && x.accountName === "Ductwork & Parts",
    ),
  );
  const twin: Rec = {
    id: exId(),
    companyId: C,
    source: "jobber",
    sourceId: "",
    date: duct.date,
    amountCents: duct.amountCents,
    vendor: null,
    description: "Ductwork and fittings",
    accountName: null,
    customerRef: null,
    paymentType: null,
    kind: "job_cost",
    matchedJobId: install.id,
    matchConfidence: 1,
  };
  twin.sourceId = twin.id;
  ctx.expenses.push(twin);
  ctx.tags.set("chk15a", duct);
  ctx.tags.set("chk15b", twin);
}

function plantPayments(ctx: Ctx, cycleJobs: Rec[]) {
  // CHK-19 on the first install job whose invoice is out: the quote deposit is recorded on the invoice as its
  // final payment and the invoice is marked paid; the real final payment has not come in.
  const job = must(
    cycleJobs.find(
      (j) =>
        j._kind === "install" &&
        ctx.invoices.some((i) => i.id === j._invoice && i.status !== "draft"),
    ),
    "an invoiced install job",
  );
  const inv = must(ctx.invoices.find((i) => i.id === job._invoice));
  const deposit = must(
    ctx.payments.find((p) => p.quoteId === job.quoteId && p.kind === "deposit"),
  );
  ctx.payments = ctx.payments.filter(
    (p) => !(p.invoiceId === inv.id && p.kind === "final"),
  );
  deposit.invoiceId = inv.id;
  deposit.kind = "final";
  inv.status = "paid";
  job.status = "archived";
  ctx.tags.set("chk19job", job);
  ctx.tags.set("chk19pay", deposit);
  ctx.tags.set("chk19inv", inv);
}

// ---------------------------------------------------------------- sync runs, rules, answer key

function buildSyncRuns(ctx: Ctx, cycles: Rec[], snapshotIso: string): Rec[] {
  const C = ctx.cfg.company.id;
  const out: Rec[] = [];
  let n = 1;
  const fin = (iso: string) => new Date(Date.parse(iso) + 60_000).toISOString();
  const run = (
    cycleId: string,
    source: string,
    object: string,
    count: number,
    method: string,
    at: string,
  ) =>
    out.push({
      id: `b-sr-${pad(n++, 2)}`,
      companyId: C,
      cycleId,
      source,
      object,
      startedAt: at,
      finishedAt: fin(at),
      pulled: count,
      expected: count,
      complete: true,
      method,
      error: null,
    });
  const cur = must(cycles.find((c) => c.stage !== "closed"));
  const inCur = (date: string) =>
    local(date, "12:00") >= (cur.periodStart as string) &&
    local(date, "12:00") <= (cur.periodEnd as string);
  run(
    cur.id as string,
    "jobber",
    "timeSheetEntries",
    ctx.entries.filter((e) => e.cycleId === cur.id).length,
    "graphql totalCount + timeSheetsByDay",
    snapshotIso,
  );
  run(
    cur.id as string,
    "jobber",
    "visits",
    ctx.visits.filter((v) => inCur(localDate(v.startAt as string))).length,
    "graphql totalCount",
    snapshotIso,
  );
  run(
    cur.id as string,
    "jobber",
    "expenses",
    ctx.expenses.filter((x) => x.source === "jobber" && inCur(x.date as string))
      .length,
    "graphql totalCount",
    snapshotIso,
  );
  run(
    cur.id as string,
    "qbo",
    "Purchase",
    ctx.expenses.filter((x) => x.source === "qbo" && inCur(x.date as string))
      .length,
    "query count(*)",
    snapshotIso,
  );
  run(
    cur.id as string,
    "gusto",
    "employees",
    ctx.workers.filter((w) => w.gusto).length,
    "rest pagination",
    snapshotIso,
  );
  for (const c of cycles.filter((x) => x.stage === "closed")) {
    const at = new Date(
      Date.parse(c.cutoffAt as string) + 5 * 60_000,
    ).toISOString();
    run(
      c.id as string,
      "jobber",
      "timeSheetEntries",
      ctx.entries.filter((e) => e.cycleId === c.id).length,
      "graphql totalCount + timeSheetsByDay",
      at,
    );
  }
  return out;
}

function buildRules(ctx: Ctx): Rec[] {
  const { cfg } = ctx;
  const C = cfg.company.id;
  const hist = cfg.cycles.filter((c) => !c.current).map((c) => c.id);
  let n = 1;
  const rule = (
    type: string,
    params: Rec,
    confidence: number,
    evidence: string[] = hist,
  ) => ({
    id: `b-rule-${pad(n++, 2)}`,
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
  const out: Rec[] = [
    // The payroll lane implements this; it is what past cycles were paid with (pastPayrolls.json).
    rule(
      "overtime_policy",
      {
        jurisdiction: "US-CA",
        workweek: cfg.overtime.workweek,
        dailyHours: 8,
        weeklyHours: 40,
        multiplier: 1.5,
        daily: cfg.overtime.daily,
        weekly: cfg.overtime.weekly,
        seventhConsecutiveDay: cfg.overtime.seventhConsecutiveDay,
        note: "per day: >8 h at 1.5x, >12 h at 2x; per week: regular hours over 40 at 1.5x (daily OT hours excluded); 7th consecutive day not modeled",
      },
      0.95,
    ),
    rule(
      "long_shift_threshold",
      { hours: cfg.company.settings.longShiftHours },
      0.85,
    ),
    ...Object.entries(cfg.expenseAccounts).map(([accountName, kind]) =>
      rule("expense_account_kind", { accountName, kind }, 0.9),
    ),
    rule(
      "commission_plan",
      {
        pctOfJobProfit: cfg.commissionPctOfProfit,
        payee: "quote_salesperson",
        jobKind: "install",
        profit: "job total - (hours x Jobber labour rate) - job-cost expenses",
        paidVia: "off_cycle",
      },
      0.8,
    ),
    rule("tip_policy", { tipsAllowed: false, split: null }, 0.9),
    rule(
      "routing",
      {
        jobFacts: {
          install: cfg.crews.install.manager,
          service: cfg.crews.service.manager,
        },
        money: wid(1),
      },
      0.85,
    ),
    rule(
      "deposit_vs_final",
      {
        quotePayment: "deposit",
        invoicePayment: "final",
        installDepositPct: cfg.installDepositPct,
      },
      0.85,
    ),
  ];
  const last = hist.at(-1);
  for (const w of cfg.workers.filter((x) => x.payType === "hourly")) {
    const paid = must(
      ctx.pastPayrolls.find(
        (p) =>
          p.cycleId === last &&
          p.workerId === wid(w.n) &&
          p.paidVia === "gusto_regular",
      ),
    );
    const rateCents = (paid.earnings as Rec[])[0].rateCents as number;
    out.push(
      rule(
        "pay_rate",
        {
          workerId: wid(w.n),
          rateCents,
          paymentUnit: "Hour",
          costRateCentsPerHour: rateCents,
        },
        0.95,
        [paid.id as string],
      ),
    );
  }
  return out;
}

function buildAnswerKeyB(ctx: Ctx): Rec[] {
  const t = (k: string) => must(ctx.tags.get(k), `tag ${k}`);
  const id = (k: string) => t(k).id as string;
  const rows = [
    {
      checkId: "CHK-01",
      subject: { workerId: "b-w18", entryIds: [id("chk01")] },
      truth: `entry ${id("chk01")} was a parts run for job ${t("chk01ctx").jobId}; the job was not picked on the timer`,
      correctAnswer: {
        kind: "change",
        values: { jobId: t("chk01ctx").jobId as string },
      },
      registerCategory: "hours with no job",
    },
    {
      checkId: "CHK-03",
      subject: {
        workerId: "b-w07",
        jobId: t("chk03").jobId as string,
        entryIds: [id("chk03")],
      },
      truth: `the 13 h day ${id("chk03")} is real (rooftop unit swap); pay 8 h regular, 4 h at 1.5x, 1 h at 2x`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "long or open shifts",
    },
    {
      checkId: "CHK-04",
      subject: { workerId: "b-w21", entryIds: [id("chk04a"), id("chk04b")] },
      truth: `b-w21 started the afternoon call at 12:30 local, not 11:30; ${id("chk04b")} starts at 12:30`,
      correctAnswer: {
        kind: "change",
        values: {
          [`${id("chk04b")}.startAt`]: local(
            localDate(t("chk04b").startAt as string),
            "12:30",
          ),
        },
      },
      registerCategory: "overlapping hours",
    },
    {
      checkId: "CHK-10",
      subject: { workerId: "b-w20" },
      truth:
        "b-w20 is paid $32.00/h (Gusto, and every past payroll); Jobber's $34.00/h labour rate is a typo",
      correctAnswer: {
        kind: "change",
        values: { "jobber.labourRateCents": 3200 },
      },
      registerCategory: "stale rates",
    },
    {
      checkId: "CHK-14",
      subject: { expenseIds: [id("chk14")] },
      truth: `purchase ${id("chk14")} (R-410A, $386.40) was for the service job b-w17 worked Tuesday morning`,
      correctAnswer: {
        kind: "change",
        values: {
          matchedJobId: must(
            ctx.entries.find(
              (e) =>
                e.workerId === "b-w17" &&
                e.cycleId === "b-c05" &&
                (e.startAt as string).startsWith("2026-10-20T15:00"),
            ),
          ).jobId as string,
        },
      },
      registerCategory: "unmatched material purchases",
    },
    {
      checkId: "CHK-15",
      subject: {
        jobId: t("chk15a").matchedJobId as string,
        expenseIds: [id("chk15a"), id("chk15b")],
      },
      truth: `${id("chk15b")} (Jobber) and ${id("chk15a")} (QuickBooks) are the same ductwork purchase; count it once`,
      correctAnswer: {
        kind: "change",
        values: { keep: id("chk15a"), drop: id("chk15b") },
      },
      registerCategory: "costs counted twice",
    },
    {
      checkId: "CHK-19",
      subject: { jobId: id("chk19job") },
      truth: `${id("chk19pay")} is the ${ctx.cfg.installDepositPct}% deposit taken on the quote, not the final payment; the rest of ${id("chk19inv")} is still owed`,
      correctAnswer: {
        kind: "change",
        values: {
          [`${id("chk19pay")}.kind`]: "deposit",
          [`${id("chk19inv")}.status`]: "awaiting_payment",
        },
      },
      registerCategory: "a deposit mistaken for a final payment",
    },
    {
      checkId: "CHK-22",
      subject: { workerId: "b-w12" },
      truth:
        "b-w12 worked 10.5 h days and a full Saturday to finish an install; the higher gross is right",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
    },
    // consequence of the CHK-10 plant: job labour is costed at Jobber's $34.00/h against the $32.00/h pay rate
    {
      checkId: "CHK-18",
      subject: { workerId: "b-w20" },
      truth:
        "b-w20's jobs are costed at Jobber's $34.00/h; the pay rate is $32.00/h (same typo as CHK-10)",
      correctAnswer: {
        kind: "change",
        values: { "jobber.labourRateCents": 3200 },
      },
      registerCategory: "stale rates inflating job profit",
    },
  ];
  return rows.map((r, i) => ({
    id: `b-ak-${pad(i + 1, 2)}`,
    checkId: r.checkId,
    subject: {
      workerId: (r.subject as Rec).workerId ?? null,
      jobId: (r.subject as Rec).jobId ?? null,
      entryIds: (r.subject as Rec).entryIds ?? [],
      expenseIds: (r.subject as Rec).expenseIds ?? [],
    },
    truth: r.truth,
    correctAnswer: r.correctAnswer,
    registerCategory: r.registerCategory,
  }));
}
