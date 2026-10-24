// Planted errors for the current cycle and their answer-key rows.
// Every check CHK-01..CHK-22 is planted at least once. Rows are matched to flags by checkId plus
// overlapping subject ids (never by text). registerCategory names come from the problem register's
// category list (no register rows are copied). The model never sees the answer key.

import type { Ctx, Draft, Rec } from "../generate";
import { must } from "./must";
import { local } from "./time";

type Subject = {
  workerId?: string | null;
  jobId?: string | null;
  entryIds?: string[];
  expenseIds?: string[];
};
type Row = {
  checkId: string;
  subject: Subject;
  truth: string;
  correctAnswer: { kind: string; values: Record<string, string | number> };
  registerCategory: string;
};

const base = (ctx: Ctx, w: string, dayIdx: number): Draft => {
  const d = ctx.drafts.find((x) => x.tags.includes(`base:${w}:${dayIdx}`));
  if (!d) throw new Error(`no baseline entry for ${w} on day ${dayIdx}`);
  return d;
};
const add = (
  ctx: Ctx,
  d: Partial<Draft> & {
    workerId: string;
    dayIdx: number;
    start: string;
    end: string | null;
    tag: string;
  },
) => {
  const { dayIdx, tag, ...rest } = d;
  ctx.drafts.push({
    day: ctx.days[dayIdx],
    jobId: ctx.cfg.current.jobByDay[dayIdx],
    ticking: false,
    approved: true,
    category: "GENERAL",
    hasNote: false,
    ...rest,
    tags: [tag],
  });
};

/** Mutates the current-cycle drafts and records. Ids are assigned afterwards, so plants mark drafts with tags. */
export function plantCurrent(ctx: Ctx): void {
  const C = ctx.companyId;
  // CHK-01 hours with no job (no job, no visit, GENERAL)
  add(ctx, {
    workerId: "a-w05",
    dayIdx: 4,
    start: "08:00",
    end: "12:00",
    jobId: null,
    tag: "chk01",
  });
  // CHK-02 open timer at cutoff (also unapproved: CHK-06)
  add(ctx, {
    workerId: "a-w05",
    dayIdx: 9,
    start: "13:00",
    end: null,
    jobId: "a-j02",
    ticking: true,
    approved: false,
    tag: "chk02",
  });
  // CHK-03 13 h shift (real)
  add(ctx, {
    workerId: "a-w07",
    dayIdx: 7,
    start: "06:00",
    end: "19:00",
    jobId: "a-j05",
    hasNote: true,
    tag: "chk03",
  });
  // CHK-04 overlap for a-w03 (the demo-moment fallback)
  add(ctx, {
    workerId: "a-w03",
    dayIdx: 2,
    start: "07:00",
    end: "15:30",
    jobId: "a-j02",
    tag: "chk04a",
  });
  add(ctx, {
    workerId: "a-w03",
    dayIdx: 2,
    start: "12:00",
    end: "16:00",
    jobId: "a-j02",
    tag: "chk04b",
  });
  // CHK-05 zero-minute entry, and an exact duplicate of a-w02's Tuesday entry
  add(ctx, {
    workerId: "a-w04",
    dayIdx: 8,
    start: "10:15",
    end: "10:15",
    tag: "chk05zero",
  });
  const orig = base(ctx, "a-w02", 1);
  orig.tags.push("chk05orig");
  add(ctx, {
    workerId: "a-w02",
    dayIdx: 1,
    start: orig.start,
    end: orig.end,
    jobId: orig.jobId,
    tag: "dup",
  });
  must(ctx.drafts.at(-1)).tags.push("chk05dup");
  // CHK-06 three entries not approved at cutoff (Friday's entries)
  for (const [w, t] of [
    ["a-w01", "chk06a"],
    ["a-w03", "chk06b"],
    ["a-w04", "chk06c"],
  ]) {
    const d = base(ctx, w, 9);
    d.approved = false;
    d.tags.push(t);
  }
  // CHK-07 a-w06 active with no hours: config gives a-w06 no schedule in a-c05.
  // CHK-08 a-w13 deactivated with entries; CHK-09 a-w14 not onboarded: config.
  // CHK-13 a-j07 completed visit a-v05 with no entries: config (a-w02 and a-w03 logged that day to a-j04).
  for (const w of ["a-w02", "a-w03"]) base(ctx, w, 6).tags.push("chk13");
  // CHK-15 the CHK-14 purchase also entered as a Jobber expense
  ctx.expenses.push({
    id: "a-ex-0009",
    companyId: C,
    source: "jobber",
    sourceId: "a-ex-0009",
    date: "2026-10-21",
    amountCents: 21437,
    vendor: null,
    description: "PVC fittings and valves",
    accountName: null,
    customerRef: null,
    paymentType: null,
    kind: "job_cost",
    matchedJobId: "a-j05",
    matchConfidence: 1,
  });
  // CHK-16 a disposal sub-job naming a-j04's street with no parent, plus its dump fee
  ctx.expenses.push({
    id: "a-ex-0010",
    companyId: C,
    source: "jobber",
    sourceId: "a-ex-0010",
    date: "2026-10-20",
    amountCents: 14250,
    vendor: null,
    description: "Dump fee - Foxglove Ct",
    accountName: null,
    customerRef: null,
    paymentType: null,
    kind: "job_cost",
    matchedJobId: "a-j08",
    matchConfidence: 1,
  });
  // CHK-17 a purchase on an account with no kind rule (Fuel)
  ctx.expenses.push({
    id: "a-ex-0011",
    companyId: C,
    source: "qbo",
    sourceId: "a-ex-0011",
    date: "2026-10-19",
    amountCents: 8640,
    vendor: "Corner Fuel Stop",
    description: "Truck fuel",
    accountName: "Fuel",
    customerRef: null,
    paymentType: "CreditCard",
    kind: "unknown",
    matchedJobId: null,
    matchConfidence: null,
  });
  // CHK-19 the quote deposit on a-q04 recorded against invoice a-in04 as its final payment (invoice marked paid)
  ctx.payments.push({
    id: "a-pay03",
    companyId: C,
    sourceId: "a-pay03",
    invoiceId: "a-in04",
    quoteId: "a-q04",
    entryDate: "2026-10-13",
    amountCents: 120000,
    paymentType: "credit_card",
    kind: "final",
  });
  // CHK-10 (a-w02 rate), CHK-11 (a-w10 no Venmo rate), CHK-12 (a-w08/09/10), CHK-14 (a-ex-0003), CHK-18 (a-w08 Jobber cost rate),
  // CHK-20 (a-q05 salesperson), CHK-21 (a-j05 margin 8%), CHK-22 (a-w04 hours) come from the config.
}

export function buildAnswerKey(ctx: Ctx): Rec[] {
  const one = (tag: string) => {
    const e = ctx.tagged(tag);
    if (e.length !== 1) throw new Error(`tag ${tag}: ${e.length} entries`);
    return e[0].id as string;
  };
  const ids = (tag: string) =>
    ctx
      .tagged(tag)
      .map((e) => e.id as string)
      .sort();
  const workerEntries = (w: string) =>
    ctx.entries
      .filter((e) => e.cycleId === ctx.cfg.current.cycle && e.workerId === w)
      .map((e) => e.id as string)
      .sort();
  const t04a = one("chk04a"),
    t04b = one("chk04b"),
    t02 = one("chk02"),
    dup = one("chk05dup"),
    orig = one("chk05orig");
  const [t13a, t13b] = ids("chk13");
  const rows: Row[] = [
    // v1 rows (fixtures #1), ids a-ak-01..08 kept
    {
      checkId: "CHK-01",
      subject: { workerId: "a-w05", entryIds: [one("chk01")] },
      truth: `entry ${one("chk01")} was on job a-j03 (hedge cleanup); the job was not picked on the timer`,
      correctAnswer: { kind: "change", values: { jobId: "a-j03" } },
      registerCategory: "hours with no job",
    },
    {
      checkId: "CHK-02",
      subject: { workerId: "a-w05", jobId: "a-j02", entryIds: [t02] },
      truth: `a-w05 forgot to clock out; entry ${t02} ended at 17:00 local (4 h)`,
      correctAnswer: {
        kind: "change",
        values: { endAt: local("2026-10-23", "17:00"), durationSec: 4 * 3600 },
      },
      registerCategory: "long or open shifts",
    },
    {
      checkId: "CHK-03",
      subject: { workerId: "a-w07", jobId: "a-j05", entryIds: [one("chk03")] },
      truth: `the 13 h shift ${one("chk03")} on a-j05 is real (irrigation install day); pay it as logged`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "long or open shifts",
    },
    {
      checkId: "CHK-04",
      subject: { workerId: "a-w03", entryIds: [t04a, t04b] },
      truth: `entry ${t04b} belongs to job a-j04 (site prep), not a-j02; a-w03 left a-j02 at 12:00 local, so ${t04a} ends at 12:00`,
      correctAnswer: {
        kind: "change",
        values: {
          [`${t04b}.jobId`]: "a-j04",
          [`${t04a}.endAt`]: local("2026-10-14", "12:00"),
        },
      },
      registerCategory: "overlapping hours",
    },
    {
      checkId: "CHK-05",
      subject: { workerId: "a-w04", entryIds: [one("chk05zero")] },
      truth: `entry ${one("chk05zero")} is an accidental clock-in with no time worked; no hours owed`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "zero-minute entries",
    },
    {
      checkId: "CHK-10",
      subject: { workerId: "a-w02" },
      truth:
        "a-w02 has been at $26.00/h since a-c04 (Gusto paid it in a-c04, Jobber has it); the Gusto compensation effective 2026-10-11 wrongly reverts to $25.00",
      correctAnswer: { kind: "change", values: { "gusto.rateCents": 2600 } },
      registerCategory: "stale rates",
    },
    {
      checkId: "CHK-11",
      subject: { workerId: "a-w10" },
      truth:
        "a-w10 is new this cycle and is paid $22.00/h by Venmo (owner's answer; never assumed)",
      correctAnswer: { kind: "change", values: { venmoRateCents: 2200 } },
      registerCategory: "missing Venmo rates",
    },
    {
      checkId: "CHK-14",
      subject: { expenseIds: ["a-ex-0003"] },
      truth:
        "purchase a-ex-0003 (PVC fittings, $214.37) was for job a-j05 (irrigation install)",
      correctAnswer: { kind: "change", values: { matchedJobId: "a-j05" } },
      registerCategory: "unmatched material purchases",
    },
    // A-04 rows
    {
      checkId: "CHK-05",
      subject: { workerId: "a-w02", entryIds: [orig, dup] },
      truth: `entry ${dup} is an exact duplicate of ${orig}; a-w02 worked that shift once`,
      correctAnswer: { kind: "change", values: { keep: orig, drop: dup } },
      registerCategory: "costs counted twice",
    },
    ...(["chk06a", "chk06b", "chk06c"] as const).map((t) => ({
      checkId: "CHK-06",
      subject: {
        workerId: ctx.tagged(t)[0].workerId as string,
        entryIds: [one(t)],
      },
      truth: `entry ${one(t)} is correct; it was approved after cutoff`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "unapproved hours",
    })),
    {
      checkId: "CHK-06",
      subject: { workerId: "a-w05", entryIds: [t02] },
      truth: `entry ${t02} is unapproved because its timer is still running (see CHK-02)`,
      correctAnswer: {
        kind: "change",
        values: { endAt: local("2026-10-23", "17:00"), durationSec: 4 * 3600 },
      },
      registerCategory: "long or open shifts",
    },
    {
      checkId: "CHK-07",
      subject: { workerId: "a-w06" },
      truth:
        "a-w06 was not scheduled this cycle; no hours are owed and the worker stays active",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "missing hours",
    },
    {
      checkId: "CHK-08",
      subject: { workerId: "a-w13", entryIds: workerEntries("a-w13") },
      truth:
        "a-w13 worked these two days before leaving; pay them, then deactivate a-w13 in Gusto too",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "inactive worker with hours",
    },
    {
      checkId: "CHK-09",
      subject: { workerId: "a-w14" },
      truth:
        "a-w14 is a new hire who has not finished Gusto onboarding; hold a-w14's pay until onboarding is complete",
      correctAnswer: { kind: "escalate", values: {} },
      registerCategory: "worker not onboarded",
    },
    ...["a-w08", "a-w09", "a-w10"].map((w) => ({
      checkId: "CHK-12",
      subject: { workerId: w },
      truth: `${w} is outside the Jobber-to-Gusto sync (salaried or Venmo); listed on the workbook, not an error`,
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "outside the sync (salaried, contractor)",
    })),
    {
      checkId: "CHK-13",
      subject: { jobId: "a-j07", entryIds: [t13a, t13b] },
      truth: `a-w02 and a-w03 did the a-j07 visit on 2026-10-20 but logged the day to a-j04 (${t13a}, ${t13b})`,
      correctAnswer: {
        kind: "change",
        values: { [`${t13a}.jobId`]: "a-j07", [`${t13b}.jobId`]: "a-j07" },
      },
      registerCategory: "hours with no job",
    },
    {
      checkId: "CHK-15",
      subject: { jobId: "a-j05", expenseIds: ["a-ex-0003", "a-ex-0009"] },
      truth:
        "a-ex-0009 (Jobber) and a-ex-0003 (QuickBooks) are the same $214.37 purchase; count it once, on a-j05",
      correctAnswer: {
        kind: "change",
        values: {
          keep: "a-ex-0003",
          drop: "a-ex-0009",
          "a-ex-0003.matchedJobId": "a-j05",
        },
      },
      registerCategory: "costs counted twice",
    },
    {
      checkId: "CHK-16",
      subject: { jobId: "a-j08", expenseIds: ["a-ex-0010"] },
      truth:
        "a-j08 (disposal run, Foxglove Ct) belongs to a-j04 (retaining wall, Foxglove Ct); its dump fee is a-j04's cost",
      correctAnswer: {
        kind: "change",
        values: { "a-j08.parentJobId": "a-j04" },
      },
      registerCategory: "disposal not linked to its parent job",
    },
    {
      checkId: "CHK-17",
      subject: { expenseIds: ["a-ex-0011"] },
      truth: "Fuel is overhead unless the receipt names a job (owner policy)",
      correctAnswer: { kind: "change", values: { kind: "overhead" } },
      registerCategory: "expense category unknown",
    },
    {
      checkId: "CHK-18",
      subject: { workerId: "a-w08" },
      truth:
        "Jobber still costs a-w08 at $30.00/h; since the a-c04 raise to $67,600/yr the cost is $32.50/h, so job profit is overstated",
      correctAnswer: {
        kind: "change",
        values: { "jobber.labourRateCents": 3250 },
      },
      registerCategory: "stale rates inflating job profit",
    },
    {
      checkId: "CHK-19",
      subject: { jobId: "a-j09" },
      truth:
        "a-pay03 ($1,200.00) is the deposit taken on quote a-q04, not the final payment; $2,800.00 is still owed on a-in04",
      correctAnswer: {
        kind: "change",
        values: {
          "a-pay03.kind": "deposit",
          "a-in04.status": "awaiting_payment",
        },
      },
      registerCategory: "a deposit mistaken for a final payment",
    },
    {
      checkId: "CHK-20",
      subject: { workerId: "a-w12", jobId: "a-j10" },
      truth:
        "a-w05 quoted a-j10 (landscape lighting) in person; the quote's salesperson should be a-w05, who earns the commission",
      correctAnswer: {
        kind: "change",
        values: { "a-q05.salespersonWorkerId": "a-w05" },
      },
      registerCategory: "wrong in-person quoter",
    },
    {
      checkId: "CHK-21",
      subject: { jobId: "a-j05" },
      truth:
        "a-j05's margin is about 8% before the unmatched fittings purchase; the job was underpriced (owner confirms)",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "low job profit",
    },
    {
      checkId: "CHK-22",
      subject: { workerId: "a-w04" },
      truth:
        "a-w04 picked up a-w06's shifts this cycle (10 h days, overtime in week 1); the higher gross is right",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
    },
    // consequence of the CHK-07 plant: a-w06's gross drops 100% vs the last three cycles
    {
      checkId: "CHK-22",
      subject: { workerId: "a-w06" },
      truth:
        "a-w06 has no hours this cycle (see CHK-07); a zero gross is right",
      correctAnswer: { kind: "confirm", values: {} },
      registerCategory: "gross change over 25%",
    },
  ];
  return rows.map((r, i) => ({
    id: `a-ak-${String(i + 1).padStart(2, "0")}`,
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
  }));
}
