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
