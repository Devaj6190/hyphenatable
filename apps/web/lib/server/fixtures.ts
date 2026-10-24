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
import workers from "@/app/_fixtures/workers.json";
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
  redactAuditEvent,
  redactCorrection,
  redactFlag,
  type Viewer,
  viewerFor,
} from "@/lib/policy";
import { parseRole, ROLE_COOKIE } from "@/lib/role";
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
  FlagDetailData,
  FlagInfo,
  HomeData,
  InboxItem,
  ManagerInboxData,
  RosterWorker,
  SyncRun,
  ThreadView,
} from "@/lib/view-types";
import cyclesA from "../../../../data/fixtures/a/cycles.json";
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
const workersByCompany: Record<string, FixtureWorker[]> = {
  a: workers as FixtureWorker[],
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
