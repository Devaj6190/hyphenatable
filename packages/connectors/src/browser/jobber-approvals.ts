// Jobber timesheet approval states, read off the web app by a Browser Use agent. The gap it covers: Jobber's
// Timesheets export has no approval column (exports/jobber-timesheets-csv.ts sets approved: null), so CHK-06
// cannot run on export-loaded companies. The agent returns ids, dates, times, hours and approved only; the
// output schema has no name field. Code does every conversion (local time -> UTC, hours -> seconds) and the
// completeness check (entry hours must add up to the total the page prints). Read-only: the task forbids
// clicking anything that changes data.
// ponytail: the agent still SEES names on screen. Fine for synthetic Company A; Company R needs the owner's OK.

import { zonedWallClock } from "../time.ts";
import type { SyncRun } from "../types.ts";
import { type BrowserUseCtx, runTask } from "./client.ts";

const MODEL = "claude-sonnet-5-5";
const MAX_COST_USD = 2;

export interface ApprovalFact {
  /** Jobber's time sheet entry id when the page exposes it (links, data attributes), else null. */
  entryId: string | null;
  jobberUserId: string | null;
  date: string;
  startAt: string | null;
  durationSec: number;
  approved: boolean;
}

const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });
const HHMM = { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" };

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reportTotalHours", "entries"],
  properties: {
    reportTotalHours: nullable({ type: "number" }),
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "entryId",
          "userId",
          "date",
          "start",
          "end",
          "hours",
          "approved",
        ],
        properties: {
          entryId: nullable({ type: "string" }),
          userId: nullable({ type: "string" }),
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          start: nullable(HHMM),
          end: nullable(HHMM),
          hours: { type: "number", minimum: 0 },
          approved: { type: "boolean" },
        },
      },
    },
  },
} as const;

export function task(from: string, to: string): string {
  return `You are reading a Jobber account (https://secure.getjobber.com) that is already logged in. READ ONLY: never click Approve, Edit, Delete, Save or anything else that changes data. Never type into forms except date filters.

Goal: every time sheet entry dated ${from} to ${to} (inclusive), with its approval state.
1. Open Insights, then Reports, then the Timesheets report. Set the date range to ${from} - ${to}. Note the report's total hours.
2. For approval states, use the Timesheets approval view (Approve Timesheets, or the timesheet pages per user and week) for the same dates.
3. For each entry return: entryId (the time sheet entry id from its link or data attribute, else null), userId (the Jobber user id from the user's link, else null), date (YYYY-MM-DD), start and end (24h HH:MM as shown, null if none), hours (decimal hours exactly as shown), approved (true or false).
Do NOT return names, notes, client names, addresses or pay. reportTotalHours is the total the report prints (null if it shows none). Return every entry in the range, including zero-hour ones; never estimate.`;
}

const hundredths = (h: number) => Math.round(h * 100);
const minutes = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Validates the agent's output and converts it. Every problem makes the SyncRun incomplete. */
export function parseApprovals(
  output: unknown,
  from: string,
  to: string,
  timezone: string,
): {
  facts: ApprovalFact[];
  reportTotalHours: number | null;
  problems: string[];
} {
  const problems: string[] = [];
  const o = output as {
    reportTotalHours?: unknown;
    entries?: unknown;
  } | null;
  if (!o || !Array.isArray(o.entries))
    return { facts: [], reportTotalHours: null, problems: ["no entries list"] };
  const total =
    typeof o.reportTotalHours === "number" ? o.reportTotalHours : null;
  const facts: ApprovalFact[] = [];
  const seen = new Set<string>();
  o.entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const str = (k: string) => (typeof e[k] === "string" ? e[k] : null);
    const date = str("date");
    const start = str("start");
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof e.hours !== "number" ||
      e.hours < 0 ||
      typeof e.approved !== "boolean" ||
      (start !== null && !/^\d{2}:\d{2}$/.test(start))
    ) {
      problems.push(`entry ${i}: unreadable`);
      return;
    }
    if (date < from || date > to) {
      problems.push(`entry ${i}: dated outside ${from}..${to}`);
      return;
    }
    const entryId = str("entryId");
    if (entryId !== null) {
      if (seen.has(entryId)) problems.push(`entry ${i}: duplicate entryId`);
      seen.add(entryId);
    }
    facts.push({
      entryId,
      jobberUserId: str("userId"),
      date,
      startAt:
        start === null
          ? null
          : new Date(
              zonedWallClock(date, minutes(start), timezone),
            ).toISOString(),
      durationSec: hundredths(e.hours) * 36,
      approved: e.approved,
    });
  });
  if (total === null) problems.push("the page showed no total hours");
  else {
    // Jobber rounds rows to 0.01 h and totals from exact seconds: up to 0.005 h of drift per row.
    const sum = facts.reduce((s, f) => s + f.durationSec / 36, 0);
    if (Math.abs(sum - hundredths(total)) > 0.5 * Math.max(facts.length, 1))
      problems.push(
        `entry hours ${(sum / 100).toFixed(2)} != report total ${total.toFixed(2)}`,
      );
  }
  return { facts, reportTotalHours: total, problems };
}

/** One browser run over the period. Never throws on a source failure: that is an incomplete SyncRun. */
export async function readJobberApprovals(
  ctx: BrowserUseCtx & {
    companyId: string;
    cycleId?: string | null;
    from: string;
    to: string;
    timezone: string;
  },
): Promise<{ facts: ApprovalFact[]; syncRun: SyncRun; runId: string | null }> {
  const startedAt = new Date().toISOString();
  let facts: ApprovalFact[] = [];
  let problems: string[];
  let runId: string | null = null;
  let method = `browser-use:${MODEL}`;
  try {
    const run = await runTask(ctx, task(ctx.from, ctx.to), OUTPUT_SCHEMA, {
      model: MODEL,
      maxCostUsd: MAX_COST_USD,
    });
    runId = run.runId;
    method += ` run ${run.runId} $${run.costUsd ?? "?"}`;
    if (run.status !== "completed")
      problems = [`run ${run.status}: ${run.error ?? "no error text"}`];
    else
      ({ facts, problems } = parseApprovals(
        run.output,
        ctx.from,
        ctx.to,
        ctx.timezone,
      ));
  } catch (e) {
    problems = [(e as Error).message];
  }
  return {
    facts,
    runId,
    syncRun: {
      id: `${ctx.companyId}:browser:timesheetApprovals:${startedAt}`,
      companyId: ctx.companyId,
      cycleId: ctx.cycleId ?? null,
      source: "browser",
      object: "timesheetApprovals",
      startedAt,
      finishedAt: new Date().toISOString(),
      pulled: facts.length,
      // The page's own total hours is the only independent count; when it reconciles, the rows are all there.
      expected: problems.length ? null : facts.length,
      complete: problems.length === 0,
      method,
      error: problems.length ? problems.join("; ") : null,
    },
  };
}

export interface ApprovalTarget {
  sourceId: string;
  workerId: string | null;
  startAt: string;
  durationSec: number;
  approved: boolean | null;
}

/**
 * Fills `approved` where it is unknown (null). Never overwrites a known value: a disagreement is a conflict
 * for a person to look at. Match: the Jobber entry id when both sides have it, else same worker and same
 * start minute, and the hours must agree to 0.01 h. Anything else is unmatched, never guessed.
 */
export function applyApprovals<T extends ApprovalTarget>(
  entries: T[],
  facts: ApprovalFact[],
  workerByJobberUser: ReadonlyMap<string, string>,
): {
  entries: T[];
  filled: string[];
  conflicts: { fact: ApprovalFact; sourceId: string; reason: string }[];
  unmatched: ApprovalFact[];
} {
  const out = entries.map((e) => ({ ...e }));
  const filled: string[] = [];
  const conflicts: { fact: ApprovalFact; sourceId: string; reason: string }[] =
    [];
  const unmatched: ApprovalFact[] = [];
  const used = new Set<string>();
  const minute = (iso: string) => iso.slice(0, 16);
  for (const f of facts) {
    let hits = f.entryId ? out.filter((e) => e.sourceId === f.entryId) : [];
    if (!hits.length) {
      const worker = f.jobberUserId
        ? workerByJobberUser.get(f.jobberUserId)
        : undefined;
      const at = f.startAt;
      hits =
        worker && at
          ? out.filter(
              (e) => e.workerId === worker && minute(e.startAt) === minute(at),
            )
          : [];
    }
    const e = hits[0];
    if (hits.length !== 1 || !e) {
      unmatched.push(f);
      continue;
    }
    const reason = used.has(e.sourceId)
      ? "two page rows match this entry"
      : Math.abs(e.durationSec - f.durationSec) > 36
        ? "hours differ"
        : e.approved !== null && e.approved !== f.approved
          ? "approval differs"
          : null;
    used.add(e.sourceId);
    if (reason) conflicts.push({ fact: f, sourceId: e.sourceId, reason });
    else if (e.approved === null) {
      e.approved = f.approved;
      filled.push(e.sourceId);
    }
  }
  return { entries: out, filled, conflicts, unmatched };
}
