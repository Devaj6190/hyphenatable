// A flag's sentence (`seen`) is written by the pure engine with record ids. People read it on the dashboard, so the
// ids become words here: "Job 15", "the 7:00am entry", "the Home Depot purchase on Mon Oct 12", a worker's name.
// "Job <id>" becomes "Job 15", not "Job Job 15". Ids this can't place stay as they are. A manager also gets the dollar
// amounts taken out (spec 8).
import { friendlyDate } from "@payrollpilot/engine/messages/templates";
import { clock } from "@payrollpilot/engine/questions/questions";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const RECORD_ID = /\b[a-zA-Z0-9]{32}\b/g;
const DOLLARS = /\s?\(?-?\$[\d,]+(?:\.\d+)?\)?/g;

const day = (date: string) => friendlyDate(`${date}T12:00:00Z`, "UTC");

/** The record's words, and the noun the engine writes in front of its id ("Job", "Entry"), which the words replace. */
type Label = { words: string; noun: string };

async function jobNumber(ctx: QueryCtx, jobId: Id<"jobs"> | null) {
  const job = jobId && (await ctx.db.get(jobId));
  return job ? `Job ${job.jobNumber}` : null;
}

const TABLES = [
  "workers",
  "jobs",
  "timeEntries",
  "visits",
  "expenses",
  "quotes",
  "invoices",
  "cycles",
  "rules",
  "payments",
  "pastPayrolls",
] as const;

async function label(
  ctx: QueryCtx,
  raw: string,
  timezone: string,
): Promise<Label | null> {
  const table = TABLES.find((t) => ctx.db.normalizeId(t, raw));
  if (!table) return null;
  const doc = await ctx.db.get(raw as Id<typeof table>);
  if (!doc) return null;
  const named = (words: string, noun: string) => ({ words, noun });
  switch (table) {
    case "workers":
      return named((doc as Doc<"workers">).displayName, "worker");
    case "jobs":
      return named(`Job ${(doc as Doc<"jobs">).jobNumber}`, "job");
    case "timeEntries":
      return named(
        `the ${clock((doc as Doc<"timeEntries">).startAt, timezone)} entry`,
        "entry|entries",
      );
    case "visits":
      return named(
        `the ${friendlyDate((doc as Doc<"visits">).startAt, timezone)} visit`,
        "visit",
      );
    case "expenses": {
      const x = doc as Doc<"expenses">;
      return named(
        `the ${x.vendor ?? "unnamed"} purchase on ${day(x.date)}`,
        "expenses?",
      );
    }
    case "quotes":
    case "invoices": {
      const job = await jobNumber(ctx, (doc as Doc<"quotes">).jobId);
      const noun = table === "quotes" ? "quote" : "invoice";
      return named(job ? `the ${noun} on ${job}` : `the ${noun}`, noun);
    }
    case "cycles":
      return named(`cycle ${(doc as Doc<"cycles">).number}`, "cycle");
    case "rules":
      return named(
        `"${(doc as Doc<"rules">).type.replace(/_/g, " ")}"`,
        "rule",
      );
    case "payments":
      return named("a payment", "payment");
    case "pastPayrolls":
      return named("a past payroll", "payroll");
  }
}

/** `seen` in words for this viewer. */
export async function readableSeen(
  ctx: QueryCtx,
  seen: string,
  timezone: string,
  hideMoney: boolean,
): Promise<string> {
  const ids = [...new Set(seen.match(RECORD_ID) ?? [])];
  const labels = await Promise.all(ids.map((id) => label(ctx, id, timezone)));
  let out = seen;
  ids.forEach((id, i) => {
    const l = labels[i];
    if (!l) return;
    out = out.replace(
      new RegExp(`\\b(?:(?:${l.noun}) )?${id}`, "gi"),
      (m, at: number) => {
        // "unmatched job-cost expense <id>" → "unmatched job-cost Cedar Creek purchase…", not "…job-cost the Cedar…".
        const words =
          l.noun === "expenses?" && m !== id && at > 0
            ? l.words.replace(/^the /, "")
            : l.words;
        return /^[A-Z]/.test(m)
          ? words[0].toUpperCase() + words.slice(1)
          : words;
      },
    );
  });
  if (hideMoney) out = out.replace(DOLLARS, "");
  return out.replace(/\s{2,}/g, " ");
}
