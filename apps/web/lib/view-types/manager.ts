import type { SourceSystem } from "@/lib/types";
import type { ThreadView } from "@/lib/view-types";

// What the server hands the manager inbox (V3) and the employee review page. Hours, jobs and record ids only:
// there is no pay field in any of these shapes, so neither page can leak it.

/** One source record as the manager sees it: its id and its hours or times, never an amount. */
export type RecordRow = { recordId: string; detail: string };

export type SourceRef = {
  system: SourceSystem;
  recordId: string;
  url: string | null;
};

/** A simulated re-check result, used only while flags have no "fixed in source" status (Devaj, need (a)). */
export type DemoRecheck = "fixed" | "still-there";

export type ManagerItem = {
  /** The flag id; every action on the item refers to it. */
  flagId: string;
  checkId: string;
  /** "fix": edit it in Jobber, then re-check. "answer": one tap, nothing to edit. */
  kind: "fix" | "answer";
  /** First name of the worker the flag is about, when it names one. */
  worker: string | null;
  /** Plain check title, e.g. "Two entries overlap". */
  category: string;
  title: string;
  /** Day and job, or the cycle, for the row under the title. */
  when: string;
  why: string;
  rows: RecordRow[];
  /** Every record the flag names, from flag.where[]. */
  sources: SourceRef[];
  /** The rule that made this a question, when one did. */
  ruleId: string | null;
  /** What to change in Jobber. Null when there is nothing to edit there. */
  fix: string | null;
  link: { label: string; url: string; recordLevel: boolean } | null;
  question: string;
  options: string[];
  /** The option that means "I'll fix it in Jobber" (it switches to the fix flow instead of sending). */
  fixOption: number | null;
  /** Fixture-mode re-check outcomes, one per tap of "I updated it". */
  demoRecheck: DemoRecheck[];
  thread: ThreadView | null;
};

export type ManagerInboxV3 = {
  companyId: string;
  cycleId: string | null;
  /** "Oct 10 – 23" in the company's timezone. */
  period: string | null;
  manager: { id: string; firstName: string } | null;
  owner: { firstName: string } | null;
  items: ManagerItem[];
  /** Where the items came from, shown on the page. */
  source: string;
};

export type EmployeeDay = {
  /** First entry id that day, for keys and source lines. */
  recordIds: string[];
  day: string;
  detail: string;
  hours: number;
  flagged: boolean;
};

export type EmployeeReviewData = {
  companyId: string;
  companyName: string;
  token: string;
  worker: { id: string; firstName: string };
  managerFirstName: string | null;
  period: string;
  question: {
    flagId: string;
    eyebrow: string;
    text: string;
    detail: string;
    /** Bars for the timeline picture: start/end as a share of the 6 AM to 6 PM window, 0..1. */
    bars: { recordId: string; label: string; from: number; to: number }[];
    overlap: { from: number; to: number; label: string } | null;
    options: { label: string; hint: string }[];
    /** Index of "Something else": it asks for times instead. */
    otherOption: number | null;
  } | null;
  weeks: { label: string; hours: number }[];
  days: EmployeeDay[];
  source: string;
};
