import "server-only";
import { cookies } from "next/headers";
import audit from "@/app/_fixtures/audit.json";
import corrections from "@/app/_fixtures/corrections.json";
import events from "@/app/_fixtures/events.json";
import flags from "@/app/_fixtures/flags.json";
import ownerRoutedFlags from "@/app/_fixtures/flags.owner-routed.json";
import messages from "@/app/_fixtures/messages.json";
import questions from "@/app/_fixtures/questions.json";
import workbook from "@/app/_fixtures/workbook.json";
import type { AgentKind } from "@/components/AgentChip";
import {
  type CycleWorkbook,
  holdsOf,
  type Readiness,
  type WorkbookData,
} from "@/components/workbook/data";
import {
  canSeeAuditEvent,
  canSeeFlag,
  canSeePay,
  redactAuditEvent,
  redactCorrection,
  redactFlag,
  type Viewer,
  viewerFor,
} from "@/lib/policy";
import { parseRole, ROLE_COOKIE } from "@/lib/role";
import {
  closedOf,
  cycleLabel,
  type Rule,
  type Cycle as RuleCycle,
  type SyncRun as RuleSyncRun,
  ruleWords,
} from "@/lib/rules";
import {
  MISSED_SOURCE,
  missedQuestions,
} from "@/lib/server/onboardingQuestions";
import type {
  AuditEvent,
  Correction,
  FixtureWorker,
  Flag,
  FlagEvent,
  Question,
  ThreadMessage,
  ViewerRole,
} from "@/lib/types";
import type {
  AuditViewData,
  Cycle,
  EvidenceItem,
  FlagDetailData,
  FlagInfo,
  HomeData,
  InboxItem,
  ManagerInboxData,
  PastQuestion,
  RosterWorker,
  RulesViewData,
  RuleView,
  SyncRun,
  ThreadView,
} from "@/lib/view-types";
import cyclesA from "../../../../data/fixtures/a/cycles.json";
import pastPayrollsA from "../../../../data/fixtures/a/pastPayrolls.json";
import questionsA from "../../../../data/fixtures/a/questions.json";
import rulesA from "../../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../../data/fixtures/a/syncRuns.json";
import rosterA from "../../../../data/fixtures/a/workers.json";

// Fixture mode, on the server only. `server-only` makes the build fail if a client component imports this file,
// so the JSON below (which holds the pay) can never be bundled for a browser. Every export takes a Viewer and
// returns redacted data; nothing here hands out the raw rows.
const allFlags = [...flags, ...ownerRoutedFlags] as Flag[];
const allQuestions = questions as Question[];
const allCorrections = corrections as Correction[];
const allFlagEvents = events as FlagEvent[];
const allMessages = messages as ThreadMessage[];
// JSON infers actor.kind and agent as plain strings, so go through unknown.
const allAudit = audit as unknown as AuditEvent[];

// Only Company A has fixture people. Other companies have none, so no viewer has a crew there.
// The roster source is data/fixtures/a/workers.json (all 14 people; app/_fixtures/workers.json was a 4-person
// subset that missed workers the rules name). Only id, name, role and manager are kept: the roster's pay
// fields never get past this line.
const workersByCompany: Record<string, FixtureWorker[]> = {
  a: rosterA.map(({ id, displayName, role, managerId }) => ({
    id,
    displayName,
    role,
    managerId,
  })) as FixtureWorker[],
};
const workersOf = (companyId: string) => workersByCompany[companyId] ?? [];

const nameOf = (companyId: string, id: string) =>
  workersOf(companyId).find((w) => w.id === id)?.displayName ?? id;

/** The demo has no login: the role cookie picks the owner or the manager worker. */
export function viewerForRole(companyId: string, role: ViewerRole): Viewer {
  const ws = workersOf(companyId);
  const worker = ws.find((w) => w.role === role);
  return viewerFor(role, worker?.id ?? `${companyId}-${role}`, ws);
}

export async function currentViewer(companyId: string): Promise<Viewer> {
  const store = await cookies();
  return viewerForRole(companyId, parseRole(store.get(ROLE_COOKIE)?.value));
}

const visibleFlags = (viewer: Viewer, companyId: string) =>
  allFlags.filter((f) => f.companyId === companyId && canSeeFlag(viewer, f));

export const allFlagParams = () =>
  allFlags.map((f) => ({ companyId: f.companyId, flagId: f.id }));

function threadFor(
  companyId: string,
  question: Question | undefined,
): ThreadView | null {
  if (!question) return null;
  const msgs = allMessages
    .filter((m) => m.questionId === question.id)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (msgs.length === 0) return null;
  return {
    workerName: nameOf(companyId, msgs[0].workerId),
    messages: msgs,
  };
}

const recipientOf = (companyId: string, q: Question | undefined) =>
  q?.toRole === "employee" ? nameOf(companyId, q.toWorkerId) : null;

export function homeFlags(viewer: Viewer, companyId: string): Flag[] {
  return visibleFlags(viewer, companyId).map((f) => redactFlag(viewer, f));
}

/** Like Convex flags.get: null when the flag does not exist or this viewer may not see it. */
export function flagDetail(
  viewer: Viewer,
  companyId: string,
  flagId: string,
): FlagDetailData | null {
  const raw = allFlags.find(
    (f) => f.id === flagId && f.companyId === companyId,
  );
  if (!raw || !canSeeFlag(viewer, raw)) return null;
  const question = allQuestions.find((q) => q.id === raw.questionId);
  const correction = allCorrections.find((c) => c.id === raw.correctionId);
  return {
    flag: redactFlag(viewer, raw),
    question: question ?? null,
    correction: correction ? redactCorrection(viewer, correction) : null,
    events: allFlagEvents
      .filter((e) => e.flagId === raw.id)
      .sort((a, b) => a.at.localeCompare(b.at)),
    thread: threadFor(companyId, question),
    recipientName: recipientOf(companyId, question),
  };
}

/** The manager inbox is always the manager's view, whoever is switched in. */
export function managerInbox(companyId: string): ManagerInboxData {
  const viewer = viewerForRole(companyId, "manager");
  const items: InboxItem[] = visibleFlags(viewer, companyId).map((raw) => {
    const question = allQuestions.find((q) => q.id === raw.questionId);
    return {
      flag: redactFlag(viewer, raw),
      question: question ?? null,
      recipientName: recipientOf(companyId, question),
      thread: threadFor(companyId, question),
    };
  });
  return {
    needsOk: items.filter((i) => i.question?.status === "draft"),
    rest: items.filter((i) => i.question?.status !== "draft"),
  };
}

export function auditView(viewer: Viewer, companyId: string): AuditViewData {
  const visibleIds = new Set(visibleFlags(viewer, companyId).map((f) => f.id));
  return {
    events: allAudit
      .filter(
        (e) =>
          e.companyId === companyId && canSeeAuditEvent(viewer, e, visibleIds),
      )
      .map((e) => redactAuditEvent(viewer, e)),
    linkableFlagIds: [...visibleIds],
  };
}

type RuleFixture = {
  rules: Rule[];
  cycles: RuleCycle[];
  pastPayrolls: { id: string; cycleId: string }[];
  syncRuns: RuleSyncRun[];
  questions: PastQuestion[];
};

// Only Company A has rule fixtures. B and R show an empty state until rules.list is live.
const ruleFixtures: Record<string, RuleFixture> = {
  a: {
    rules: rulesA as Rule[],
    cycles: cyclesA,
    pastPayrolls: pastPayrollsA,
    syncRuns: syncRunsA,
    questions: questionsA,
  },
};

/** Past-cycle syncs that pulled fewer records than expected. Shown, never smoothed over. */
const incompleteSyncs = (f: RuleFixture) =>
  f.syncRuns.filter(
    (r) => !r.complete && closedOf(f.cycles).some((c) => c.id === r.cycleId),
  );

/** Evidence ids are cycle ids ("a-c01") or past payroll records ("a-pp-401"). */
function evidenceItems(f: RuleFixture, rule: Rule): EvidenceItem[] {
  const gaps = incompleteSyncs(f);
  return rule.provenance.evidence.map((id) => {
    const cycle = f.cycles.find((c) => c.id === id);
    if (cycle)
      return {
        id,
        kind: "cycle",
        label: cycleLabel(cycle),
        incomplete: gaps.filter((r) => r.cycleId === id),
      };
    const pay = f.pastPayrolls.find((p) => p.id === id);
    const payCycle = pay && f.cycles.find((c) => c.id === pay.cycleId);
    if (pay)
      return {
        id,
        kind: "payroll",
        label: payCycle
          ? `Gusto payroll line, cycle ${payCycle.number}`
          : "Gusto payroll line",
        incomplete: [],
      };
    return { id, kind: "other", label: id, incomplete: [] };
  });
}

/** "Seen in 4 of 4 past cycles" when the evidence is cycles; otherwise names the records. */
function evidenceSummary(f: RuleFixture, items: EvidenceItem[]) {
  const seen = items.filter((i) => i.kind === "cycle").length;
  const of = closedOf(f.cycles).length;
  if (seen && seen === items.length && of)
    return { text: `Seen in ${seen} of ${of} past cycles`, seen, of };
  if (items.length === 1 && items[0].kind === "payroll")
    return { text: `From the ${items[0].label}`, seen: null, of: null };
  return {
    text: `${items.length} source record${items.length === 1 ? "" : "s"}`,
    seen: null,
    of: null,
  };
}

// The words live in lib/rules.ts so live Convex rules read the same; names come from the fixture roster here.
const plainWords = (companyId: string, rule: Rule, showMoney: boolean) =>
  ruleWords(rule, showMoney, (id) => nameOf(companyId, id));

const RULE_SOURCES = {
  rules: "fixture, data/fixtures/a/rules.json",
  cycles: "fixture, data/fixtures/a/cycles.json",
  questions: "fixture, data/fixtures/a/questions.json",
  missed: MISSED_SOURCE,
};

const roleWords: Record<string, string> = {
  owner: "owner",
  manager: "job manager",
  field: "crew",
};
const nameWithRole = (companyId: string, id: string) => {
  const w = workersOf(companyId).find((x) => x.id === id);
  return w ? `${w.displayName} (${roleWords[w.role] ?? w.role})` : id;
};

/** Rules, onboarding and what-it-learned. Rule params hold pay in cents and never leave the server. */
export function rulesView(viewer: Viewer, companyId: string): RulesViewData {
  const f = ruleFixtures[companyId];
  const connected = {
    jobber: !!f?.syncRuns.some((r) => r.source === "jobber"),
    qbo: !!f?.syncRuns.some((r) => r.source === "qbo"),
    gusto: !!f?.syncRuns.some((r) => r.source === "gusto"),
  };
  if (!f)
    return {
      rules: [],
      ownerId: null,
      names: {},
      cycles: [],
      incompleteSyncs: [],
      pastQuestions: [],
      missedQuestions: [],
      connected,
      sources: RULE_SOURCES,
    };
  const showPay = canSeePay(viewer);
  const rules: RuleView[] = f.rules.map((rule) => {
    const evidence =
      rule.source === "owner_stated" ? null : evidenceItems(f, rule);
    return {
      ...rule,
      params: {},
      words: plainWords(companyId, rule, showPay),
      evidence,
      summary: evidence && evidenceSummary(f, evidence),
    };
  });
  const ownerId =
    workersOf(companyId).find((w) => w.role === "owner")?.id ?? null;
  const people = new Set(
    rules.flatMap((r) => [r.provenance.answeredBy, r.provenance.approvedBy]),
  );
  if (ownerId) people.add(ownerId);
  const names: Record<string, string> = {};
  for (const id of people) if (id) names[id] = nameWithRole(companyId, id);
  return {
    rules,
    ownerId,
    names,
    cycles: f.cycles,
    incompleteSyncs: incompleteSyncs(f),
    // Owner-routed questions and the owner's onboarding questions (one is about the manager's own bonus)
    // stay with the owner.
    pastQuestions: f.questions
      .filter((q) => showPay || q.toRole === "manager")
      .map(({ id, cycleId, toRole, text }) => ({ id, cycleId, toRole, text })),
    missedQuestions: showPay
      ? missedQuestions.filter((q) => q.companyId === companyId)
      : [],
    connected,
    sources: RULE_SOURCES,
  };
}

const workbookFixture = workbook as unknown as {
  source: string;
  companies: Record<
    string,
    { workers: Record<string, { name: string }>; cycles: CycleWorkbook[] }
  >;
};

/** Counts records, never money. Uses every flag (owner-routed too): only the owner gets here. */
function readinessOf(wb: CycleWorkbook): Readiness {
  const mine = allFlags.filter((f) => f.cycleId === wb.cycle.id);
  const entries = wb.syncRuns.find((s) => s.object === "timeSheetEntries");
  const flagged = new Set(mine.flatMap((f) => f.subject.entryIds)).size;
  return {
    clean: entries ? entries.pulled - flagged : null,
    pulled: entries ?? null,
    fixed: mine.filter((f) => f.status === "corrected").length,
    open: mine.filter((f) => ["open", "asked", "answered"].includes(f.status))
      .length,
    // The engine already applies held flags, so its holds are the whole list.
    held: holdsOf(wb).length,
    incompleteSyncs: wb.syncRuns.filter((s) => !s.complete).length,
  };
}

/** The workbook shows pay, so it is owner-only: null for a manager. Empty cycles when the company has none. */
export function workbookView(
  viewer: Viewer,
  companyId: string,
): WorkbookData | null {
  if (viewer.role !== "owner") return null;
  const company = workbookFixture.companies[companyId];
  const cycles = company?.cycles ?? [];
  return {
    source: workbookFixture.source,
    names: Object.fromEntries(
      Object.entries(company?.workers ?? {}).map(([id, w]) => [id, w.name]),
    ),
    cycles: cycles.map((wb, i) => ({
      ...wb,
      readiness: readinessOf(wb),
      lastQuestions: i > 0 ? cycles[i - 1].cycle.questionsAsked : null,
    })),
  };
}

// The generated per-company fixtures (data/fixtures/<id>) behind the home and inputs pages. Only Company A
// has them so far; the roster holds pay rates, so it goes out only through rosterView below.
const generated: Record<
  string,
  {
    cycles: Cycle[];
    syncRuns: SyncRun[];
    ruleStatuses: string[];
    roster: RosterWorker[];
  }
> = {
  a: {
    cycles: cyclesA as Cycle[],
    syncRuns: syncRunsA as SyncRun[],
    ruleStatuses: rulesA.map((r) => r.status),
    roster: rosterA as RosterWorker[],
  },
};

const generatedFile = (companyId: string, file: string) =>
  generated[companyId] ? `data/fixtures/${companyId}/${file}` : null;

// ponytail: audit.json runs past the moment flags.json shows (it goes on to Gate 1 and the Gusto draft),
// so the fixture feed stops at the correction proposal. Live audit.list has no cutoff.
const FIXTURE_NOW = "2026-10-24T08:41:00.000Z";

function recipientLabel(companyId: string, q: Question | undefined): string {
  if (!q) return "the right person";
  const name =
    generated[companyId]?.roster.find((w) => w.id === q.toWorkerId)
      ?.displayName ?? nameOf(companyId, q.toWorkerId);
  return q.toRole === "employee" ? name : `${name}, ${q.toRole}`;
}

/** The owner home and the inputs page: flags with what each card needs, the cycle, its pulls and feed. */
export function homeView(viewer: Viewer, companyId: string): HomeData {
  const flags = homeFlags(viewer, companyId);
  const info: Record<string, FlagInfo> = {};
  for (const f of flags) {
    const question = allQuestions.find((q) => q.id === f.questionId);
    const agents = allFlagEvents
      .filter((e) => e.flagId === f.id && e.actor.agent)
      .map((e) => e.actor.agent as AgentKind);
    info[f.id] = {
      question: question ?? null,
      recipient: recipientLabel(companyId, question),
      reply:
        (f.status === "answered" &&
          allMessages.find(
            (m) => m.questionId === question?.id && m.direction === "in",
          )) ||
        null,
      agents: agents.length ? [...new Set(agents)] : ["controller"],
    };
  }

  const fx = generated[companyId];
  const sorted = [...(fx?.cycles ?? [])].sort((a, b) => a.number - b.number);
  const raw = sorted.at(-1);
  // ponytail: cycles.json is the pre-run snapshot (stage "setup"); app/_fixtures show the same cycle mid-way
  // with questions out, so the stage is overridden to "asking" and the screen says so. cycles.get replaces both.
  const cycle: Cycle | null = raw ? { ...raw, stage: "asking" } : null;

  return {
    flags,
    info,
    audit: auditView(viewer, companyId).events.filter(
      (e) => e.cycleId === cycle?.id && e.at <= FIXTURE_NOW,
    ),
    cycle,
    previousQuestionsAsked: sorted.at(-2)?.questionsAsked ?? null,
    questionsAsked: allQuestions.filter(
      (q) =>
        q.cycleId === cycle?.id &&
        !["draft", "approved", "denied"].includes(q.status),
    ).length,
    syncRuns: (fx?.syncRuns ?? []).filter((r) => r.cycleId === cycle?.id),
    rulesProposed: (fx?.ruleStatuses ?? []).filter((s) => s === "proposed")
      .length,
    stageNote: raw
      ? `Fixture override: ${generatedFile(companyId, "cycles.json")} says "${raw.stage}"; the flags fixture has questions out`
      : null,
    sources: {
      records: generatedFile(companyId, "syncRuns.json"),
      roster: generatedFile(companyId, "workers.json"),
      rules: generatedFile(companyId, "rules.json"),
    },
  };
}

/** Who is in this payroll. A manager gets their crew and no rates. */
export function rosterView(viewer: Viewer, companyId: string): RosterWorker[] {
  const all = generated[companyId]?.roster ?? [];
  if (viewer.role === "owner") return all;
  return all
    .filter((w) => viewer.crew.has(w.id))
    .map((w) => ({
      ...w,
      jobber: w.jobber && { ...w.jobber, labourRateCents: null },
      gusto: w.gusto && { ...w.gusto, rateCents: null },
      venmoRateCents: null,
    }));
}

/** The manager and the names of their crew, so the inbox can say who a text is for. */
export function managerCrew(companyId: string) {
  const viewer = viewerForRole(companyId, "manager");
  const crew = viewer.role === "manager" ? viewer.crew : new Set<string>();
  const ws = workersOf(companyId).filter((w) => crew.has(w.id));
  return {
    manager: ws.find((w) => w.role === "manager") ?? null,
    names: Object.fromEntries(ws.map((w) => [w.id, w.displayName])),
  };
}

/** Users who are managers, so the audit log can chip them as Manager rather than Owner. */
export const managerIds = (companyId: string) =>
  workersOf(companyId)
    .filter((w) => w.role === "manager")
    .map((w) => w.id);

/** Questions for the demo panel: only those about a flag this viewer may see, with the names they mention. */
export function demoQuestions(viewer: Viewer, companyId: string) {
  const visibleIds = new Set(visibleFlags(viewer, companyId).map((f) => f.id));
  return {
    questions: allQuestions.filter(
      (q) =>
        q.companyId === companyId && q.flagIds.some((id) => visibleIds.has(id)),
    ),
    names: Object.fromEntries(
      workersOf(companyId).map((w) => [w.id, w.displayName]),
    ),
  };
}
