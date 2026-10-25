import { formatCents } from "../../money";
import { canSeeFlag, canSeePay, type Viewer } from "../../policy";
import type {
  CompanyPerson,
  CompanyViewData,
  ConnectedApp,
  HistoryRead,
  PayHistoryLine,
  PayKind,
  PersonTone,
  RateTile,
  SettingCard,
} from "../../view-types/company";

// Pure builder behind companyView (./company.ts). It takes the raw fixture rows, which hold pay, and returns only
// what this viewer may see. Relative imports and no IO, so Vitest can run it (tests/company-view.test.ts).
// It restates stored numbers; it never computes pay. Hours are the sum of the cycle's Jobber entries, untrimmed.

export type RawWorker = {
  id: string;
  displayName: string;
  role: "field" | "manager" | "owner" | "office";
  payType: "hourly" | "salary" | "contractor_venmo" | "commission";
  status: "active" | "inactive";
  managerId: string | null;
  jobber: { userId: string; labourRateCents: number | null } | null;
  gusto: {
    rateCents: number | null;
    paymentUnit: string | null;
    onboarded?: boolean;
  } | null;
  venmoRateCents: number | null;
};

export type RawRule = {
  id: string;
  type: string | null;
  params: Record<string, unknown>;
  status: string;
};

export type RawFlag = {
  id: string;
  cycleId: string;
  checkId: string;
  status: string;
  routeTo: "owner" | "manager" | "none";
  subject: { workerId: string | null; entryIds: string[] };
};

export type RawEntry = {
  id: string;
  cycleId: string;
  workerId: string;
  durationSec: number | null;
};

export type RawPastPayroll = {
  id: string;
  cycleId: string;
  workerId: string;
  paidVia: string;
  earnings: {
    name: string;
    hours: number | null;
    rateCents: number | null;
    amountCents: number;
  }[];
  grossCents: number;
};

export type RawCycle = {
  id: string;
  number: number;
  periodStart: string;
  periodEnd: string;
};

export type RawSyncRun = {
  id: string;
  cycleId: string | null;
  source: string;
  object: string;
  finishedAt: string | null;
  pulled: number;
  expected: number | null;
  complete: boolean;
};

export type RawSettings = {
  payFrequency: string;
  timezone: string;
  settings: {
    longShiftHours: number;
    otWeeklyHours: number;
    grossChangePct: number;
    employeesMayBeTexted: boolean;
    lowMarginPct: number;
  };
};

export type CompanyInputs = {
  roster: RawWorker[];
  rules: RawRule[];
  flags: RawFlag[];
  entries: RawEntry[];
  pastPayrolls: RawPastPayroll[];
  cycles: RawCycle[];
  syncRuns: RawSyncRun[];
  company: RawSettings | null;
  sources: CompanyViewData["sources"];
};

/** Person-level checks: the exact conditions that put someone under "Needs a look". Hours checks live on Home. */
const PERSON_CHECKS: Record<string, { tone: PersonTone; label: string }> = {
  "CHK-11": { tone: "blocked", label: "No pay rate" },
  "CHK-08": { tone: "blocked", label: "Inactive, has hours" },
  "CHK-10": { tone: "look", label: "Doesn't match" },
  "CHK-09": { tone: "look", label: "Not onboarded" },
  "CHK-18": { tone: "look", label: "Cost rate stale" },
  "CHK-07": { tone: "look", label: "No hours" },
};
const OPEN = new Set(["open", "asked", "answered", "held"]);

const num = (v: unknown) => (typeof v === "number" ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** "$28.00/h"; a yearly salary drops the cents: "$67,600/yr". */
function rate(cents: number, unit: "h" | "yr") {
  const text = formatCents(cents);
  return unit === "yr" ? `${text.replace(/\.00$/, "")}/yr` : `${text}/h`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const ROLE_WORDS: Record<RawWorker["role"], string> = {
  field: "Field",
  manager: "Manager",
  owner: "Owner",
  office: "Office",
};
const PAY_WORDS: Record<RawWorker["payType"], string> = {
  hourly: "hourly",
  salary: "salary",
  contractor_venmo: "Venmo",
  commission: "commission",
};

function kindOf(w: RawWorker): PayKind {
  if (w.payType === "contractor_venmo") return "venmo";
  if (w.payType === "salary") return "salary";
  return "hourly";
}

function periodLabel(c: RawCycle, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
  const start = f.format(new Date(c.periodStart));
  const end = f.format(new Date(c.periodEnd));
  // "Oct 10 – 23" when both ends share a month.
  const [sm] = start.split(" ");
  const [em, ed] = end.split(" ");
  return sm === em ? `${start} – ${ed}` : `${start} – ${end}`;
}

const TZ_WORDS: Record<string, string> = {
  "America/New_York": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
};

const FREQUENCY_WORDS: Record<string, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Every month",
};

export function buildCompanyView(
  viewer: Viewer,
  input: CompanyInputs,
): CompanyViewData {
  const showPay = canSeePay(viewer);
  const timeZone = input.company?.timezone ?? "UTC";
  const sorted = [...input.cycles].sort((a, b) => a.number - b.number);
  const current = sorted.at(-1) ?? null;
  const cycleNumber = new Map(sorted.map((c) => [c.id, c.number]));
  const nameOf = (id: string) =>
    input.roster.find((w) => w.id === id)?.displayName ?? id;

  // Same people policy as rosterView: the owner sees everyone, a manager their crew.
  const visible = input.roster.filter(
    (w) => viewer.role === "owner" || viewer.crew.has(w.id),
  );

  const openFlags = input.flags.filter(
    (f) =>
      f.cycleId === current?.id &&
      OPEN.has(f.status) &&
      // canSeeFlag only reads routeTo and subject.workerId.
      canSeeFlag(viewer, f as unknown as Parameters<typeof canSeeFlag>[1]),
  );

  const people: CompanyPerson[] = visible.map((w) => {
    const kind = kindOf(w);
    const entries = input.entries.filter(
      (e) => e.workerId === w.id && e.cycleId === current?.id,
    );
    const seconds = entries.reduce((s, e) => s + (e.durationSec ?? 0), 0);
    const hours = entries.length ? Math.round(seconds / 36) / 100 : null;
    const mine = openFlags.filter((f) => f.subject.workerId === w.id);
    const personFlags = mine.filter((f) => PERSON_CHECKS[f.checkId]);
    const checks = new Set(personFlags.map((f) => f.checkId));
    // Worst first: blocked, then look.
    const found = personFlags.map((f) => PERSON_CHECKS[f.checkId]);
    const top = found.find((c) => c.tone === "blocked") ?? found[0] ?? null;
    const tone: PersonTone = top?.tone ?? (kind === "venmo" ? "info" : "ready");
    const label = top?.label ?? (kind === "venmo" ? "Venmo" : "Ready");

    const payRule = input.rules.find(
      (r) =>
        (r.type === "pay_rate" || r.type === "venmo_rate") &&
        r.params.workerId === w.id,
    );
    const jobberCents = w.jobber?.labourRateCents ?? null;
    const gustoCents = w.gusto?.rateCents ?? null;
    const gustoUnit = w.gusto?.paymentUnit === "Year" ? "yr" : "h";
    const ruleCents = num(payRule?.params.rateCents);
    const ruleUnit = str(payRule?.params.paymentUnit) === "Year" ? "yr" : "h";
    const ruleCost = num(payRule?.params.costRateCentsPerHour);
    const venmoCents =
      payRule?.type === "venmo_rate" ? ruleCents : w.venmoRateCents;
    const hoursText = hours === null ? null : `${hours.toFixed(1)} h`;

    let note: string;
    let main: string;
    let sub: string | null = null;
    const J = jobberCents === null ? null : formatCents(jobberCents);
    const G = gustoCents === null ? null : rate(gustoCents, gustoUnit);
    if (kind === "venmo") {
      main = venmoCents === null ? "No pay rate" : rate(venmoCents, "h");
      if (checks.has("CHK-11") && J) sub = `Jobber ${J} is cost only`;
    } else if (kind === "salary") {
      main = G ?? "No salary in Gusto";
      if (checks.has("CHK-18") && J) sub = `Jobber cost ${J} is old`;
    } else {
      main =
        ruleCents !== null
          ? rate(ruleCents, ruleUnit)
          : (G ?? "No rate in Gusto");
      if (checks.has("CHK-10") && G) sub = `Gusto says ${G}`;
      else if (checks.has("CHK-09")) sub = "Gusto onboarding open";
    }

    if (showPay) {
      if (checks.has("CHK-11"))
        note = `${hoursText ?? "Hours"} this cycle and no Venmo rate.${J ? ` Jobber's ${J} is a cost rate, so RollPay won't pay from it.` : ""}`;
      else if (checks.has("CHK-08"))
        note = `Marked inactive but has ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${hoursText ? ` (${hoursText})` : ""} this cycle.`;
      else if (checks.has("CHK-10"))
        note = `Jobber${ruleCents !== null ? " and the rule" : ""} say ${J ?? "—"}; Gusto's record says ${G ?? "—"}. Waiting for you to decide which is right.`;
      else if (checks.has("CHK-18"))
        note = `Salary is right. Jobber's job-cost rate (${J ?? "—"}/h) is behind the current ${ruleCost === null ? "rate" : `${formatCents(ruleCost)}/h`}, so job profit looks too high.`;
      else if (checks.has("CHK-09"))
        note = `${hoursText ?? "Hours"} this cycle. Can't be paid until Gusto onboarding is done.`;
      else if (checks.has("CHK-07"))
        note = "No hours this cycle. The manager is asked why.";
      else if (kind === "venmo")
        note = `Paid on Venmo${venmoCents === null ? "" : ` at ${rate(venmoCents, "h")}`}${payRule ? " from your rule" : ""}. Listed in the workbook, never sent to Gusto.`;
      else if (
        kind === "hourly" &&
        jobberCents !== null &&
        jobberCents === gustoCents &&
        (ruleCents === null || ruleCents === gustoCents)
      )
        note = "Rates match in every system.";
      else if (kind === "salary") note = "Salary in Gusto.";
      else note = "No open checks about this person's pay.";
    } else if (checks.has("CHK-07"))
      note = "No hours this cycle. You'll get a question about it.";
    else note = "Nothing open about this person.";

    const otherFlagIds = mine
      .filter((f) => !PERSON_CHECKS[f.checkId] && f.routeTo !== "none")
      .map((f) => f.id);
    if (otherFlagIds.length)
      note += ` ${otherFlagIds.length} other question${otherFlagIds.length === 1 ? "" : "s"} about their hours ${otherFlagIds.length === 1 ? "is" : "are"} on Home.`;

    const tiles: RateTile[] = [
      {
        system: "jobber",
        value:
          jobberCents === null
            ? w.jobber
              ? "no rate"
              : "not in Jobber"
            : `${formatCents(jobberCents)}/h${kind === "hourly" ? "" : " cost"}`,
        warn: checks.has("CHK-18"),
        source: w.jobber?.userId ?? null,
      },
      {
        system: "gusto",
        value:
          gustoCents === null
            ? w.gusto
              ? "no rate"
              : "not in Gusto"
            : rate(gustoCents, gustoUnit),
        warn: checks.has("CHK-10"),
        source: w.gusto ? `Gusto employee ${w.id}` : null,
      },
      {
        system: "rule",
        value:
          ruleCents === null
            ? "none"
            : ruleUnit === "yr" && ruleCost !== null
              ? `${formatCents(ruleCost)}/h cost`
              : rate(ruleCents, ruleUnit),
        warn: checks.has("CHK-11"),
        source: payRule ? `${payRule.id} · ${payRule.status}` : null,
      },
    ];

    const history: PayHistoryLine[] = [];
    if (current)
      history.push({
        id: "now",
        period: `${periodLabel(current, timeZone)} · this cycle`,
        text: hoursText ? `${hoursText} · ${label}` : label,
        recordIds: [],
      });
    const past = input.pastPayrolls
      .filter((p) => p.workerId === w.id)
      .sort(
        (a, b) =>
          (cycleNumber.get(b.cycleId) ?? 0) - (cycleNumber.get(a.cycleId) ?? 0),
      );
    for (const p of past) {
      const cycle = sorted.find((c) => c.id === p.cycleId);
      const regular = p.earnings.find((e) => e.name === "Regular Hours");
      const text =
        p.paidVia === "venmo"
          ? `${formatCents(p.grossCents)} on Venmo`
          : p.paidVia === "gusto_off_cycle"
            ? `${formatCents(p.grossCents)} ${p.earnings.map((e) => e.name.toLowerCase()).join(", ")} · off-cycle in Gusto`
            : regular?.rateCents != null
              ? `${rate(regular.rateCents, "h")} · paid in Gusto`
              : `${formatCents(p.grossCents)} salary · paid in Gusto`;
      history.push({
        id: p.id,
        period: cycle ? periodLabel(cycle, timeZone) : p.cycleId,
        text,
        recordIds: [p.id],
      });
    }
    if (!past.length && current)
      history.push({
        id: "none",
        period: `Before ${periodLabel(current, timeZone).split(" – ")[0]}`,
        text: "No past payroll on file",
        recordIds: [],
      });

    return {
      id: w.id,
      displayName: w.displayName,
      initials: initials(w.displayName),
      roleLabel: `${w.status === "inactive" ? "Inactive" : ROLE_WORDS[w.role]} · ${PAY_WORDS[w.payType]}`,
      kind,
      foundIn: {
        jobber: w.jobber !== null,
        gusto: w.gusto !== null,
        venmo: kind === "venmo",
      },
      hours,
      hourEntryIds: entries.map((e) => e.id),
      tone,
      label,
      needsLook: tone === "look" || tone === "blocked",
      flagIds: personFlags.map((f) => f.id),
      otherFlagIds,
      note,
      pay: showPay
        ? {
            main,
            sub,
            tiles,
            ruleId: payRule?.id ?? null,
            history,
          }
        : null,
    };
  });

  const s = input.company?.settings;
  const overtime = input.rules.find((r) => r.type === "overtime_policy");
  const longShift = input.rules.find((r) => r.type === "long_shift_threshold");
  const settings: SettingCard[] =
    input.company && s
      ? [
          {
            id: "schedule",
            label: "Pay schedule",
            text:
              FREQUENCY_WORDS[input.company.payFrequency] ??
              input.company.payFrequency,
            value: null,
            unit: "",
            source: "From Gusto",
          },
          {
            id: "timezone",
            label: "Timezone",
            text: `${TZ_WORDS[timeZone] ?? timeZone} (${timeZone})`,
            value: null,
            unit: "",
            source: "From Gusto",
          },
          {
            id: "overtime",
            label: "Overtime after",
            text: `${s.otWeeklyHours} h a week${num(overtime?.params.multiplier) ? `, ${num(overtime?.params.multiplier)}×` : ""}`,
            value: s.otWeeklyHours,
            unit: "h a week",
            source: overtime
              ? `Rule ${overtime.id} · ${overtime.status}`
              : "Company setting",
          },
          {
            id: "longShift",
            label: "Long shift",
            text: `Flag over ${s.longShiftHours} h`,
            value: s.longShiftHours,
            unit: "h",
            source: longShift
              ? `Rule ${longShift.id} · ${longShift.status}`
              : "Company setting",
          },
          {
            id: "payChange",
            label: "Pay change check",
            text: `Flag over ${s.grossChangePct}% vs the last 3 cycles`,
            value: s.grossChangePct,
            unit: "%",
            source: "Company setting · always comes to the owner",
          },
          {
            id: "margin",
            label: "Low job profit",
            text: `Flag under ${s.lowMarginPct}% margin`,
            value: s.lowMarginPct,
            unit: "% margin",
            source: "Company setting",
          },
        ]
      : [];

  const routingRule = input.rules.find((r) => r.type === "routing");
  const person = (v: unknown) => {
    const id = str(v);
    return id ? { id, name: nameOf(id) } : null;
  };

  const currentRuns = input.syncRuns.filter((r) => r.cycleId === current?.id);
  const APPS: {
    system: ConnectedApp["system"];
    name: string;
    what: string;
    object: string;
    noun: string;
  }[] = [
    {
      system: "jobber",
      name: "Jobber",
      what: "Hours, jobs, visits, expenses",
      object: "timeSheetEntries",
      noun: "entries",
    },
    {
      system: "qbo",
      name: "QuickBooks",
      what: "Purchases and bills",
      object: "Purchase",
      noun: "purchases",
    },
    {
      system: "gusto",
      name: "Gusto",
      what: "People, rates, drafts",
      object: "employees",
      noun: "employees",
    },
  ];
  const apps: ConnectedApp[] = APPS.flatMap((a) => {
    const runs = currentRuns.filter((r) => r.source === a.system);
    if (!runs.length) return [];
    const primary = runs.find((r) => r.object === a.object);
    const main = primary ?? runs[0];
    return [
      {
        system: a.system,
        name: a.name,
        what: a.what,
        count: `${main.pulled} of ${main.expected ?? "?"} ${primary ? a.noun : main.object}`,
        complete: runs.every((r) => r.complete),
        syncRunIds: runs.map((r) => r.id),
      },
    ];
  });
  const finished = currentRuns
    .map((r) => r.finishedAt)
    .filter((t): t is string => t !== null)
    .sort();

  // Onboarding's history read: past cycles' entry syncs and the past payroll lines, as counts.
  const closed = sorted.slice(0, -1);
  const closedIds = new Set(closed.map((c) => c.id));
  const entryRuns = input.syncRuns.filter(
    (r) =>
      r.cycleId !== null &&
      closedIds.has(r.cycleId) &&
      r.source === "jobber" &&
      r.object === "timeSheetEntries",
  );
  const pastLines = input.pastPayrolls.filter((p) => closedIds.has(p.cycleId));
  const reads: HistoryRead[] = [];
  if (entryRuns.length) {
    const pulled = entryRuns.reduce((n, r) => n + r.pulled, 0);
    const expected = entryRuns.every((r) => r.expected !== null)
      ? entryRuns.reduce((n, r) => n + (r.expected ?? 0), 0)
      : null;
    const complete = entryRuns.every((r) => r.complete);
    reads.push({
      system: "jobber",
      label: "Time entries",
      pulled,
      expected,
      complete,
      detail: complete
        ? `${pulled} of ${expected ?? "?"} · matches Jobber`
        : `${pulled} of ${expected ?? "?"} · ${entryRuns.filter((r) => !r.complete).length} sync incomplete, marked, nothing filled in`,
    });
  }
  if (pastLines.length) {
    const venmo = pastLines.filter((p) => p.paidVia === "venmo").length;
    reads.push({
      system: "gusto",
      label: "Past pay lines",
      pulled: pastLines.length,
      expected: null,
      complete: true,
      detail: `${closed.length} payrolls · ${pastLines.length - venmo} Gusto lines, ${venmo} Venmo`,
    });
  }
  if (input.roster.length) {
    const inGusto = input.roster.filter((w) => w.gusto !== null).length;
    reads.push({
      system: "gusto",
      label: "People",
      pulled: input.roster.length,
      expected: null,
      complete: true,
      detail: `${inGusto} in Gusto, ${input.roster.length - inGusto} on Venmo`,
    });
  }
  const first = closed[0];
  const last = closed.at(-1);

  return {
    people,
    settings,
    history: {
      cycles: closed.length,
      period:
        first && last
          ? periodLabel({ ...first, periodEnd: last.periodEnd }, timeZone)
          : null,
      reads,
    },
    routing: routingRule
      ? {
          ruleId: routingRule.id,
          jobFacts: person(routingRule.params.jobFacts),
          money: person(routingRule.params.money),
        }
      : null,
    employeesMayBeTexted: s?.employeesMayBeTexted ?? null,
    apps,
    syncedAt: finished.at(-1) ?? null,
    canSeePay: showPay,
    sources: input.sources,
  };
}
