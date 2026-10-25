// Relative value imports: vitest runs this file without the "@/" alias.

import type { FixtureWorker, Flag, SourceSystem } from "@/lib/types";
import type {
  DemoRecheck,
  EmployeeDay,
  EmployeeReviewData,
  ManagerInboxV3,
  ManagerItem,
  RecordRow,
  SourceRef,
} from "@/lib/view-types/manager";
import { checkTitle } from "../../checks";
import { canSeeFlag, redactFlag, type Viewer } from "../../policy";

// Pure builders for the manager inbox and the employee review page: records in, redacted view out. No IO, so
// vitest can run them (manager.ts does the loading behind server-only). The inputs below name only the fields
// these pages may use; amounts on jobs and expenses are never read, so they cannot end up in the copy.

export type EntryRow = {
  id: string;
  cycleId: string;
  workerId: string;
  jobId: string | null;
  startAt: string;
  endAt: string | null;
  durationSec: number;
  ticking: boolean;
};
export type JobRow = { id: string; jobNumber: number | null; title: string };
export type ExpenseRow = {
  id: string;
  source: string;
  date: string;
  vendor: string | null;
  description: string | null;
  matchedJobId: string | null;
};
export type RuleRow = {
  id: string;
  type: string;
  params: Record<string, unknown>;
};
export type CycleRow = { id: string; periodStart: string; periodEnd: string };
/** Raw flag as the fixture stores it: systems are lower-case ids ("jobber", "qbo"). */
export type RawFlag = Omit<Flag, "where"> & {
  where: { system: string; recordId: string; url: string | null }[];
};

export type Records = {
  companyId: string;
  timezone: string;
  cycle: CycleRow | null;
  flags: RawFlag[];
  entries: EntryRow[];
  jobs: JobRow[];
  expenses: ExpenseRow[];
  rules: RuleRow[];
  workers: FixtureWorker[];
};

const SYSTEMS: Record<string, SourceSystem> = {
  jobber: "Jobber",
  qbo: "QuickBooks",
  quickbooks: "QuickBooks",
  gusto: "Gusto",
};
const systemOf = (s: string): SourceSystem =>
  SYSTEMS[s.toLowerCase()] ?? "Jobber";

/** The flag with its source systems named the way the UI names them. */
export const normalizeFlag = (f: RawFlag): Flag => ({
  ...f,
  where: f.where.map((w) => ({ ...w, system: systemOf(w.system) })),
});

const JOBBER_HOME = "https://secure.getjobber.com";

// Dates and times in the company's own zone, built from parts so server and browser agree.
function parts(iso: string, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return {
    weekday: p.weekday,
    month: p.month,
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
  };
}
const dayLabel = (iso: string, tz: string) => {
  const p = parts(iso, tz);
  return `${p.weekday}, ${p.month} ${p.day}`;
};
const clock = (iso: string, tz: string) => {
  const { hour, minute } = parts(iso, tz);
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};
const shortClock = (iso: string, tz: string) => clock(iso, tz).slice(0, -3);
const span = (e: EntryRow, tz: string) =>
  e.endAt
    ? `${clock(e.startAt, tz)} – ${clock(e.endAt, tz)}`
    : `Started ${clock(e.startAt, tz)}`;
export const hoursOf = (sec: number) => `${(sec / 3600).toFixed(1)} h`;

export function periodLabel(c: CycleRow, tz: string): string {
  const a = parts(c.periodStart, tz);
  const b = parts(c.periodEnd, tz);
  return a.month === b.month
    ? `${a.month} ${a.day} – ${b.day}`
    : `${a.month} ${a.day} – ${b.month} ${b.day}`;
}

type Ctx = Records & {
  entry: (id: string) => EntryRow | undefined;
  job: (id: string | null) => JobRow | undefined;
  name: (id: string | null) => string;
};

const jobLabel = (j: JobRow | undefined, id: string | null) =>
  j?.jobNumber ? `Job #${j.jobNumber}` : id ? `Job ${id}` : "no job";
const jobTitle = (j: JobRow | undefined) => j?.title.split(" - ")[0] ?? "";
const first = (name: string) => name.split(" ")[0];

type Copy = Omit<
  ManagerItem,
  | "flagId"
  | "checkId"
  | "worker"
  | "sources"
  | "link"
  | "demoRecheck"
  | "thread"
> & { linkLabel?: string };

// One copy builder per check. Everything stated is read off the records; anything that would need judgment is
// a question with options, never a guess.
function copyFor(f: Flag, x: Ctx): Copy {
  const tz = x.timezone;
  const who = x.name(f.subject.workerId);
  const es = f.subject.entryIds.map(x.entry).filter((e): e is EntryRow => !!e);
  const e0 = es[0];
  const row = (e: EntryRow, extra = ""): RecordRow => ({
    recordId: e.id,
    detail: `${span(e, tz)}${e.endAt ? ` · ${hoursOf(e.durationSec)}` : ""}${extra}`,
  });
  const when = e0
    ? `${dayLabel(e0.startAt, tz)} · ${jobLabel(x.job(e0.jobId), e0.jobId)}`
    : "";
  const openDay = e0 ? `Open ${dayLabel(e0.startAt, tz)} in Jobber` : undefined;
  const base = {
    category: checkTitle(f.checkId),
    when,
    rows: es.map((e) => row(e)),
    ruleId: f.precedent?.ruleId ?? null,
    fixOption: null,
    linkLabel: openDay,
  };

  switch (f.checkId) {
    case "CHK-05":
      if (es.length >= 2)
        return {
          ...base,
          kind: "fix",
          category: "Same entry twice",
          title: `${who} has two identical entries`,
          why: `Both run ${span(e0, tz)}. Counting both would pay ${new Date(e0.startAt).toLocaleDateString("en-US", { weekday: "long", timeZone: tz })} twice.`,
          fix: "delete one of the two entries.",
          question: "Which is right?",
          options: [
            `Keep ${es[0].id}, drop the copy`,
            `Keep ${es[1].id}, drop the other`,
            "Both are real: two shifts",
            `Neither: ${first(who)} didn't work`,
          ],
        };
      return {
        ...base,
        kind: "fix",
        category: "0-minute entry",
        title: `${who} has a 0-minute entry`,
        why: `It starts and ends at ${clock(e0.startAt, tz)}. Usually a missed clock-out.`,
        fix: "set the real end time, or delete the entry.",
        question: "What happened?",
        options: [
          `Delete it, ${first(who)} didn't work then`,
          `${first(who)} worked: I'll give the end time`,
        ],
      };
    case "CHK-04": {
      const [a, b] = es;
      const from = a.startAt > b.startAt ? a.startAt : b.startAt;
      const to =
        (a.endAt ?? "") < (b.endAt ?? "") ? (a.endAt ?? "") : (b.endAt ?? "");
      const late = a.endAt && b.endAt && a.endAt > b.endAt ? a : b;
      return {
        ...base,
        kind: "fix",
        category: "Entries overlap",
        title: `${who}'s entries overlap`,
        why: `${first(who)} can't be on two entries at once. They overlap from ${clock(from, tz)} to ${clock(to, tz)}.`,
        rows: es.map((e) => ({ recordId: e.id, detail: span(e, tz) })),
        fix: "change the times so they don't overlap, or merge them.",
        question: `What did ${first(who)} work?`,
        options: [
          `One shift, ${clock(a.startAt < b.startAt ? a.startAt : b.startAt, tz)} to ${late.endAt ? clock(late.endAt, tz) : ""}`,
          `Only ${span(a, tz).replace(" – ", " to ")}`,
          "I'll give the real times",
        ],
      };
    }
    case "CHK-02":
      return {
        ...base,
        kind: "fix",
        category: "Timer still running",
        title: `${who}'s timer never stopped`,
        why: `It started at ${clock(e0.startAt, tz)} and was still running at the hours cutoff, so the hours aren't final.`,
        rows: [{ recordId: e0.id, detail: `${span(e0, tz)} · still running` }],
        fix: `stop the timer at the time ${first(who)} actually finished.`,
        question: `When did ${first(who)} finish?`,
        options: ["5:00 PM", "6:00 PM", "I'll give the exact time"],
      };
    case "CHK-01":
      return {
        ...base,
        kind: "fix",
        category: "No job on entry",
        title: `${who}'s hours have no job`,
        when: `${dayLabel(e0.startAt, tz)} · ${hoursOf(e0.durationSec)}`,
        why: `${span(e0, tz).replace(" – ", " to ")} isn't on any job. ${first(who)} still gets paid; it just can't count toward a job.`,
        rows: [row(e0, " · no job")],
        fix: "add the job to the entry.",
        question: "Which job was it?",
        options: ["Shop or yard work, no job", "Another job"],
      };
    case "CHK-13": {
      const jobId =
        f.where.find((w) => x.job(w.recordId))?.recordId ?? f.subject.jobId;
      const j = x.job(jobId);
      return {
        ...base,
        kind: "fix",
        category: "Job with no hours",
        title: `${jobLabel(j, jobId)} has no hours logged`,
        when: jobTitle(j),
        why: "The job has a completed visit but nobody logged time on it, so it looks like it took no labor.",
        rows: jobId
          ? [{ recordId: jobId, detail: "completed visit · 0 h logged" }]
          : [],
        fix: "add the crew's time to the job.",
        question: "What happened?",
        options: ["Done during another job's visit", "I'll add the hours"],
        fixOption: 1,
        linkLabel: `Open ${jobLabel(j, jobId)} in Jobber`,
      };
    }
    case "CHK-03": {
      const rule = x.rules.find((r) => r.type === "long_shift_threshold");
      const limit = Number(rule?.params.hours ?? NaN);
      const past = x.entries.filter(
        (e) => e.workerId === f.subject.workerId && e.cycleId !== f.cycleId,
      );
      const longest = Math.max(0, ...past.map((e) => e.durationSec));
      return {
        ...base,
        kind: "answer",
        category: "Long shift",
        title: `${who} worked ${hoursOf(e0.durationSec)}`,
        why: `${Number.isFinite(limit) ? `Over the ${limit} h line in your rules.` : "Longer than usual."}${
          past.length
            ? ` ${first(who)}'s longest past shift was ${hoursOf(longest)}, so we check before paying it.`
            : ""
        }`,
        ruleId: rule?.id ?? base.ruleId,
        fix: "correct the start or end time.",
        question: `Is ${hoursOf(e0.durationSec)} right?`,
        options: [
          `Yes, ${first(who)} worked it`,
          "No, I'll fix the times in Jobber",
        ],
        fixOption: 1,
      };
    }
    case "CHK-07": {
      const wid = f.subject.workerId;
      const pastCycles = new Set(
        x.entries.filter((e) => e.cycleId !== f.cycleId).map((e) => e.cycleId),
      );
      const worked = new Set(
        x.entries
          .filter((e) => e.workerId === wid && e.cycleId !== f.cycleId)
          .map((e) => e.cycleId),
      );
      return {
        ...base,
        kind: "answer",
        category: "No hours",
        title: `${who} has no hours`,
        when: x.cycle ? periodLabel(x.cycle, tz) : "",
        why: `No time entries this cycle.${
          pastCycles.size
            ? ` ${first(who)} worked in ${worked.size} of the last ${pastCycles.size} payrolls.`
            : ""
        }`,
        rows: [],
        fix: `add an entry for each day ${first(who)} worked.`,
        question: `Was ${first(who)} off?`,
        options: ["Off this cycle", "Worked: I'll add the hours in Jobber"],
        fixOption: 1,
        linkLabel: `Open ${first(who)}'s timesheet in Jobber`,
      };
    }
    case "CHK-14": {
      const ex = x.expenses.find((e) => e.id === f.subject.expenseIds[0]);
      const twin = ex
        ? x.expenses.find(
            (o) =>
              o.id !== ex.id &&
              o.source === "jobber" &&
              o.date === ex.date &&
              o.description === ex.description &&
              o.matchedJobId,
          )
        : undefined;
      const twinJob = twin && x.job(twin.matchedJobId);
      const d = ex ? parts(`${ex.date}T12:00:00Z`, "UTC") : null;
      return {
        ...base,
        kind: "answer",
        category: "Purchase with no job",
        title: `${ex?.vendor ?? "A"} purchase`,
        when: [d && `${d.month} ${d.day}`, ex?.description]
          .filter(Boolean)
          .join(" · "),
        why: `It isn't tied to a job in QuickBooks.${
          twinJob
            ? ` Jobber has an expense with the same date and description on ${jobLabel(twinJob, twin?.matchedJobId ?? null)}.`
            : ""
        }`,
        rows: [],
        fix: null,
        question: "Which job was it for?",
        options: [
          ...(twinJob
            ? [`${jobLabel(twinJob, null)} · ${jobTitle(twinJob)}`]
            : []),
          "Another job",
          "Not for a job",
        ],
      };
    }
    case "CHK-16": {
      const j = x.job(
        f.subject.jobId ??
          f.where.find((w) => x.job(w.recordId))?.recordId ??
          null,
      );
      const street = j?.title.split(" - ")[1];
      const parent = street
        ? x.jobs.find(
            (o) =>
              o.id !== j?.id &&
              o.title.endsWith(` - ${street}`) &&
              !o.title.startsWith("Disposal"),
          )
        : undefined;
      const rule = x.rules.find((r) => r.type === "disposal_parent_link");
      const dump = x.expenses.find((e) => j && e.matchedJobId === j.id);
      const dumpDay = dump && parts(`${dump.date}T12:00:00Z`, "UTC");
      return {
        ...base,
        kind: "answer",
        category: "Disposal run",
        title: `${jobLabel(j, j?.id ?? null)} disposal run${street ? `, ${street}` : ""}`,
        when: dumpDay ? `${dumpDay.month} ${dumpDay.day}` : "",
        why: `It has no revenue of its own.${
          parent
            ? ` Usually it belongs to the job on the same street: ${jobLabel(parent, parent.id)}.`
            : ""
        }`,
        ruleId: rule?.id ?? base.ruleId,
        rows: [],
        fix: null,
        question: parent
          ? `Part of ${jobLabel(parent, parent.id)}?`
          : "Which job is it part of?",
        options: parent
          ? [
              `Yes, part of ${jobLabel(parent, parent.id)}`,
              "No, a different job",
            ]
          : ["Another job", "Not part of a job"],
      };
    }
    default:
      // No copy for this check yet: name the check and the records, and ask a plain yes/no.
      return {
        ...base,
        kind: "answer",
        title: `${checkTitle(f.checkId)}${f.subject.workerId ? `: ${who}` : ""}`,
        why: `Check ${f.checkId} found this in the records below.`,
        fix: "correct the record.",
        question: "Is this right as it is?",
        options: ["Yes, it's right", "No, I'll fix it in Jobber"],
        fixOption: 1,
      };
  }
}

// Fixture-mode re-check script: the overlap shows "still wrong" once, so the demo covers both outcomes.
const DEMO_RECHECK: Record<string, DemoRecheck[]> = {
  "CHK-04": ["still-there", "fixed"],
};

function context(r: Records): Ctx {
  const entries = new Map(r.entries.map((e) => [e.id, e]));
  const jobs = new Map(r.jobs.map((j) => [j.id, j]));
  const names = new Map(r.workers.map((w) => [w.id, w.displayName]));
  return {
    ...r,
    entry: (id) => entries.get(id),
    job: (id) => (id ? jobs.get(id) : undefined),
    name: (id) => (id ? (names.get(id) ?? id) : "Someone"),
  };
}

/** The manager's inbox: their crew's manager-routed flags this cycle, as fix-in-Jobber or quick-answer items. */
export function buildManagerInbox(viewer: Viewer, r: Records): ManagerInboxV3 {
  const x = context(r);
  const flags = r.flags
    .map(normalizeFlag)
    .filter(
      (f) =>
        f.companyId === r.companyId &&
        (!r.cycle || f.cycleId === r.cycle.id) &&
        ["open", "asked"].includes(f.status) &&
        canSeeFlag(viewer, f),
    )
    .map((f) => redactFlag(viewer, f));

  const items: ManagerItem[] = flags.map((f) => {
    const { linkLabel, ...copy } = copyFor(f, x);
    const sources: SourceRef[] = f.where.map((w) => ({
      system: w.system,
      recordId: w.recordId,
      url: w.url,
    }));
    const deep = sources.find((s) => s.system === "Jobber" && s.url);
    return {
      flagId: f.id,
      checkId: f.checkId,
      worker: f.subject.workerId ? first(x.name(f.subject.workerId)) : null,
      ...copy,
      sources,
      link:
        copy.fix === null
          ? null
          : {
              label: deep ? (linkLabel ?? "Open in Jobber") : "Open Jobber",
              url: deep?.url ?? JOBBER_HOME,
              recordLevel: !!deep,
            },
      demoRecheck: DEMO_RECHECK[f.checkId] ?? ["fixed"],
      thread: null,
    };
  });
  // Fix items first: they take the manager into Jobber, so they are worth starting on.
  items.sort(
    (a, b) => Number(a.kind === "answer") - Number(b.kind === "answer"),
  );

  const manager =
    viewer.role === "manager"
      ? r.workers.find((w) => w.id === viewer.workerId)
      : undefined;
  const owner = r.workers.find((w) => w.role === "owner");
  return {
    companyId: r.companyId,
    cycleId: r.cycle?.id ?? null,
    period: r.cycle ? periodLabel(r.cycle, r.timezone) : null,
    manager: manager
      ? { id: manager.id, firstName: first(manager.displayName) }
      : null,
    owner: owner ? { firstName: first(owner.displayName) } : null,
    items,
    source: "",
  };
}

const WINDOW_START = 6; // 6 AM
const WINDOW_HOURS = 12; // to 6 PM
const share = (iso: string, tz: string) => {
  const { hour, minute } = parts(iso, tz);
  return Math.min(
    1,
    Math.max(0, (hour + minute / 60 - WINDOW_START) / WINDOW_HOURS),
  );
};

/**
 * One worker's own hours this cycle and the one question about them. Hours and jobs only: no pay, no other
 * worker, no notes. Null when the flag is not about this worker.
 */
export function buildEmployeeReview(
  r: Records & { companyName: string },
  link: { token: string; workerId: string; flagId: string },
): EmployeeReviewData | null {
  const x = context(r);
  const tz = r.timezone;
  const worker = r.workers.find((w) => w.id === link.workerId);
  const raw = r.flags.find((f) => f.id === link.flagId);
  if (!worker || !r.cycle || !raw || raw.subject.workerId !== worker.id)
    return null;
  const flag = normalizeFlag(raw);
  const manager = r.workers.find((w) => w.id === worker.managerId);
  const mine = r.entries
    .filter((e) => e.workerId === worker.id && e.cycleId === r.cycle?.id)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const flagged = new Set(flag.subject.entryIds);

  const byDay = new Map<string, EntryRow[]>();
  for (const e of mine) {
    const k = dayLabel(e.startAt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const days: EmployeeDay[] = [...byDay].map(([day, es]) => ({
    recordIds: es.map((e) => e.id),
    day,
    detail: `${es
      .map((e) =>
        e.endAt
          ? `${shortClock(e.startAt, tz)} – ${shortClock(e.endAt, tz)}`
          : `from ${shortClock(e.startAt, tz)}, still running`,
      )
      .join(
        " and ",
      )} · ${[...new Set(es.map((e) => jobLabel(x.job(e.jobId), e.jobId)))].join(", ")}`,
    hours: es.reduce((s, e) => s + e.durationSec, 0) / 3600,
    flagged: es.some((e) => flagged.has(e.id)),
  }));

  const start = Date.parse(r.cycle.periodStart);
  const end = Date.parse(r.cycle.periodEnd);
  const weeks: EmployeeReviewData["weeks"] = [];
  for (let t = start; t < end; t += 7 * 86400000) {
    const p = parts(new Date(t).toISOString(), tz);
    const sec = mine
      .filter((e) => {
        const s = Date.parse(e.startAt);
        return s >= t && s < Math.min(end, t + 7 * 86400000);
      })
      .reduce((s, e) => s + e.durationSec, 0);
    weeks.push({ label: `Week of ${p.month} ${p.day}`, hours: sec / 3600 });
  }

  const es = flag.subject.entryIds
    .map(x.entry)
    .filter((e): e is EntryRow => !!e);
  let question: EmployeeReviewData["question"] = null;
  if (flag.checkId === "CHK-04" && es.length === 2) {
    const [a, b] = es;
    const sc = (e: EntryRow) =>
      e.endAt
        ? `${shortClock(e.startAt, tz)} – ${shortClock(e.endAt, tz)}`
        : "";
    const from = a.startAt > b.startAt ? a.startAt : b.startAt;
    const to =
      (a.endAt ?? "") < (b.endAt ?? "") ? (a.endAt ?? "") : (b.endAt ?? "");
    const earliest = a.startAt < b.startAt ? a : b;
    const latest = (a.endAt ?? "") > (b.endAt ?? "") ? a : b;
    const j = x.job(a.jobId);
    question = {
      flagId: flag.id,
      eyebrow: `Your hours on ${dayLabel(a.startAt, tz)}`,
      text: "You have two entries that overlap. Which is right?",
      detail: `${a.jobId === b.jobId ? `Both on ${jobLabel(j, a.jobId)}${j ? `, ${jobTitle(j)}` : ""}.` : "On two jobs."} ${shortClock(from, tz)} – ${shortClock(to, tz)} is counted twice.`,
      bars: es.map((e) => ({
        recordId: e.id,
        label: sc(e),
        from: share(e.startAt, tz),
        to: e.endAt ? share(e.endAt, tz) : 1,
      })),
      overlap: {
        from: share(from, tz),
        to: share(to, tz),
        label: `${shortClock(from, tz)} to ${shortClock(to, tz)}`,
      },
      options: [
        {
          label: `${sc(a)} only`,
          hint: `The ${shortClock(b.startAt, tz)} entry is a mistake`,
        },
        { label: `${sc(b)} only`, hint: "The morning entry is a mistake" },
        {
          label: `One shift, ${shortClock(earliest.startAt, tz)} – ${latest.endAt ? shortClock(latest.endAt, tz) : ""}`,
          hint: "I worked straight through",
        },
        { label: "Something else", hint: "Tell us the real times" },
      ],
      otherOption: 3,
    };
  } else if (es[0]) {
    question = {
      flagId: flag.id,
      eyebrow: `Your hours on ${dayLabel(es[0].startAt, tz)}`,
      text: `${checkTitle(flag.checkId)}. Is this right?`,
      detail: es.map((e) => span(e, tz)).join(" and "),
      bars: [],
      overlap: null,
      options: [
        { label: "Yes, it's right", hint: "Nothing to change" },
        { label: "Something else", hint: "Tell us the real times" },
      ],
      otherOption: 1,
    };
  }

  return {
    companyId: r.companyId,
    companyName: r.companyName,
    token: link.token,
    worker: { id: worker.id, firstName: first(worker.displayName) },
    managerFirstName: manager ? first(manager.displayName) : null,
    period: periodLabel(r.cycle, tz),
    question,
    weeks,
    days,
    source: "",
  };
}
