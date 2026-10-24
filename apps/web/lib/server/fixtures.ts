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
  FlagDetailData,
  InboxItem,
  ManagerInboxData,
  ThreadView,
} from "@/lib/view-types";

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
