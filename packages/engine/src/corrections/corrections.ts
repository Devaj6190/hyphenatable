// B-10: what an answer changes, and what that change does to pay and to the job's profit. Pure; the
// Convex side loads records, stores the proposal and applies it only after a person approves.

import { payRate } from "../payroll/rates";
import { computeStage1 } from "../payroll/stage1";
import type {
  Company,
  Cycle,
  Expense,
  FlagRef,
  Rule,
  TimeEntry,
  Worker,
} from "../payroll/types";
import type { QuestionTemplate, ReplyResult } from "../questions/questions";

export type Change =
  | {
      table: "timeEntries";
      id: string;
      field: "jobId";
      before: string | null;
      after: string;
    }
  | {
      table: "timeEntries";
      id: string;
      field: "endAt";
      before: string | null;
      after: string;
    }
  | {
      table: "timeEntries";
      id: string;
      field: "payable";
      /** null: the source never said (real exports). */
      before: boolean | null;
      after: false;
    }
  | {
      table: "expenses";
      id: string;
      field: "matchedJobId";
      before: string | null;
      after: string;
    }
  | {
      table: "expenses";
      id: string;
      field: "kind";
      before: string;
      after: "overhead";
    };

/**
 * The one field an answer changes, or null when the answer changes nothing (a confirm, or the record
 * already holds the answer) or cannot be mapped (an unknown job number: never guessed).
 */
export function changeFor(
  template: QuestionTemplate,
  r: ReplyResult,
  subject: { entryIds: string[]; expenseIds: string[] },
  records: {
    entries: TimeEntry[];
    expenses: Expense[];
    jobIdByNumber: Map<number, string>;
  },
): Change | null {
  const c = changeForRaw(template, r, subject, records);
  return c && c.before !== c.after ? c : null;
}

function changeForRaw(
  template: QuestionTemplate,
  r: ReplyResult,
  subject: { entryIds: string[]; expenseIds: string[] },
  records: {
    entries: TimeEntry[];
    expenses: Expense[];
    jobIdByNumber: Map<number, string>;
  },
): Change | null {
  if (r.kind !== "change") return null;
  const entry = records.entries.find((e) => e.id === subject.entryIds[0]);
  const expense = records.expenses.find((x) => x.id === subject.expenseIds[0]);
  const jobId =
    typeof r.values.jobNumber === "number"
      ? (records.jobIdByNumber.get(r.values.jobNumber) ?? null)
      : null;
  switch (template) {
    case "entryNoJob":
      return entry && jobId
        ? {
            table: "timeEntries",
            id: entry.id,
            field: "jobId",
            before: entry.jobId,
            after: jobId,
          }
        : null;
    case "openTimer":
    case "longShift":
      return entry && typeof r.values.endAt === "string"
        ? {
            table: "timeEntries",
            id: entry.id,
            field: "endAt",
            before: entry.endAt,
            after: r.values.endAt,
          }
        : null;
    case "overlap": {
      const drop = records.entries.find((e) => e.id === r.values.dropEntryId);
      return drop
        ? {
            table: "timeEntries",
            id: drop.id,
            field: "payable",
            before: drop.payable,
            after: false,
          }
        : null;
    }
    case "expenseNoJob":
      if (!expense) return null;
      if (r.values.expenseKind === "overhead")
        return {
          table: "expenses",
          id: expense.id,
          field: "kind",
          before: expense.kind,
          after: "overhead",
        };
      return jobId
        ? {
            table: "expenses",
            id: expense.id,
            field: "matchedJobId",
            before: expense.matchedJobId,
            after: jobId,
          }
        : null;
  }
}

/** The records with the change applied. A new end time also fixes the duration and stops the timer. */
export function applyChange(
  entries: TimeEntry[],
  expenses: Expense[],
  c: Change,
): { entries: TimeEntry[]; expenses: Expense[] } {
  if (c.table === "timeEntries")
    return {
      entries: entries.map((e) => (e.id === c.id ? patchEntry(e, c) : e)),
      expenses,
    };
  return {
    entries,
    expenses: expenses.map((x) =>
      x.id === c.id ? ({ ...x, [c.field]: c.after } as Expense) : x,
    ),
  };
}

export function patchEntry(
  e: TimeEntry,
  c: Extract<Change, { table: "timeEntries" }>,
): TimeEntry {
  if (c.field === "endAt")
    return {
      ...e,
      endAt: c.after,
      ticking: false,
      durationSec: Math.round(
        (Date.parse(c.after) - Date.parse(e.startAt)) / 1000,
      ),
    };
  return { ...e, [c.field]: c.after } as TimeEntry;
}

export type PayrollInput = {
  company: Company;
  cycle: Cycle;
  workers: Worker[];
  entries: TimeEntry[];
  expenses: Expense[];
  rules: Rule[];
  heldFlags: FlagRef[];
};

export type Effect = {
  /** Stage 1 gross after − before, every worker, in cents. */
  payCents: number;
  /** Profit change on the job the corrected record belongs to (after the change, else before). */
  profitCents: number | null;
  profitJobId: string | null;
  /** Why profit could not be computed (a missing rate); null when it was. */
  profitNote: string | null;
};

const gross = (p: PayrollInput, entries: TimeEntry[], expenses: Expense[]) =>
  computeStage1(p.cycle, entries, p.workers, p.rules, {
    company: p.company,
    heldFlags: p.heldFlags,
    expenses,
  }).draft.totals.grossCents;

/**
 * What one record costs the job it is on: an entry's payable hours at the worker's base hourly rate
 * (overtime premium is not allocated to jobs), or an expense's amount when it is job cost.
 */
function costOn(
  p: PayrollInput,
  record: TimeEntry | Expense,
  jobId: string,
): { cents: number | null; note: string | null } {
  if ("workerId" in record) {
    // Unknown payable (null) counts, as in payroll hours: hours are never trimmed.
    if (record.jobId !== jobId || record.payable === false)
      return { cents: 0, note: null };
    const w = p.workers.find((x) => x.id === record.workerId);
    const rate = w ? payRate(w, p.rules) : null;
    if (!rate?.ok || rate.unit !== "Hour")
      return { cents: null, note: `no hourly rate for ${record.workerId}` };
    return {
      cents: Math.round((record.durationSec * rate.rateCents) / 3600),
      note: null,
    };
  }
  return {
    cents:
      record.matchedJobId === jobId && record.kind === "job_cost"
        ? (record.amountCents ?? 0)
        : 0,
    note: null,
  };
}

export function effectOf(p: PayrollInput, c: Change): Effect {
  const after = applyChange(p.entries, p.expenses, c);
  const payCents =
    gross(p, after.entries, after.expenses) - gross(p, p.entries, p.expenses);
  const find = (set: { entries: TimeEntry[]; expenses: Expense[] }) =>
    c.table === "timeEntries"
      ? set.entries.find((e) => e.id === c.id)
      : set.expenses.find((x) => x.id === c.id);
  const before = find(p);
  const now = find(after);
  const jobOf = (r: TimeEntry | Expense | undefined) =>
    !r ? null : "workerId" in r ? r.jobId : r.matchedJobId;
  const jobId = jobOf(now) ?? jobOf(before);
  if (!jobId || !before || !now)
    return {
      payCents,
      profitCents: null,
      profitJobId: null,
      profitNote: "no job affected",
    };
  const cb = costOn(p, before, jobId);
  const ca = costOn(p, now, jobId);
  if (cb.cents === null || ca.cents === null)
    return {
      payCents,
      profitCents: null,
      profitJobId: jobId,
      profitNote: cb.note ?? ca.note,
    };
  return {
    payCents,
    profitCents: cb.cents - ca.cents,
    profitJobId: jobId,
    profitNote: null,
  };
}
