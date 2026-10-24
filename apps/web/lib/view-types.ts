import type { AgentKind } from "@/components/AgentChip";
import type {
  AuditEvent,
  Correction,
  Flag,
  FlagEvent,
  Question,
  ThreadMessage,
} from "@/lib/types";

// What the server hands a screen. Everything here has already been redacted for the viewer, so a client
// component can only render what it was given: there is no pay in these shapes for a manager to leak.
export type ThreadView = { workerName: string; messages: ThreadMessage[] };

/** Same shape as Convex flags.get (PR #15), plus the pieces the detail screen shows. */
export type FlagDetailData = {
  flag: Flag;
  question: Question | null;
  correction: Correction | null;
  events: FlagEvent[];
  thread: ThreadView | null;
  recipientName: string | null;
};

export type InboxItem = {
  flag: Flag;
  question: Question | null;
  recipientName: string | null;
  thread: ThreadView | null;
};

export type ManagerInboxData = { needsOk: InboxItem[]; rest: InboxItem[] };

export type AuditViewData = {
  events: AuditEvent[];
  /** Flags this viewer may open, so the log only links to pages that will render. */
  linkableFlagIds: string[];
};

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

/** What one flag's card needs beyond the flag. Built on the server (lib/server/fixtures.ts homeView). */
export type FlagInfo = {
  question: Question | null;
  recipient: string;
  /** The worker's text back, when the flag is answered. */
  reply: ThreadMessage | null;
  agents: AgentKind[];
};

// What the server hands the home and inputs pages, already filtered and redacted for the viewer.
export type HomeData = {
  flags: Flag[];
  info: Record<string, FlagInfo>;
  audit: AuditEvent[];
  cycle: Cycle | null;
  previousQuestionsAsked: number | null;
  /** Fixture questions sent or answered this cycle. */
  questionsAsked: number;
  syncRuns: SyncRun[];
  rulesProposed: number;
  /** Where `cycle.stage` came from, when it is not the cycle record as stored. */
  stageNote: string | null;
  /** Fixture files behind each number, per company; null when this company has no such fixture. */
  sources: {
    records: string | null;
    roster: string | null;
    rules: string | null;
  };
};
