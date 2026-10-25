import "server-only";
import stage2Fixture from "@/app/_fixtures/stage2.json";
import workbookFixture from "@/app/_fixtures/workbook.json";
import { periodLabel } from "@/components/workbook/data";
import { checkTitle } from "@/lib/checks";
import { clock, flagKey, SOURCES } from "@/lib/home";
import { formatCents } from "@/lib/money";
import { redactFlag, type Viewer } from "@/lib/policy";
import { homeView } from "@/lib/server/fixtures";
import type { Flag, SourceSystem } from "@/lib/types";
import type { Cycle, SyncRun } from "@/lib/view-types";
import type {
  CarryItem,
  Commission,
  DakotaItem,
  DakotaReview,
  HomeBoardData,
  HomeCard,
  JobProfitRow,
  NextPayroll,
  ReviewPerson,
  SourceRef,
  Stage1Review,
  Stage2Review,
} from "@/lib/view-types/home";
import companyA from "../../../../../data/fixtures/a/company.json";
import nextCyclesA from "../../../../../data/fixtures/a/cycles/a-c06/cycles.json";
import cyclesA from "../../../../../data/fixtures/a/cycles.json";
import expensesA from "../../../../../data/fixtures/a/expenses.json";
import flagsA from "../../../../../data/fixtures/a/flags.json";
import invoicesA from "../../../../../data/fixtures/a/invoices.json";
import jobsA from "../../../../../data/fixtures/a/jobs.json";
import pastPayrollsA from "../../../../../data/fixtures/a/pastPayrolls.json";
import paymentsA from "../../../../../data/fixtures/a/payments.json";
import quotesA from "../../../../../data/fixtures/a/quotes.json";
import rulesA from "../../../../../data/fixtures/a/rules.json";
import entriesA from "../../../../../data/fixtures/a/timeEntries.json";
import workersA from "../../../../../data/fixtures/a/workers.json";

// Home V5 for the owner, on the server. Cards are written from the checks' flags and the records they point at
// (data/fixtures/<id>); every amount is cents the engine already produced (workbook.json, stage2.json) or a rate as
// stored on the record, formatted here. Owner only: returns null for anyone else, so no pay is ever built for them.

type Entry = (typeof entriesA)[number];
type Worker = (typeof workersA)[number];
type Job = (typeof jobsA)[number];
type Expense = (typeof expensesA)[number];
type RuleRow = { id: string; type: string; params: Record<string, unknown> };
type FixtureCycle = Cycle & { cutoffAt: string | null };

type Records = {
  company: {
    timezone: string;
    settings: { longShiftHours: number; lowMarginPct: number };
  };
  cycles: FixtureCycle[];
  next: FixtureCycle | null;
  flags: Flag[];
  entries: Entry[];
  workers: Worker[];
  jobs: Job[];
  expenses: Expense[];
  invoices: (typeof invoicesA)[number][];
  payments: (typeof paymentsA)[number][];
  quotes: (typeof quotesA)[number][];
  rules: RuleRow[];
  past: (typeof pastPayrollsA)[number][];
};

// Only Company A has generated records. B and R get the board with no cards.
const records: Record<string, Records> = {
  a: {
    company: companyA,
    cycles: cyclesA as FixtureCycle[],
    next: (nextCyclesA[0] as FixtureCycle | undefined) ?? null,
    flags: flagsA as Flag[],
    entries: entriesA,
    workers: workersA,
    jobs: jobsA,
    expenses: expensesA,
    invoices: invoicesA,
    payments: paymentsA,
    quotes: quotesA,
    rules: rulesA as RuleRow[],
    past: pastPayrollsA,
  },
};

type S2 = (typeof stage2Fixture.companies)["a"];
const stage2Of = (companyId: string): S2 | null =>
  (stage2Fixture.companies as Record<string, S2>)[companyId] ?? null;

type WbCycle = (typeof workbookFixture.companies)["a"]["cycles"][number];
const workbookOf = (companyId: string): WbCycle[] =>
  (workbookFixture.companies as Record<string, { cycles: WbCycle[] }>)[
    companyId
  ]?.cycles ?? [];

export const STAGE2_SOURCE = `app/_fixtures/stage2.json (${stage2Fixture.source})`;
const WORKBOOK_SOURCE = `app/_fixtures/workbook.json (${workbookFixture.source})`;

const SYSTEM: Record<string, SourceSystem> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s.system]),
);

// ── words ─────────────────────────────────────────────────────────────────────────────────────────────────────

const day = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
const shortDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
const hoursBetween = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / 3_600_000;
const h = (n: number) => `${n.toFixed(1)} h`;
const firstName = (name: string) => name.split(" ")[0];
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
const perHour = (cents: number | null | undefined) =>
  cents == null ? "none" : `${formatCents(cents)}/h`;

function words(r: Records) {
  const tz = r.company.timezone;
  const worker = (id: string | null) => r.workers.find((w) => w.id === id);
  const name = (id: string | null) => worker(id)?.displayName ?? id ?? "";
  const job = (id: string | null) => r.jobs.find((j) => j.id === id);
  const jobLabel = (id: string | null) => {
    const j = job(id);
    return j ? `Job #${j.jobNumber}` : (id ?? "no job");
  };
  const jobTitle = (id: string | null) => job(id)?.title.split(" - ")[0] ?? "";
  const entry = (id: string) => r.entries.find((e) => e.id === id);
  const entryHours = (e: Entry) =>
    e.endAt ? hoursBetween(e.startAt, e.endAt) : null;
  const span = (e: Entry) =>
    `${clock(e.startAt, tz)} to ${e.endAt ? clock(e.endAt, tz) : "still running"}`;
  return {
    tz,
    worker,
    name,
    job,
    jobLabel,
    jobTitle,
    entry,
    entryHours,
    span,
  };
}

/** "Oct 10–23", or "Oct 24–Nov 6" across months, for the manager's text. */
function shortPeriod(
  c: { periodStart: string; periodEnd: string },
  timeZone: string,
) {
  const [a, b] = periodLabel(c, timeZone).split(" – ");
  return a.split(" ")[0] === b.split(" ")[0]
    ? `${a}–${b.split(" ")[1]}`
    : `${a}–${b}`;
}

// The generated flags name systems by source key ("jobber", "qbo"); the UI's chips use the system's name.
const SYSTEM_OF: Record<string, SourceSystem> = {
  ...SYSTEM,
  payrollpilot: "Workbook",
};
const normalize = (f: Flag): Flag => ({
  ...f,
  where: f.where.map((x) => ({
    ...x,
    system: SYSTEM_OF[x.system] ?? x.system,
  })),
});

const refs = (f: Flag): SourceRef[] =>
  f.where.map((w) => ({ system: w.system, recordId: w.recordId }));

// ── Dakota's list: the manager-routed flags ──────────────────────────────────────────────────────────────────

const GROUPS = [
  { key: "mix", one: "hour mix-up", many: "hour mix-ups" },
  { key: "timer", one: "running timer", many: "running timers" },
  { key: "long", one: "long shift", many: "long shifts" },
  { key: "nojob", one: "with no job", many: "with no job" },
  { key: "nohrs", one: "with no hours", many: "with no hours" },
  { key: "disp", one: "disposal run", many: "disposal runs" },
];

function dakotaItem(r: Records, f: Flag): DakotaItem {
  const w = words(r);
  const entries = f.subject.entryIds
    .map(w.entry)
    .filter((e): e is Entry => Boolean(e));
  const e0 = entries[0];
  const who = (iso: string) =>
    `${w.name(f.subject.workerId)} · ${day(iso, w.tz)}`;
  const base = {
    flagId: f.id,
    flagKey: flagKey(f),
    checkId: f.checkId,
    sources: refs(f),
  };
  switch (f.checkId) {
    case "CHK-04": {
      const [a, b] = entries;
      const from = a.startAt > b.startAt ? a.startAt : b.startAt;
      const to = (a.endAt ?? "") < (b.endAt ?? "") ? a.endAt : b.endAt;
      return {
        ...base,
        category: "Hour mix-up",
        group: "mix",
        title: who(a.startAt),
        why: `Two entries on ${w.jobLabel(a.jobId)} overlap from ${clock(from, w.tz)} to ${to ? clock(to, w.tz) : "the end of the day"}. One person can only be in one place.`,
      };
    }
    case "CHK-05":
      return entries.length > 1
        ? {
            ...base,
            category: "Hour mix-up",
            group: "mix",
            title: who(e0.startAt),
            why: `Two identical entries, ${w.span(e0)} on ${w.jobLabel(e0.jobId)}. Paying both would double the day.`,
          }
        : {
            ...base,
            category: "Hour mix-up",
            group: "mix",
            title: who(e0.startAt),
            why: `An entry on ${w.jobLabel(e0.jobId)} starts and ends at ${clock(e0.startAt, w.tz)}: 0 minutes. Usually a missed clock-out.`,
          };
    case "CHK-02":
      return {
        ...base,
        category: "Running timer",
        group: "timer",
        title: who(e0.startAt),
        why: `Timer on ${w.jobLabel(e0.jobId)} started at ${clock(e0.startAt, w.tz)} and was never stopped, so the hours are not final.`,
      };
    case "CHK-03":
      return {
        ...base,
        category: "Long shift",
        group: "long",
        title: who(e0.startAt),
        why: `${h(w.entryHours(e0) ?? 0)} on ${w.jobLabel(e0.jobId)}, ${w.span(e0)}. Your line is ${r.company.settings.longShiftHours} h.`,
      };
    case "CHK-01":
      return {
        ...base,
        category: "No job",
        group: "nojob",
        title: who(e0.startAt),
        why: `${h(w.entryHours(e0) ?? 0)}, ${w.span(e0)}, not on any job. Pay is fine; job profit needs to know where.`,
      };
    case "CHK-14": {
      const x = r.expenses.find((e) => e.id === f.subject.expenseIds[0]);
      const twin = r.expenses.find(
        (e) =>
          x &&
          e.id !== x.id &&
          e.date === x.date &&
          e.amountCents === x.amountCents &&
          e.matchedJobId,
      );
      return {
        ...base,
        category: "No job",
        group: "nojob",
        title: `${x?.vendor ?? "Purchase"} · ${x ? shortDay(`${x.date}T16:00:00Z`, w.tz) : ""}`,
        why: `${x?.description ?? "A purchase"} bought with no job attached in QuickBooks.${twin ? ` Jobber has a matching expense on ${w.jobLabel(twin.matchedJobId)}.` : ""}`,
      };
    }
    case "CHK-07":
      return {
        ...base,
        category: "No hours",
        group: "nohrs",
        title: `${w.name(f.subject.workerId)} · this cycle`,
        why: `No time entries this cycle, but paid in each of the last ${new Set(r.past.filter((p) => p.workerId === f.subject.workerId).map((p) => p.cycleId)).size} payrolls. Off, or hours missing?`,
      };
    case "CHK-13": {
      const jobId = f.where.find((x) => x.recordId.includes("-j"))?.recordId;
      return {
        ...base,
        category: "No hours",
        group: "nohrs",
        title: `${w.jobLabel(jobId ?? null)} · ${w.jobTitle(jobId ?? null)}`,
        why: "The job had a completed visit but nobody logged time on it, so it shows no labor cost.",
      };
    }
    case "CHK-16": {
      const jobId = f.subject.jobId ?? f.where.at(-1)?.recordId ?? null;
      return {
        ...base,
        category: "Disposal run",
        group: "disp",
        title: `${w.jobLabel(jobId)} · ${(w.job(jobId)?.title ?? "").replace(" - ", ", ")}`,
        why: "Has no revenue of its own. Your rule puts a disposal run on the job on the same street.",
      };
    }
    default:
      return {
        ...base,
        category: checkTitle(f.checkId),
        group: "nojob",
        title: checkTitle(f.checkId),
        why: f.seen,
      };
  }
}

// Fixed in Jobber first (job facts he can edit), then answers. The last two become corrections for the owner.
const REPLY_ORDER = [
  "CHK-05",
  "CHK-16",
  "CHK-02",
  "CHK-01",
  "CHK-13",
  "CHK-03",
  "CHK-07",
  "CHK-14",
  "CHK-04",
];

function dakotaReview(r: Records, flags: Flag[], period: string): DakotaReview {
  const manager = r.workers.find((w) => w.role === "manager");
  const mine = flags.filter((f) => f.routeTo === "manager");
  const items = mine
    .map((f) => dakotaItem(r, f))
    .sort(
      (a, b) =>
        GROUPS.findIndex((g) => g.key === a.group) -
        GROUPS.findIndex((g) => g.key === b.group),
    );
  const fixable = new Set(["CHK-05", "CHK-16", "CHK-02", "CHK-01", "CHK-13"]);
  const order = [...items].sort((a, b) => {
    const rank = (i: DakotaItem) =>
      // The duplicate is answered last: the owner gets it back as a correction.
      i.checkId === "CHK-05" && i.sources.length > 1
        ? 99
        : REPLY_ORDER.indexOf(i.checkId) + (fixable.has(i.checkId) ? 0 : 10);
    return rank(a) - rank(b);
  });
  return {
    managerId: manager?.id ?? null,
    managerName: manager?.displayName ?? "the manager",
    items,
    groups: GROUPS,
    period,
    demoReplies: order.map((i) => {
      const fixed =
        fixable.has(i.checkId) &&
        !(i.checkId === "CHK-05" && i.sources.length > 1);
      return {
        flagId: i.flagId,
        kind: fixed ? "fixed" : "answered",
        text: `${i.title.split(" · ")[0]}, ${i.category.toLowerCase()}: ${fixed ? "fixed in Jobber" : "answered"}`,
      };
    }),
  };
}

// ── the owner's cards ────────────────────────────────────────────────────────────────────────────────────────

const card = (
  c: Omit<
    HomeCard,
    | "options"
    | "facts"
    | "bars"
    | "diff"
    | "fill"
    | "secondary"
    | "carry"
    | "afterManager"
    | "flagKeys"
  > &
    Partial<HomeCard>,
  flags: Flag[],
): HomeCard => ({
  options: [],
  facts: [],
  bars: [],
  diff: [],
  fill: null,
  secondary: null,
  carry: null,
  afterManager: false,
  ...c,
  flagKeys: flags.map(flagKey),
});

function ownerCards(r: Records, flags: Flag[], cycleId: string): HomeCard[] {
  const w = words(r);
  const s2 = stage2Of("a");
  const wb = workbookOf("a").find((c) => c.cycle.id === cycleId);
  const mine = flags.filter(
    (f) => f.routeTo === "owner" && f.cycleId === cycleId,
  );
  const by = (checkId: string) => mine.filter((f) => f.checkId === checkId);
  const rule = (type: string, workerId?: string) =>
    r.rules.find(
      (x) => x.type === type && (!workerId || x.params.workerId === workerId),
    );
  const out: HomeCard[] = [];

  for (const f of by("CHK-10")) {
    const wk = w.worker(f.subject.workerId);
    const jobber = wk?.jobber?.labourRateCents ?? null;
    const gusto = wk?.gusto?.rateCents ?? null;
    const pr = rule("pay_rate", wk?.id);
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 1,
          kind: "pick",
          tone: "sunset",
          icon: "⇄",
          kicker: "Pick one · affects wages",
          title: `${w.name(wk?.id ?? null)}'s pay rate doesn't match`,
          sub: "Gusto pays its own rate. We never pick one for you.",
          foot: `${firstName(w.name(wk?.id ?? null))}'s wages wait on this`,
          options: [
            {
              key: "jobber",
              system: "Jobber",
              kicker: "Jobber",
              value: perHour(jobber),
              hint:
                pr && pr.params.rateCents === jobber
                  ? `Matches your rule ${pr.id}`
                  : "Jobber labour rate",
            },
            {
              key: "gusto",
              system: "Gusto",
              kicker: "Gusto",
              value: perHour(gusto),
              hint:
                pr && pr.params.rateCents === gusto
                  ? `Matches your rule ${pr.id}`
                  : "What Gusto pays today",
            },
            {
              key: "other",
              system: null,
              kicker: "Neither",
              value: "Other",
              hint: "Enter the right rate",
            },
          ],
          primary: "Use this rate",
          done: "Rate chosen",
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  for (const f of by("CHK-11")) {
    const id = f.subject.workerId;
    const hours = r.entries
      .filter((e) => e.workerId === id && e.cycleId === cycleId && e.endAt)
      .reduce((s, e) => s + (w.entryHours(e) ?? 0), 0);
    const peer = r.workers.find(
      (x) => x.payType === "contractor_venmo" && x.id !== id,
    );
    const peerRate = rule("venmo_rate", peer?.id)?.params.rateCents;
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 1,
          kind: "fill",
          tone: "gold",
          icon: "$",
          kicker: "Fill in · affects Venmo pay",
          title: `${w.name(id)} has no Venmo rate`,
          sub: `${h(hours)} this cycle in Jobber. ${firstName(w.name(id))} isn't paid until you add one.`,
          foot: "We never guess a rate",
          fill: {
            label: "Rate per hour",
            hint:
              peer && typeof peerRate === "number"
                ? `${firstName(peer.displayName)}, also on Venmo, gets ${perHour(peerRate)}`
                : "",
          },
          primary: "Save rate",
          done: "Rate added",
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  const unapproved = by("CHK-06");
  if (unapproved.length) {
    const es = unapproved
      .flatMap((f) => f.subject.entryIds)
      .map(w.entry)
      .filter((e): e is Entry => Boolean(e));
    const days = new Set(es.map((e) => day(e.startAt, w.tz)));
    const jobsOn = new Set(es.map((e) => e.jobId));
    const managerEntries = new Set(
      flags
        .filter((f) => f.routeTo === "manager")
        .flatMap((f) => f.subject.entryIds),
    );
    const alsoOn = es.find((e) => managerEntries.has(e.id));
    out.push(
      card(
        {
          id: `cards-${unapproved[0].id}`,
          flagIds: unapproved.map((f) => f.id),
          checkId: "CHK-06",
          stage: 1,
          kind: "facts",
          tone: "sunset",
          icon: "⏱",
          kicker: "Confirm · affects wages",
          title: `${es.length} entries weren't approved at cutoff`,
          sub: `${days.size === 1 && jobsOn.size === 1 ? `All on ${[...days][0]}, ${w.jobLabel(es[0].jobId)}. ` : ""}Pay them as recorded, or hold them for the manager.`,
          foot: alsoOn
            ? `${firstName(w.name(alsoOn.workerId))}'s timer is also on the manager's list`
            : "Nothing is paid until you decide",
          facts: es.map((e) => {
            const n = w.entryHours(e);
            return {
              label: w.name(e.workerId),
              value: n === null ? "timer running" : h(n),
              person: true,
            };
          }),
          primary: "Pay as recorded",
          secondary: "Hold them",
          done: "Paying as recorded",
          sources: unapproved.flatMap(refs),
        },
        unapproved,
      ),
    );
  }

  for (const f of by("CHK-08")) {
    const es = f.subject.entryIds
      .map(w.entry)
      .filter((e): e is Entry => Boolean(e));
    const total = es.reduce((s, e) => s + (w.entryHours(e) ?? 0), 0);
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 1,
          kind: "facts",
          tone: "coral",
          icon: "!",
          kicker: "Check · inactive with hours",
          title: `${w.name(f.subject.workerId)} is inactive but has hours`,
          sub: "Marked inactive in Jobber, still active in Gusto.",
          foot: `${h(total)} total`,
          facts: es.map((e) => ({
            label: day(e.startAt, w.tz),
            value: `${h(w.entryHours(e) ?? 0)} · ${w.jobLabel(e.jobId)}`,
            person: false,
          })),
          primary: "Keep held",
          secondary: "Pay these hours",
          done: "Held",
          carry: {
            title: `${w.name(f.subject.workerId)} · ${h(total)}`,
            why: "Inactive, held for you",
            on: "primary",
          },
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  for (const f of by("CHK-09")) {
    const id = f.subject.workerId;
    const hours = r.entries
      .filter((e) => e.workerId === id && e.cycleId === cycleId && e.endAt)
      .reduce((s, e) => s + (w.entryHours(e) ?? 0), 0);
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 1,
          kind: "facts",
          tone: "sky",
          icon: "↗",
          kicker: "Fix in Gusto",
          title: `${w.name(id)} isn't set up in Gusto`,
          sub: `${h(hours)} this cycle. Can't be paid until Gusto onboarding is finished. We re-check after.`,
          foot: "Joins an off-cycle draft once set up",
          facts: [
            { label: "Hours", value: h(hours), person: false },
            { label: "Gusto", value: "onboarding not done", person: false },
          ],
          primary: "Keep held",
          secondary: "Open Gusto",
          done: "Held until set up",
          carry: {
            title: `${w.name(id)} · ${h(hours)}`,
            why: "Gusto setup not done",
            on: "primary",
          },
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  // Pay per cycle from Gusto's paid records, then this cycle from the engine's workbook preview.
  const closed = r.cycles
    .filter((c) => c.stage === "closed")
    .sort((a, b) => a.number - b.number)
    .slice(-3);
  for (const f of by("CHK-22")) {
    const id = f.subject.workerId;
    const now =
      wb?.stage1.lines.find((l) => l.workerId === id)?.grossCents ?? 0;
    const bars = [
      ...closed.map((c) => ({
        label: shortDay(c.periodStart, w.tz),
        cents:
          r.past.find(
            (p) =>
              p.cycleId === c.id &&
              p.workerId === id &&
              p.paidVia === "gusto_regular",
          )?.grossCents ?? 0,
        now: false,
      })),
      { label: "Now", cents: now, now: true },
    ];
    const usual = s2?.review.people.find((p) => p.workerId === id);
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 1,
          kind: "bars",
          tone: "coral",
          icon: "%",
          kicker: "Safety net · always comes to you",
          title:
            now === 0
              ? `${w.name(id)} has no pay this cycle`
              : `${w.name(id)}'s pay is up ${usual?.vsUsualPct ?? 25}%`,
          sub:
            now === 0
              ? `Pay drops to ${formatCents(0)}. The manager is asked whether ${firstName(w.name(id))} was off.`
              : "Every input checked out. Big swings always come to you.",
          foot: `More than ${companyA.settings.grossChangePct}% from the last 3 payrolls`,
          bars,
          primary: "It's right",
          secondary: now === 0 ? "Hold" : "Look closer",
          done: "Confirmed",
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  // Stage 2: job cost and commissions.
  for (const f of by("CHK-17")) {
    const x = r.expenses.find(
      (e) => e.id === f.subject.expenseIds[0] || e.id === f.where[0]?.recordId,
    );
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 2,
          kind: "pick",
          tone: "sunset",
          icon: "⇄",
          kicker: "Pick one · job cost",
          title: `Is a ${x?.accountName ?? "this"} purchase overhead or a job cost?`,
          sub: `${x?.vendor ?? "Purchase"}, ${x ? formatCents(x.amountCents) : ""}, ${x ? shortDay(`${x.date}T16:00:00Z`, w.tz) : ""}. No rule decides the ${x?.accountName ?? ""} account yet.`,
          foot: "Saved as a rule only when you say so",
          options: [
            {
              key: "overhead",
              system: null,
              kicker: "Overhead",
              value: "Overhead",
              hint: "Never counts toward a job",
            },
            {
              key: "job_cost",
              system: null,
              kicker: "Job cost",
              value: "Job cost",
              hint: "Ask which job each time",
            },
          ],
          primary: "Save as a rule",
          done: "Saved as a rule",
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  for (const f of by("CHK-19")) {
    const pay = r.payments.find((p) =>
      f.where.some((x) => x.recordId === p.id),
    );
    const inv = r.invoices.find((i) => i.id === pay?.invoiceId);
    const jobId =
      f.where.find((x) => x.recordId.includes("-j"))?.recordId ?? null;
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 2,
          kind: "facts",
          tone: "gold",
          icon: "$",
          kicker: "Confirm · affects commission",
          title: `${w.jobLabel(jobId)}: was the ${pay ? formatCents(pay.amountCents) : ""} payment a deposit?`,
          sub: "It was paid on the quote but counted as the invoice's final payment.",
          foot: `rule ${rule("deposit_vs_final")?.id ?? ""}`,
          facts: [
            {
              label: "Invoice",
              value:
                inv?.totalCents != null
                  ? formatCents(inv.totalCents)
                  : "unknown",
              person: false,
            },
            {
              label: "Paid so far",
              value: pay ? formatCents(pay.amountCents) : "unknown",
              person: false,
            },
            { label: "Counted as", value: "final", person: false },
          ],
          primary: "Yes, a deposit",
          secondary: "It was final",
          done: "Marked as deposit",
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  for (const f of by("CHK-20")) {
    const q = r.quotes.find((x) => f.where.some((y) => y.recordId === x.id));
    const quoter = rule("in_person_quoter");
    const ruleWorker = quoter ? String(quoter.params.workerId) : null;
    out.push(
      card(
        {
          id: f.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 2,
          kind: "pick",
          tone: "sunset",
          icon: "⇄",
          kicker: "Pick one · affects commission",
          title: `Who quoted ${w.jobLabel(q?.jobId ?? null)} in person?`,
          sub: `Jobber lists ${w.name(q?.salespersonWorkerId ?? null)} as salesperson. Your rule says ${firstName(w.name(ruleWorker))} quotes ${String(quoter?.params.titleKeyword ?? "").toLowerCase()}.`,
          foot: "Commission held until the job is paid",
          options: [
            {
              key: "rule",
              system: null,
              kicker: "Your rule",
              value: firstName(w.name(ruleWorker)),
              hint: `${w.name(ruleWorker)}, ${quoter?.id ?? ""}`,
            },
            {
              key: "jobber",
              system: "Jobber",
              kicker: "Jobber",
              value: firstName(w.name(q?.salespersonWorkerId ?? null)),
              hint: w.name(q?.salespersonWorkerId ?? null),
            },
          ],
          primary: "Confirm",
          done: "Confirmed",
          sources: refs(f),
        },
        [f],
      ),
    );
  }

  const low = by("CHK-21");
  if (low.length) {
    const f = low[0];
    const jobId = f.subject.jobId ?? f.where[0]?.recordId ?? null;
    const row = s2?.stage2.jobs.find((j) => j.jobId === jobId);
    const dup = by("CHK-15").find((x) =>
      x.where.some((y) => y.recordId === jobId),
    );
    const stale = by("CHK-18");
    const x = r.expenses.find(
      (e) => e.source === "qbo" && dup?.where.some((y) => y.recordId === e.id),
    );
    const staleWorker = stale[0] ? w.worker(stale[0].subject.workerId) : null;
    const staleRule = rule("pay_rate", staleWorker?.id);
    const all = [f, ...(dup ? [dup] : []), ...stale];
    out.push(
      card(
        {
          id: f.id,
          flagIds: all.map((y) => y.id),
          checkId: f.checkId,
          stage: 2,
          kind: "pick",
          tone: "coral",
          icon: "⌖",
          kicker: "Match to a job · low profit",
          title: `${w.jobLabel(jobId)} is at ${row?.marginPct ?? "?"}% profit`,
          sub: `Your line is ${r.company.settings.lowMarginPct}%. This purchase has no job and may belong to it.`,
          foot:
            staleWorker && staleRule
              ? `Also: ${firstName(staleWorker.displayName)} costed at ${perHour(staleWorker.jobber?.labourRateCents)}, not ${perHour(Number(staleRule.params.costRateCentsPerHour))}`
              : "",
          options: [
            {
              key: "link",
              system: "QuickBooks",
              kicker: "QuickBooks",
              value: x ? formatCents(x.amountCents) : "Purchase",
              hint: x
                ? `${x.vendor} · ${x.description} · ${shortDay(`${x.date}T16:00:00Z`, w.tz)}`
                : "",
            },
            {
              key: "none",
              system: null,
              kicker: "No",
              value: "None",
              hint: "Not this job",
            },
          ],
          primary: `Link to ${w.jobLabel(jobId)}`,
          done: "Linked",
          sources: all.flatMap(refs),
        },
        all,
      ),
    );
  }

  // Corrections the manager's answers turn into (engine effect from stage2.json). Shown once the answer is in.
  for (const c of s2?.corrections ?? []) {
    const f = flags.find((x) => x.id === c.flagId);
    if (!f) continue;
    const es = f.subject.entryIds
      .map(w.entry)
      .filter((e): e is Entry => Boolean(e));
    const dupe = f.checkId === "CHK-05";
    out.push(
      card(
        {
          id: c.id,
          flagIds: [f.id],
          checkId: f.checkId,
          stage: 1,
          kind: "diff",
          tone: "green",
          icon: "✓",
          kicker: "Approve a correction · from the manager",
          title: dupe
            ? `Drop ${firstName(w.name(c.workerId))}'s duplicate entry`
            : `${firstName(w.name(c.workerId))}'s ${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: w.tz }).format(new Date(es[0].startAt))} becomes one shift`,
          sub: `The manager answered instead of fixing it in Jobber. Changes the workbook only: ${c.what}.`,
          foot: `${w.jobLabel(es[0]?.jobId ?? null)} · ${f.subject.entryIds.join(", ")}`,
          diff: [
            dupe
              ? {
                  label: `Entries on ${day(es[0].startAt, w.tz)}`,
                  before: String(es.length),
                  after: "1",
                }
              : {
                  label: `Hours on ${day(es[0].startAt, w.tz)}`,
                  before: c.dayHoursBefore.toFixed(1),
                  after: c.dayHoursAfter.toFixed(1),
                },
            {
              label: "Overtime this cycle",
              before: h(c.overtimeBefore),
              after: h(c.overtimeAfter),
            },
            {
              label: "Effect on pay",
              before: "",
              after: formatCents(c.effectPayCents, true),
            },
          ],
          primary: "Approve",
          secondary: "Deny",
          done: `Approved · ${formatCents(c.effectPayCents, true)}`,
          afterManager: true,
          sources: refs(f),
        },
        [f],
      ),
    );
  }
  return out;
}

// ── reviews ─────────────────────────────────────────────────────────────────────────────────────────────────

function stage1Review(
  r: Records,
  cycleId: string,
  names: (id: string) => string,
): Stage1Review | null {
  const s2 = stage2Of("a");
  const cycles = workbookOf("a");
  const i = cycles.findIndex((c) => c.cycle.id === cycleId);
  if (!s2 || i < 0) return null;
  const wb = cycles[i];
  const tz = r.company.timezone;
  const notes: Record<string, string> = {};
  // Wage checks only (CHK-01..12, CHK-22): the job-cost ones belong to Stage 2.
  const wage = (id: string) => Number(id.slice(4)) <= 12 || id === "CHK-22";
  for (const f of r.flags.filter(
    (x) => x.cycleId === cycleId && x.routeTo !== "none" && wage(x.checkId),
  )) {
    const id = f.subject.workerId ?? f.affects.workerId;
    if (id && !notes[id]) notes[id] = checkTitle(f.checkId);
  }
  const people: ReviewPerson[] = s2.review.people.map((p) => ({
    workerId: p.workerId,
    name: names(p.workerId),
    group: p.group as ReviewPerson["group"],
    hours: p.hours,
    overtimeHours: p.overtimeHours,
    grossCents: p.grossCents,
    vsUsualPct: p.vsUsualPct,
    note:
      p.grossCents === null ? "No rate, not paid" : (notes[p.workerId] ?? null),
  }));
  return {
    grossCents: wb.stage1.totalCents,
    lastGrossCents: cycles[i - 1]?.stage1.totalCents ?? null,
    deltaCents: cycles[i - 1]
      ? wb.stage1.totalCents - cycles[i - 1].stage1.totalCents
      : null,
    lastVenmoCents: cycles[i - 1]
      ? cycles[i - 1].stage1.venmo.reduce((s, v) => s + v.amountCents, 0)
      : null,
    venmoCents: s2.review.venmoCents,
    revenueCents: s2.laborShare.nowRevenueCents,
    laborCents: s2.laborShare.nowLaborCents,
    laborShare: {
      nowPct: s2.laborShare.nowPct,
      usualPct: s2.laborShare.usualPct,
      cycles: s2.laborShare.cycles.map((c) => ({
        label: c.periodStart ? shortDay(c.periodStart, tz) : c.cycleId,
        pct: c.cycleId === cycleId ? s2.laborShare.nowPct : c.laborSharePct,
        now: c.cycleId === cycleId,
      })),
      leftOutJobIds: s2.laborShare.leftOutJobIds,
    },
    people,
    overUsual: people.filter(
      (p) => Math.abs(p.vsUsualPct ?? 0) > companyA.settings.grossChangePct,
    ).length,
    withOvertime: people.filter((p) => (p.overtimeHours ?? 0) > 0).length,
    draftId: wb.draftId,
    source: WORKBOOK_SOURCE,
  };
}

function stage2Review(
  r: Records,
  flags: Flag[],
  names: (id: string) => string,
): Stage2Review | null {
  const s2 = stage2Of("a");
  if (!s2) return null;
  const w = words(r);
  const jobFlag = (jobId: string) =>
    flags.find(
      (f) =>
        ["CHK-19", "CHK-21", "CHK-13"].includes(f.checkId) &&
        (f.subject.jobId === jobId ||
          f.where.some((x) => x.recordId === jobId)),
    );
  const jobs: JobProfitRow[] = s2.stage2.jobs.map((j) => {
    const f = jobFlag(j.jobId);
    const state: JobProfitRow["state"] =
      j.profitCents === null
        ? "unknown"
        : j.low
          ? "low"
          : j.paidInFull
            ? "ready"
            : "waiting";
    const note =
      state === "unknown"
        ? "No revenue of its own"
        : j.low
          ? `Under your ${s2.stage2.lowMarginPct}% line`
          : j.paidInFull
            ? "Paid · commission ready"
            : f
              ? checkTitle(f.checkId)
              : j.provisional
                ? "Not complete yet"
                : j.invoiceStatus === "awaiting_payment"
                  ? "Invoiced, not paid"
                  : "Not paid in full yet";
    return {
      jobId: j.jobId,
      label: j.jobNumber ? `Job #${j.jobNumber}` : j.jobId,
      title: (j.title ?? "").split(" - ")[0],
      revenueCents: j.revenueCents,
      costCents: j.costCents,
      profitCents: j.profitCents,
      marginPct: j.marginPct,
      low: j.low,
      note,
      state,
    };
  });
  const splitRule = r.rules.find((x) => x.type === "manager_split");
  const readyProfit = s2.stage2.jobs
    .filter((j) => j.paidInFull)
    .map((j) => j.profitCents);
  const commissions: Commission[] = s2.stage2.ready.payouts.map((p, i) => {
    const jobsHere = s2.stage2.ready.jobIds
      .map((id) => w.jobLabel(id))
      .join(", ");
    const one = readyProfit.length === 1 && readyProfit[0] !== null;
    return {
      id: `ready-${i}`,
      workerId: p.workerId,
      initials: initials(names(p.workerId)),
      title: `${firstName(names(p.workerId))} · ${p.name === "Bonus" ? "split" : p.name.toLowerCase()} on ${jobsHere}`,
      sub:
        one && splitRule && p.name === "Bonus"
          ? `${formatCents(readyProfit[0] as number)} profit × ${splitRule.params.pctOfJobProfit}% · ${splitRule.id} · customer paid in full`
          : `${p.explain[0]?.replace(/¢/g, " cents") ?? ""} · customer paid in full`,
      amountCents: p.amountCents,
      state: "ready",
      sources: [{ system: "Workbook", recordId: s2.stage2.draftId }],
    };
  });
  const waitingJobs = s2.stage2.jobs.filter(
    (j) => !j.paidInFull && j.profitCents !== null,
  );
  if (splitRule && waitingJobs.length) {
    const id = String(splitRule.params.workerId);
    commissions.push({
      id: "waiting-split",
      workerId: id,
      initials: initials(names(id)),
      title: `${firstName(names(id))} · ${splitRule.params.pctOfJobProfit}% on ${waitingJobs.map((j) => `#${j.jobNumber}`).join(", ")}`,
      sub: "Customers have not paid in full yet",
      amountCents: null,
      state: "waiting",
      sources: waitingJobs.map((j) => ({
        system: "Jobber",
        recordId: j.jobId,
      })),
    });
  }
  const quote = flags.find((f) => f.checkId === "CHK-20");
  const plan = r.rules.find((x) => x.type === "commission_plan");
  if (quote && plan) {
    const q = r.quotes.find((x) =>
      quote.where.some((y) => y.recordId === x.id),
    );
    commissions.push({
      id: "waiting-quote",
      workerId: "",
      initials: "%",
      title: `${plan.params.pctOfJobTotal}% for quoting ${w.jobLabel(q?.jobId ?? null)}`,
      sub: "Goes to whoever you confirm quoted it · job not paid yet",
      amountCents: null,
      state: "waiting",
      sources: refs(quote),
    });
  }
  return {
    jobs,
    knownRevenueCents: s2.stage2.knownRevenueCents,
    readyCents: s2.stage2.ready.totalCents,
    commissions,
    rules: [plan?.id, splitRule?.id].filter((x): x is string => Boolean(x)),
    draftId: s2.stage2.draftId,
    source: STAGE2_SOURCE,
  };
}

function nextPayroll(
  r: Records,
  review: Stage2Review | null,
  fromLabel: string,
): NextPayroll | null {
  const s2 = stage2Of("a");
  if (!s2 || !r.next || !review) return null;
  const tz = r.company.timezone;
  const w = words(r);
  const ready = review.commissions.filter((c) => c.state === "ready");
  const releasedJobs = new Set(s2.nextPayroll.releasedJobIds);
  const stillJobs = s2.stage2.jobs.filter(
    (j) =>
      !j.paidInFull && j.profitCents !== null && !releasedJobs.has(j.jobId),
  );
  const rows: NextPayroll["rows"] = [
    ...ready.map((c) => ({
      id: `held-${c.id}`,
      initials: c.initials,
      title: c.title,
      sub: "You held it last payroll",
      amountCents: c.amountCents,
      tag: "held" as const,
    })),
    ...s2.nextPayroll.released.map((p, i) => ({
      id: `released-${i}`,
      initials: initials(w.name(p.workerId)),
      title: `${firstName(w.name(p.workerId))} · split on ${s2.nextPayroll.releasedJobIds.map((id) => w.jobLabel(id)).join(", ")}`,
      sub: `Jobber shows the customer paid in full (example) · rule ${r.rules.find((x) => x.type === "manager_split")?.id ?? ""}`,
      amountCents: p.amountCents,
      tag: "released" as const,
    })),
    ...review.commissions
      .filter((c) => c.state === "waiting")
      .map((c) => ({
        id: `wait-${c.id}`,
        initials: c.initials,
        title:
          c.id === "waiting-split"
            ? `${c.title.split(" on ")[0]} on ${stillJobs.map((j) => `#${j.jobNumber}`).join(", ")}`
            : c.title,
        sub: c.sub,
        amountCents: null,
        tag: "waiting" as const,
      })),
  ];
  return {
    cycleId: r.next.id,
    periodLabel: periodLabel(r.next, tz),
    fromLabel,
    carried: [],
    rows,
    note: s2.nextPayroll.note,
  };
}

// ── states (PR 8) ───────────────────────────────────────────────────────────────────────────────────────────

function states(runs: SyncRun[]): HomeBoardData["states"] {
  const gusto = runs.filter((x) => x.source === "gusto");
  const last = gusto
    .filter((x) => x.finishedAt)
    .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""))
    .at(-1);
  return {
    incomplete: runs
      .filter((x) => !x.complete)
      .map((x) => ({
        source: x.source,
        system: SYSTEM[x.source] ?? "Workbook",
        object: x.object,
        pulled: x.pulled,
        expected: x.expected,
        error: x.error,
      })),
    // No Gusto pull on record yet is "not pulled", not "disconnected"; only a failed last pull says disconnected.
    gusto: {
      connected: !last?.error,
      error: last?.error ?? null,
      lastPullAt: last?.finishedAt ?? null,
    },
  };
}

// ── the view ────────────────────────────────────────────────────────────────────────────────────────────────

const CHECK_GROUPS = [
  { label: "Hours", from: 1, to: 6 },
  { label: "People and pay", from: 7, to: 12 },
  { label: "Jobs and expenses", from: 13, to: 21 },
  { label: "Safety nets", from: 22, to: 23 },
];

/** Home V5. The owner's view only: null for a manager (the page sends them to their inbox first). */
export function homeBoardView(
  viewer: Viewer,
  companyId: string,
): HomeBoardData | null {
  if (viewer.role !== "owner") return null;
  const base = homeView(viewer, companyId);
  const r = records[companyId];
  const tz = r?.company.timezone ?? "America/New_York";
  const sorted = [...(r?.cycles ?? [])].sort((a, b) => a.number - b.number);
  const raw = sorted.at(-1) ?? null;
  const prev = sorted.at(-2) ?? null;
  const cycle: Cycle | null = raw
    ? {
        id: raw.id,
        number: raw.number,
        periodStart: raw.periodStart,
        periodEnd: raw.periodEnd,
        stage: raw.stage,
        questionsAsked: raw.questionsAsked,
      }
    : base.cycle;
  const period = cycle ? periodLabel(cycle, tz) : "";
  const flags =
    r && cycle
      ? r.flags
          .filter((f) => f.cycleId === cycle.id)
          .map((f) => normalize(redactFlag(viewer, f)))
      : base.flags;
  const names = (id: string) =>
    r?.workers.find((w) => w.id === id)?.displayName ?? id;
  const owner = r?.workers.find((w) => w.role === "owner");
  const wbs = workbookOf(companyId);
  const lastWb = prev ? wbs.find((c) => c.cycle.id === prev.id) : undefined;

  const cards = r && cycle ? ownerCards(r, flags, cycle.id) : [];
  const review = r && cycle ? stage1Review(r, cycle.id, names) : null;
  const stage2 = r ? stage2Review(r, flags, names) : null;
  const carry: CarryItem[] = (stage2?.commissions ?? [])
    .filter((c) => c.state === "waiting")
    .map((c) => ({
      id: c.id,
      title: c.title,
      why: "Waiting on customers",
      amountCents: null,
    }));
  const next = r ? nextPayroll(r, stage2, period) : null;
  if (next)
    next.carried = [
      ...(stage2?.commissions ?? [])
        .filter((c) => c.state === "ready")
        .map((c) => ({
          id: `held-${c.id}`,
          title: c.title,
          why: "You held it · comes back for your yes or no",
          amountCents: c.amountCents,
        })),
      ...carry,
      ...cards
        .filter((c) => c.carry)
        .map((c) => ({
          id: `carry-${c.id}`,
          title: c.carry?.title ?? "",
          why: c.carry?.why ?? "",
          amountCents: null,
        })),
    ];

  const live = flags.filter((f) => f.routeTo !== "none");
  const num = (checkId: string) => Number(checkId.slice(4));
  return {
    ...base,
    flags,
    cycle,
    stageNote: null,
    ownerFirstName: owner ? firstName(owner.displayName) : null,
    cycleNumber: cycle?.number ?? null,
    periodLabel: period,
    cutoffLabel: raw?.cutoffAt
      ? `${day(raw.cutoffAt, tz)}, ${clock(raw.cutoffAt, tz)}`
      : null,
    people: {
      total: r?.workers.length ?? 0,
      gusto:
        r?.workers.filter((w) => w.payType !== "contractor_venmo").length ?? 0,
      venmo:
        r?.workers.filter((w) => w.payType === "contractor_venmo").length ?? 0,
    },
    last:
      lastWb && prev
        ? {
            periodLabel: periodLabel(prev, tz),
            grossCents: lastWb.stage1.totalCents,
            venmoCents: lastWb.stage1.venmo.reduce(
              (s, v) => s + v.amountCents,
              0,
            ),
            offCycleCents: lastWb.stage2.totalCents,
            people: lastWb.stage1.lines.length,
            questionsAsked: prev.questionsAsked,
          }
        : null,
    cards,
    dakota: r
      ? dakotaReview(r, flags, cycle ? shortPeriod(cycle, tz) : period)
      : {
          managerId: null,
          managerName: "the manager",
          items: [],
          groups: GROUPS,
          period,
          demoReplies: [],
        },
    review,
    stage2,
    carry,
    next,
    states: states(base.syncRuns),
    run: {
      pulls: SOURCES.map(({ key, system }) => {
        const main = base.syncRuns.find((x) => x.source === key);
        return {
          system,
          pulled: main?.pulled ?? 0,
          expected: main?.expected ?? null,
        };
      }),
      groups: CHECK_GROUPS.map((g) => ({
        label: g.label,
        checks: g.to - g.from + 1,
        found: live.filter(
          (f) => num(f.checkId) >= g.from && num(f.checkId) <= g.to,
        ).length,
      })),
      checks: 23,
      found: live.length,
    },
  };
}
