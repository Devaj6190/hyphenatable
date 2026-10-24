import type { AgentKind } from "@/components/AgentChip";
import { fixtureEvents, fixtureQuestions, workerName } from "@/lib/fixtures";
import type { Flag, Question, SourceSystem } from "@/lib/types";
import cyclesA from "../../../data/fixtures/a/cycles.json";
import rulesA from "../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../data/fixtures/a/syncRuns.json";
import workersA from "../../../data/fixtures/a/workers.json";

// Section 6 shapes, the slices the home and inputs pages read. B's schema replaces these.
export type Cycle = {
  id: string;
  number: number;
  periodStart: string;
  periodEnd: string;
  stage:
    | "setup"
    | "syncing"
    | "checking"
    | "asking"
    | "gate1_ready"
    | "stage1_filled"
    | "reconciling"
    | "gate2_ready"
    | "stage2_filled"
    | "closed";
  questionsAsked: number;
};

export type SyncRun = {
  id: string;
  cycleId: string | null;
  source: string;
  object: string;
  finishedAt: string | null;
  pulled: number;
  expected: number | null;
  complete: boolean;
  method: string;
  error: string | null;
};

export type RosterWorker = {
  id: string;
  displayName: string;
  role: "field" | "manager" | "owner" | "office";
  payType: "hourly" | "salary" | "contractor_venmo" | "commission";
  status: "active" | "inactive";
  jobber: { userId: string; labourRateCents: number | null } | null;
  gusto: {
    employeeUuid: string | null;
    contractorUuid: string | null;
    rateCents: number | null;
  } | null;
  venmoRateCents: number | null;
};

// Generated fixtures from A (data/fixtures/<id>). Only Company A has them so far.
const fixtures: Record<
  string,
  { cycles: Cycle[]; syncRuns: SyncRun[]; ruleStatuses: string[] }
> = {
  a: {
    cycles: cyclesA as Cycle[],
    syncRuns: syncRunsA as SyncRun[],
    ruleStatuses: rulesA.map((r) => r.status),
  },
};

export function homeFixture(companyId: string) {
  const f = fixtures[companyId];
  if (!f) return null;
  const sorted = [...f.cycles].sort((a, b) => a.number - b.number);
  const raw = sorted.at(-1);
  if (!raw) return null;
  // ponytail: cycles.json is the pre-run snapshot (stage "setup"); app/_fixtures show the same cycle
  // mid-way with questions out, so the tracker shows "asking". cycles.get replaces both.
  const cycle: Cycle = { ...raw, stage: "asking" };
  return {
    cycle,
    previous: sorted.at(-2) ?? null,
    syncRuns: f.syncRuns.filter((r) => r.cycleId === cycle.id),
    rulesProposed: f.ruleStatuses.filter((s) => s === "proposed").length,
  };
}

// ponytail: app/_fixtures/audit.json runs past the moment flags.json shows (it goes on to Gate 1 and the
// Gusto draft), so the fixture feed stops at the correction proposal. Live audit.list has no cutoff.
export const FIXTURE_NOW = "2026-10-24T08:41:00.000Z";

export const roster = (companyId: string): RosterWorker[] =>
  companyId === "a" ? (workersA as RosterWorker[]) : [];

// The eight stages from the C plan (4.5), mapped from Cycle.stage.
export const STAGES = [
  { label: "Collecting", hint: "Pulling Jobber, QuickBooks and Gusto" },
  { label: "Checking", hint: "Running every check on the records" },
  { label: "Asking", hint: "Questions out, answers coming in" },
  { label: "Gate 1", hint: "You approve wages", gate: true },
  { label: "Draft filled", hint: "Gusto draft only. You submit." },
  { label: "Reconciling", hint: "Payments, expenses and job profit" },
  { label: "Gate 2", hint: "You approve commissions", gate: true },
  { label: "Done", hint: "Cycle closed" },
] as const;

export const stageIndex: Record<Cycle["stage"], number> = {
  setup: 0,
  syncing: 0,
  checking: 1,
  asking: 2,
  gate1_ready: 3,
  stage1_filled: 4,
  reconciling: 5,
  gate2_ready: 6,
  stage2_filled: 7,
  closed: 7,
};

export const SOURCES: { key: string; system: SourceSystem }[] = [
  { key: "jobber", system: "Jobber" },
  { key: "qbo", system: "QuickBooks" },
  { key: "gusto", system: "Gusto" },
];

const objectWords: Record<string, string> = {
  timeSheetEntries: "time entries",
  Purchase: "purchases",
  employees: "workers",
  expenses: "expenses",
  visits: "visits",
};
export const objectWord = (o: string) => objectWords[o] ?? o;

// Records the checks read line by line; "clean" counts these minus the ones a flag points at.
const CHECKED_OBJECTS = ["timeSheetEntries", "Purchase", "expenses"];

export function countFlags(flags: Flag[], runs: SyncRun[]) {
  const by = (s: Flag["status"][]) =>
    flags.filter((f) => s.includes(f.status)).length;
  const checked = runs
    .filter((r) => CHECKED_OBJECTS.includes(r.object))
    .reduce((n, r) => n + r.pulled, 0);
  const flagged = new Set(
    flags.flatMap((f) => [...f.subject.entryIds, ...f.subject.expenseIds]),
  ).size;
  return {
    clean: checked > 0 ? Math.max(0, checked - flagged) : null,
    checked,
    fixed: by(["corrected"]),
    needsYou: by(["open", "answered"]),
    waiting: by(["asked"]),
    open: by(["open", "answered", "asked"]),
    held: by(["held"]),
  };
}

export const questionFor = (f: Flag): Question | undefined =>
  fixtureQuestions.find((q) => q.id === f.questionId);

export function recipient(q: Question | undefined): string {
  if (!q) return "the right person";
  const name = workerName(q.toWorkerId);
  return q.toRole === "employee" ? name : `${name}, ${q.toRole}`;
}

// Agents that touched this flag, from its events; the controller found it if nobody else did.
export function flagAgents(flagId: string): AgentKind[] {
  const agents = fixtureEvents
    .filter((e) => e.flagId === flagId && e.actor.agent)
    .map((e) => e.actor.agent as AgentKind);
  return agents.length ? [...new Set(agents)] : ["controller"];
}

export function affectsLabel(checkId: string): string {
  const n = Number(checkId.slice(4));
  if (n <= 12 || n === 22) return "Wages";
  if (n === 23) return "Everything it covers";
  if (n === 19 || n === 20) return "Commission";
  return "Job cost";
}

/** "6:06 PM" in the company's zone. Assembled from parts so server and browser render the same string. */
export function clock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}
