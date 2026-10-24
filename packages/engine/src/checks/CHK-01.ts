import type { Flag, Rule } from "../schemas";
import { cycleEntries, day, entryFlag, hours } from "./flag";
import type { Check, CheckInput } from "./types";

/** Categories that legitimately carry no job. Compared trimmed and case-insensitively. */
const NO_JOB_OK = new Set(["BREAK", "OFFICE", "DRIVING"]);

/** CHK-01 hours_no_job: an entry with no job, no visit, and a category that needs one. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  return cycleEntries(input)
    .filter(
      (e) =>
        e.jobId === null &&
        e.visitId === null &&
        !NO_JOB_OK.has(e.category.trim().toUpperCase()),
    )
    .map((e) =>
      entryFlag(
        input,
        "CHK-01",
        "manager",
        [e],
        `Entry ${e.id} for ${e.workerId} on ${day(input, e.startAt)} (${hours(e.durationSec)}) has no job or visit.`,
      ),
    );
}

export default { id: "CHK-01", run } satisfies Check;
