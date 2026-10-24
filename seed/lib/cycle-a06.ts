// Company A cycle 2 (a-c06): the same planted-error mix as a-c05 on new records, for the demo's
// "cycle 2 asks fewer questions" (M3). Written as an extension next to the base fixtures
// (data/fixtures/a/cycles/a-c06/), so the base files and their hash stay byte-identical.
//
// Each a-c06 answer-key row says whether a rule learned from cycle 1's answers resolves it without a
// question (`resolvableByRuleType`, the RuleType, or null when it must still be asked).

import { withPayrollSourceId, withReimbursement } from "./contract";
import { flagsFromAnswerKey } from "./flags";
import { must } from "./must";
import {
  addDays,
  fridayOnOrBefore,
  localDateOf,
  local as localIn,
  seconds,
  workdays,
} from "./time";

type Rec = Record<string, unknown>;
export type CycleExtConfig = {
  cycle: {
    id: string;
    number: number;
    start: string;
    end: string;
    gustoPayrollId: string | null;
  };
  snapshot: string;
  shift: { start: string; end: string };
  schedule: Record<string, { days: number[] }>;
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
};

type Draft = {
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

/**
 * @param base the base Company A output of generate() (workers, rules, entries used for a-c05 as paid)
 * @param baseKey the base answer key (a-c05) whose corrections define what a-c05 was actually paid
 */
export function generateCycleA06(
  ext: CycleExtConfig,
  base: Record<string, Rec[] | Rec>,
  tz: string,
  holidays: string[],
): Record<string, unknown> {
  const local = (d: string, t: string) => localIn(d, t, tz);
  const company = base["company.json"] as Rec;
  const C = company.id as string;
  const workers = base["workers.json"] as Rec[];
  const days = workdays(ext.cycle.start, ext.cycle.end, holidays);
  if (days.length !== 10)
    throw new Error(`a-c06 has ${days.length} working days`);
  const snapshotIso = local(ext.snapshot.slice(0, 10), ext.snapshot.slice(11));
  const sats = [ext.cycle.start, addDays(ext.cycle.start, 7)];

  // ---- entries: schedule + plants (same mix as a-c05, new records)
  const drafts: Draft[] = [];
  const add = (
    d: Partial<Draft> & {
      workerId: string;
      day: string;
      start: string;
      end: string | null;
      tag?: string;
    },
  ) => {
    const { tag, ...rest } = d;
    drafts.push({
      jobId: null,
      ticking: false,
      approved: true,
      category: "GENERAL",
      hasNote: false,
      ...rest,
      tags: tag ? [tag] : [],
    } as Draft);
  };
  for (const [w, s] of Object.entries(ext.schedule)) {
    for (const i of s.days)
      add({
        workerId: w,
        day: days[i],
        start: ext.shift.start,
        end: ext.shift.end,
        jobId: ext.jobByDay[i],
        tag: `base:${w}:${i}`,
      });
  }
  const base_ = (w: string, i: number) =>
    must(
      drafts.find((d) => d.tags.includes(`base:${w}:${i}`)),
      `${w} day ${i}`,
    );
  add({
    workerId: "a-w05",
    day: days[4],
    start: "08:00",
    end: "12:00",
    jobId: null,
    tag: "chk01",
  }); // CHK-01
  add({
    workerId: "a-w05",
    day: days[9],
    start: "13:00",
    end: null,
    jobId: "a-j62",
    ticking: true,
    approved: false,
    tag: "chk02",
  }); // CHK-02
  add({
    workerId: "a-w07",
    day: days[7],
    start: "06:00",
    end: "19:00",
    jobId: "a-j65",
    hasNote: true,
    tag: "chk03",
  }); // CHK-03
  add({
    workerId: "a-w03",
    day: days[2],
    start: "07:00",
    end: "15:30",
    jobId: "a-j62",
    tag: "chk04a",
  }); // CHK-04
  add({
    workerId: "a-w03",
    day: days[2],
    start: "12:00",
    end: "16:00",
    jobId: "a-j62",
    tag: "chk04b",
  });
  add({
    workerId: "a-w04",
    day: days[8],
    start: "10:15",
    end: "10:15",
    jobId: ext.jobByDay[8],
    tag: "chk05zero",
  }); // CHK-05
  const orig = base_("a-w02", 1);
  orig.tags.push("chk05orig");
  add({
    workerId: "a-w02",
    day: orig.day,
    start: orig.start,
    end: orig.end,
    jobId: orig.jobId,
    tag: "chk05dup",
  });
  for (const [w, t] of [
    ["a-w01", "chk06a"],
    ["a-w03", "chk06b"],
    ["a-w04", "chk06c"],
  ]) {
    const d = base_(w, 9);
    d.approved = false;
    d.tags.push(t);
  }
  for (const w of ["a-w02", "a-w03"]) base_(w, 6).tags.push("chk13");
  // CHK-22: a-w01 also works both Saturdays (11 h overtime a week)
  for (const s of sats)
    add({
      workerId: "a-w01",
      day: s,
      start: "07:00",
      end: "15:30",
      jobId: s === sats[0] ? "a-j69" : "a-j62",
      tag: "chk22sat",
    });

  drafts.sort((a, b) =>
    (local(a.day, a.start) + a.workerId).localeCompare(
      local(b.day, b.start) + b.workerId,
    ),
  );
  const visitIdFor = (jobId: string | null, day: string) =>
    ext.visits.find(
      (v) => v.job === jobId && days[v.day] === day && !v.assigned,
    )?.id ?? null;
  const entries: Rec[] = drafts.map((d, i) => {
    const id = `a-te-${String(601 + i).padStart(4, "0")}`;
    const startAt = local(d.day, d.start);
    const endAt = d.end === null ? null : local(d.day, d.end);
    return {
      id,
      companyId: C,
      cycleId: ext.cycle.id,
      sourceId: id,
      workerId: d.workerId,
      jobId: d.jobId,
      visitId: visitIdFor(d.jobId, d.day),
      startAt,
      endAt,
      durationSec: d.ticking
        ? seconds(startAt, snapshotIso)
        : seconds(startAt, must(endAt)),
      ticking: d.ticking,
      approved: d.approved,
      approvedBy: d.approved ? "a-w11" : null,
      payable: true,
      category: d.category,
      label: null,
      hasNote: d.hasNote,
      _tags: d.tags,
    };
  });
  if (entries.length > 99)
    throw new Error("a-c06 entry ids would leave the a-te-06xx range");
  const tagged = (t: string) =>
    entries
      .filter((e) => (e._tags as string[]).includes(t))
      .map((e) => e.id as string)
      .sort();
  const one = (t: string) => must(tagged(t)[0], t);

  // ---- jobs, visits, expenses, totals
  const jobs: Rec[] = ext.jobs.map((j) => ({
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
  }));
  const jobNum = (id: string) =>
    must(
      jobs.find((j) => j.id === id),
      id,
    ).jobNumber as number;
  const expense = (
    e: CycleExtConfig["expenses"][number] & {
      vendor?: string | null;
      account?: string | null;
    },
  ) => {
    const qbo = e.source === "qbo";
    return {
      id: e.id,
      companyId: C,
      source: e.source,
      sourceId: e.id,
      date: e.date,
      amountCents: e.amountCents,
      vendor: qbo ? (e.vendor ?? null) : null,
      description: e.description,
      accountName: qbo ? (e.account ?? null) : null,
      customerRef: qbo && e.job ? String(jobNum(e.job)) : null,
      paymentType: qbo ? "CreditCard" : null,
      kind: e.kind,
      matchedJobId: e.job,
      matchConfidence: e.job ? 1 : null,
    };
  };
  const expenses: Rec[] = ext.expenses.map(expense);
  // plants on expenses: CHK-15 Jobber twin of the CHK-14 purchase, CHK-16 dump fee, CHK-17 Fuel
  expenses.push(
    expense({
      id: "a-ex-0609",
      source: "jobber",
      date: "2026-11-04",
      amountCents: 18755,
      description: "Irrigation valves and fittings",
      job: "a-j65",
      kind: "job_cost",
    }),
  );
  expenses.push(
    expense({
      id: "a-ex-0610",
      source: "jobber",
      date: "2026-11-03",
      amountCents: 13900,
      description: "Dump fee - Brookhollow Ct",
      job: "a-j68",
      kind: "job_cost",
    }),
  );
  expenses.push(
    expense({
      id: "a-ex-0611",
      source: "qbo",
      date: "2026-11-02",
      amountCents: 9120,
      vendor: "Highway 9 Fuel",
      description: "Truck fuel",
      account: "Fuel",
      job: null,
      kind: "unknown",
    }),
  );

  const rateOf = (w: string) =>
    ((
      must(
        workers.find((x) => x.id === w),
        w,
      ).jobber as Rec
    ).labourRateCents as number | null) ?? 0;
  const cost = (jobId: string) =>
    entries
      .filter((e) => e.jobId === jobId)
      .reduce(
        (s, e) =>
          s +
          Math.round(
            ((e.durationSec as number) / 3600) * rateOf(e.workerId as string),
          ),
        0,
      ) +
    expenses
      .filter((x) => x.matchedJobId === jobId && x.kind === "job_cost")
      .reduce((s, x) => s + (x.amountCents as number), 0);
  for (const j of ext.jobs) {
    if (j.marginPct === undefined) continue;
    must(jobs.find((x) => x.id === j.id)).totalCents =
      Math.round(cost(j.id) / (1 - j.marginPct / 100) / 1000) * 1000;
  }
  const total = (id: string) =>
    must(
      jobs.find((j) => j.id === id),
      id,
    ).totalCents as number;

  const visits: Rec[] = ext.visits.map((v) => ({
    id: v.id,
    companyId: C,
    jobId: v.job,
    sourceId: v.id,
    startAt: local(days[v.day], "07:00"),
    endAt: local(days[v.day], "15:30"),
    isComplete: true,
    assignedWorkerIds:
      v.assigned ??
      [
        ...new Set(
          entries
            .filter((e) => e.visitId === v.id)
            .map((e) => e.workerId as string),
        ),
      ].sort(),
  }));
  const quotes: Rec[] = ext.quotes.map((q) => ({
    id: q.id,
    companyId: C,
    sourceId: q.id,
    jobId: q.job,
    salespersonWorkerId: q.salesperson,
    sentAt: local(q.sentAt.slice(0, 10), q.sentAt.slice(11)),
    status: q.status,
    amountCents: q.amountCents ?? total(must(q.job)),
  }));
  const invoices: Rec[] = ext.invoices.map((i) => ({
    id: i.id,
    companyId: C,
    sourceId: i.id,
    jobId: i.job,
    issuedDate: i.issued,
    dueDate: i.due,
    status: i.status,
    totalCents: total(i.job),
  }));
  const payments: Rec[] = ext.payments.map((p) => ({
    id: p.id,
    companyId: C,
    sourceId: p.id,
    invoiceId: p.invoice,
    quoteId: p.quote,
    entryDate: p.date,
    amountCents:
      p.amountCents === "invoiceTotal"
        ? (must(invoices.find((i) => i.id === p.invoice)).totalCents as number)
        : p.amountCents,
    paymentType: p.type,
    kind: p.kind,
  }));
  // CHK-19: the 30% deposit on a-q63 recorded against invoice a-in63 as its final payment
  payments.push({
    id: "a-pay63",
    companyId: C,
    sourceId: "a-pay63",
    invoiceId: "a-in63",
    quoteId: "a-q63",
    entryDate: "2026-10-27",
    amountCents: 108000,
    paymentType: "credit_card",
    kind: "final",
  });

  // ---- cycle, sync runs, and what a-c05 was paid (history for a-c06's CHK-22)
  const cycle = {
    id: ext.cycle.id,
    companyId: C,
    number: ext.cycle.number,
    periodStart: local(ext.cycle.start, "00:00"),
    periodEnd: new Date(
      Date.parse(local(addDays(ext.cycle.end, 1), "00:00")) - 1,
    ).toISOString(),
    cutoffAt: local(fridayOnOrBefore(ext.cycle.end), "18:00"),
    stage: "setup",
    gustoPayrollId: ext.cycle.gustoPayrollId,
    gustoOffCyclePayrollId: null,
    questionsAsked: 0,
  };
  const inCycle = (date: string) =>
    date >= ext.cycle.start && date <= ext.cycle.end;
  const fin = new Date(Date.parse(snapshotIso) + 60_000).toISOString();
  const run = (
    n: number,
    source: string,
    object: string,
    count: number,
    method: string,
  ) => ({
    id: `a-sr-${60 + n}`,
    companyId: C,
    cycleId: ext.cycle.id,
    source,
    object,
    startedAt: snapshotIso,
    finishedAt: fin,
    pulled: count,
    expected: count,
    complete: true,
    method,
    error: null,
  });
  const syncRuns = [
    run(
      1,
      "jobber",
      "timeSheetEntries",
      entries.length,
      "graphql totalCount + timeSheetsByDay",
    ),
    run(
      2,
      "qbo",
      "Purchase",
      expenses.filter((x) => x.source === "qbo" && inCycle(x.date as string))
        .length,
      "query count(*)",
    ),
    run(
      3,
      "gusto",
      "employees",
      workers.filter((w) => w.gusto).length,
      "rest pagination",
    ),
    run(
      4,
      "jobber",
      "expenses",
      expenses.filter((x) => x.source === "jobber" && inCycle(x.date as string))
        .length,
      "graphql totalCount",
    ),
    run(5, "jobber", "visits", visits.length, "graphql totalCount"),
  ];

  const pastPayrolls = paidA05(base, tz);
  const answerKey = answerKeyA06(one, tagged, entries);
  const strip = (rows: Rec[]) =>
    rows.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))),
    );
  return {
    "cycles.json": [cycle],
    "syncRuns.json": syncRuns,
    "timeEntries.json": strip(entries),
    "jobs.json": jobs,
    "visits.json": visits,
    "quotes.json": quotes,
    "invoices.json": invoices,
    "payments.json": payments,
    "expenses.json": withReimbursement(
      [...expenses].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    ),
    "pastPayrolls.json": withPayrollSourceId(pastPayrolls),
    "answer-key.json": answerKey,
    "flags.json": flagsFromAnswerKey(answerKey, {
      companyId: C,
      cycleId: ext.cycle.id,
      idPrefix: `${C}-fl-6`,
      settings: company.settings as Rec,
      entries,
      expenses,
      jobs,
      workers,
      rules: base["rules.json"] as Rec[],
      payments,
      invoices,
      quotes,
      syncRuns,
      lowMarginPct: (company.settings as Rec).lowMarginPct as number,
      priorFlags: base["flags.json"] as Rec[],
      priorCutoffDate: "2026-10-23",
    }),
  };
}

/**
 * What a-c05 was paid once cycle 1's answers were applied (the a-c05 answer key): the duplicate dropped,
 * the open timer closed at 17:00 (4 h), a-te-0111 ending at 12:00, a-w02 at $26.00/h, a-w10 at $22.00/h by
 * Venmo, a-w14 held until onboarding. Regular and Venmo pay only (Stage 1).
 */
function paidA05(base: Record<string, Rec[] | Rec>, tz: string): Rec[] {
  const C = (base["company.json"] as Rec).id as string;
  const workers = base["workers.json"] as Rec[];
  const rules = base["rules.json"] as Rec[];
  const entries = (base["timeEntries.json"] as Rec[]).filter(
    (e) => e.cycleId === "a-c05" && e.id !== "a-te-0146",
  );
  const hours = (e: Rec) => {
    if (e.id === "a-te-0140") return 4;
    if (e.id === "a-te-0111")
      return (
        (Date.parse(local05("2026-10-14", "12:00", tz)) -
          Date.parse(e.startAt as string)) /
        3_600_000
      );
    return (e.durationSec as number) / 3600;
  };
  const payRate = (w: string) =>
    (
      rules.find(
        (r) => r.type === "pay_rate" && (r.params as Rec).workerId === w,
      )?.params as Rec | undefined
    )?.rateCents as number | undefined;
  const out: Rec[] = [];
  let n = 1;
  for (const w of workers) {
    const id = w.id as string;
    if (id === "a-w14") continue; // held: onboarding not finished (CHK-09 answer)
    const mine = entries.filter((e) => e.workerId === id);
    const g = w.gusto as Rec | null;
    const row = (paidVia: string, earnings: Rec[]) =>
      out.push({
        id: `a-pp-5${String(n++).padStart(2, "0")}`,
        companyId: C,
        cycleId: "a-c05",
        workerId: id,
        paidVia,
        earnings,
        grossCents: earnings.reduce((s, x) => s + (x.amountCents as number), 0),
      });
    if (w.payType === "contractor_venmo") {
      const rate =
        (w.venmoRateCents as number | null) ?? (id === "a-w10" ? 2200 : null); // a-w10: the owner's cycle 1 answer
      if (rate === null || !mine.length) continue;
      const h = mine.reduce((s, e) => s + hours(e), 0);
      row("venmo", [
        {
          name: "Hours",
          hours: h,
          rateCents: rate,
          amountCents: Math.round(h * rate),
        },
      ]);
    } else if (w.payType === "salary") {
      row("gusto_regular", [
        {
          name: "Salary",
          hours: null,
          rateCents: g?.rateCents ?? null,
          amountCents: Math.round((g?.rateCents as number) / 26),
        },
      ]);
    } else {
      if (!mine.length) continue;
      const rate = payRate(id) ?? (g?.rateCents as number);
      const weeks = new Map<number, number>();
      for (const e of mine) {
        const d = localDateOf(e.startAt as string, tz);
        const wk = Math.floor(
          (Date.parse(`${d}T12:00:00Z`) - Date.parse("2026-10-10T12:00:00Z")) /
            (7 * 86_400_000),
        );
        weeks.set(wk, (weeks.get(wk) ?? 0) + hours(e));
      }
      let reg = 0;
      let ot = 0;
      for (const h of weeks.values()) {
        reg += Math.min(h, 40);
        ot += Math.max(0, h - 40);
      }
      const earn: Rec[] = [
        {
          name: "Regular Hours",
          hours: reg,
          rateCents: rate,
          amountCents: Math.round(reg * rate),
        },
      ];
      if (ot > 0)
        earn.push({
          name: "Overtime",
          hours: ot,
          rateCents: Math.round(rate * 1.5),
          amountCents: Math.round(ot * rate * 1.5),
        });
      row("gusto_regular", earn);
    }
  }
  return out;
}
const local05 = (d: string, t: string, tz: string) => localIn(d, t, tz);

function answerKeyA06(
  one: (t: string) => string,
  tagged: (t: string) => string[],
  entries: Rec[],
): Rec[] {
  const [t13a, t13b] = tagged("chk13");
  const C6 = "a-c06";
  const rows: {
    checkId: string;
    subject: Rec;
    truth: string;
    correctAnswer: Rec;
    registerCategory: string;
    resolvableByRuleType: string | null;
  }[] = [
    {
      checkId: "CHK-01",
      subject: { workerId: "a-w05", entryIds: [one("chk01")] },
      truth: `entry ${one("chk01")} was on job a-j63 (hedge cleanup)`,
      correctAnswer: { kind: "change", values: { jobId: "a-j63" } },
      registerCategory: "hours with no job",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-02",
      subject: { workerId: "a-w05", jobId: "a-j62", entryIds: [one("chk02")] },
      truth: `a-w05 forgot to clock out again; ${one("chk02")} ended at 17:00 local (4 h)`,
      correctAnswer: {
        kind: "change",
        values: {
          endAt: localIn("2026-11-06", "17:00", "America/New_York"),
          durationSec: 14400,
        },
      },
      registerCategory: "long or open shifts",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-03",
      subject: { workerId: "a-w07", jobId: "a-j65", entryIds: [one("chk03")] },
      truth: `the 13 h shift ${one("chk03")} on a-j65 is real (irrigation install day)`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "long or open shifts",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-04",
      subject: { workerId: "a-w03", entryIds: [one("chk04a"), one("chk04b")] },
      truth: `entry ${one("chk04b")} belongs to job a-j64 (site prep), not a-j62; ${one("chk04a")} ends at 12:00`,
      correctAnswer: {
        kind: "change",
        values: {
          [`${one("chk04b")}.jobId`]: "a-j64",
          [`${one("chk04a")}.endAt`]: localIn(
            "2026-10-28",
            "12:00",
            "America/New_York",
          ),
        },
      },
      registerCategory: "overlapping hours",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-05",
      subject: { workerId: "a-w04", entryIds: [one("chk05zero")] },
      truth: `${one("chk05zero")} is an accidental clock-in; no hours owed`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "zero-minute entries",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-05",
      subject: {
        workerId: "a-w02",
        entryIds: [one("chk05orig"), one("chk05dup")],
      },
      truth: `${one("chk05dup")} duplicates ${one("chk05orig")}`,
      correctAnswer: {
        kind: "change",
        values: { keep: one("chk05orig"), drop: one("chk05dup") },
      },
      registerCategory: "costs counted twice",
      resolvableByRuleType: null,
    },
    ...(["chk06a", "chk06b", "chk06c"] as const).map((t) => ({
      checkId: "CHK-06",
      subject: {
        workerId: must(entries.find((e) => e.id === one(t))).workerId,
        entryIds: [one(t)],
      },
      truth: `${one(t)} is correct; approved after cutoff`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "unapproved hours",
      resolvableByRuleType: null,
    })),
    {
      checkId: "CHK-06",
      subject: { workerId: "a-w05", entryIds: [one("chk02")] },
      truth: `${one("chk02")} is unapproved because the timer is running (see CHK-02)`,
      correctAnswer: { kind: "change", values: { durationSec: 14400 } },
      registerCategory: "long or open shifts",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-07",
      subject: { workerId: "a-w06" },
      truth: "a-w06 was not scheduled again this cycle",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "missing hours",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-08",
      subject: { workerId: "a-w13" },
      truth:
        "a-w13 is deactivated in Jobber but still active in Gusto; terminate in Gusto",
      correctAnswer: { kind: "fixed_in_source", values: {} },
      registerCategory: "inactive worker with hours",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-09",
      subject: { workerId: "a-w14" },
      truth: "a-w14 still has not finished Gusto onboarding; hold pay",
      correctAnswer: { kind: "escalate", values: {} },
      registerCategory: "worker not onboarded",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-10",
      subject: { workerId: "a-w02" },
      truth:
        "same as cycle 1: a-w02 is $26.00/h; Gusto's compensation still says $25.00",
      correctAnswer: { kind: "change", values: { "gusto.rateCents": 2600 } },
      registerCategory: "stale rates",
      resolvableByRuleType: "pay_rate",
    },
    {
      checkId: "CHK-11",
      subject: { workerId: "a-w10" },
      truth: "a-w10 is paid $22.00/h by Venmo (cycle 1 answer)",
      correctAnswer: { kind: "change", values: { venmoRateCents: 2200 } },
      registerCategory: "missing Venmo rates",
      resolvableByRuleType: "venmo_rate",
    },
    ...["a-w08", "a-w09", "a-w10"].map((w) => ({
      checkId: "CHK-12",
      subject: { workerId: w },
      truth: `${w} is outside the sync; workbook note`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "outside the sync (salaried, contractor)",
      resolvableByRuleType: null,
    })),
    {
      checkId: "CHK-13",
      subject: { jobId: "a-j67", entryIds: [t13a, t13b] },
      truth: `a-w02 and a-w03 did the a-j67 visit but logged the day to a-j64 (${t13a}, ${t13b})`,
      correctAnswer: {
        kind: "change",
        values: { [`${t13a}.jobId`]: "a-j67", [`${t13b}.jobId`]: "a-j67" },
      },
      registerCategory: "hours with no job",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-14",
      subject: { expenseIds: ["a-ex-0603"] },
      truth:
        "a-ex-0603 (Cedar Creek Supply irrigation fittings) is for a-j65, the only irrigation job running; same vendor and kind as cycle 1's a-ex-0003",
      correctAnswer: { kind: "change", values: { matchedJobId: "a-j65" } },
      registerCategory: "unmatched material purchases",
      resolvableByRuleType: "vendor_job_hint",
    },
    {
      checkId: "CHK-15",
      subject: { jobId: "a-j65", expenseIds: ["a-ex-0603", "a-ex-0609"] },
      truth:
        "a-ex-0609 (Jobber) and a-ex-0603 (QuickBooks) are the same purchase",
      correctAnswer: {
        kind: "change",
        values: { keep: "a-ex-0603", drop: "a-ex-0609" },
      },
      registerCategory: "costs counted twice",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-16",
      subject: { jobId: "a-j68", expenseIds: ["a-ex-0610"] },
      truth:
        "a-j68 (disposal run, Brookhollow Ct) belongs to a-j64 (Brookhollow Ct)",
      correctAnswer: {
        kind: "change",
        values: { "a-j68.parentJobId": "a-j64" },
      },
      registerCategory: "disposal not linked to its parent job",
      resolvableByRuleType: "disposal_parent_link",
    },
    {
      checkId: "CHK-17",
      subject: { expenseIds: ["a-ex-0611"] },
      truth: "Fuel is overhead (owner's cycle 1 answer)",
      correctAnswer: { kind: "change", values: { kind: "overhead" } },
      registerCategory: "expense category unknown",
      resolvableByRuleType: "expense_account_kind",
    },
    {
      checkId: "CHK-18",
      subject: { workerId: "a-w08" },
      truth: "Jobber still costs a-w08 at $30.00/h; the cost is $32.50/h",
      correctAnswer: {
        kind: "change",
        values: { "jobber.labourRateCents": 3250 },
      },
      registerCategory: "stale rates inflating job profit",
      resolvableByRuleType: "pay_rate",
    },
    {
      checkId: "CHK-19",
      subject: { jobId: "a-j69" },
      truth:
        "a-pay63 ($1,080.00) is the deposit on a-q63, not the final payment; $2,520.00 is still owed on a-in63",
      correctAnswer: {
        kind: "change",
        values: {
          "a-pay63.kind": "deposit",
          "a-in63.status": "awaiting_payment",
        },
      },
      registerCategory: "a deposit mistaken for a final payment",
      resolvableByRuleType: "deposit_vs_final",
    },
    {
      checkId: "CHK-20",
      subject: { workerId: "a-w12", jobId: "a-j70" },
      truth:
        "a-w05 quoted the lighting job a-j70 in person; salesperson should be a-w05",
      correctAnswer: {
        kind: "change",
        values: { "a-q64.salespersonWorkerId": "a-w05" },
      },
      registerCategory: "wrong in-person quoter",
      resolvableByRuleType: "in_person_quoter",
    },
    {
      checkId: "CHK-21",
      subject: { jobId: "a-j65" },
      truth: "a-j65's margin is about 8%; underpriced (owner confirms)",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "low job profit",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-22",
      subject: { workerId: "a-w01" },
      truth:
        "a-w01 worked both Saturdays (11 h overtime a week); the higher gross is right",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-22",
      subject: { workerId: "a-w06" },
      truth: "a-w06 has no hours again (see CHK-07)",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
      resolvableByRuleType: null,
    },
    // consequences: a-w13 left after a-c05 (zero this cycle); a-w10's Stage 1 gross is unknown until the Venmo rate is known
    {
      checkId: "CHK-22",
      subject: { workerId: "a-w13" },
      truth: "a-w13 left after a-c05; no hours this cycle is right",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
      resolvableByRuleType: null,
    },
    {
      checkId: "CHK-22",
      subject: { workerId: "a-w10" },
      truth:
        "a-w10's gross only looks like a drop because the Venmo rate is missing; at $22.00/h it is in line",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
      resolvableByRuleType: "venmo_rate",
    },
  ];
  return rows.map((r, i) => ({
    id: `a-ak-${String(61 + i).padStart(2, "0")}`,
    cycleId: C6,
    checkId: r.checkId,
    subject: {
      workerId: r.subject.workerId ?? null,
      jobId: r.subject.jobId ?? null,
      entryIds: r.subject.entryIds ?? [],
      expenseIds: r.subject.expenseIds ?? [],
    },
    truth: r.truth,
    correctAnswer: r.correctAnswer,
    registerCategory: r.registerCategory,
    resolvableByRuleType: r.resolvableByRuleType,
  }));
}
