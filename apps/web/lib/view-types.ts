import type { Cycle, Rule, SyncRun } from "@/lib/rules";
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

export type EvidenceItem = {
  id: string;
  kind: "cycle" | "payroll" | "other";
  label: string;
  incomplete: SyncRun[];
};

/**
 * A rule as the server hands it to a screen. `params` is always empty: the plain words are built on the
 * server, and only the owner's carry pay amounts.
 */
export type RuleView = Rule & {
  words: string;
  evidence: EvidenceItem[] | null;
  summary: { text: string; seen: number | null; of: number | null } | null;
};

export type PastQuestion = {
  id: string;
  cycleId: string;
  toRole: string;
  text: string;
};

/** A "What did we miss?" question for the owner, written from payroll lines no rule explains. */
export type MissedQuestion = {
  id: string;
  companyId: string;
  text: string;
  options: string[];
  evidence: string[];
  relatedRuleIds: string[];
};

export type RulesViewData = {
  rules: RuleView[];
  /** The owner's worker id: the approver for every rule in the demo. */
  ownerId: string | null;
  /** "Name (role)" by worker id, for the people rules name as answerer or approver. */
  names: Record<string, string>;
  cycles: Cycle[];
  incompleteSyncs: SyncRun[];
  /** Owner: every past question. Manager: only the ones sent to the manager. */
  pastQuestions: PastQuestion[];
  /** Owner only; empty for a manager. */
  missedQuestions: MissedQuestion[];
  /** Systems with at least one sync run on record. */
  connected: { jobber: boolean; qbo: boolean; gusto: boolean };
  sources: { rules: string; cycles: string; questions: string; missed: string };
};
