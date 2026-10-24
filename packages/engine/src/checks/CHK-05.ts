import type { Flag, Rule } from "../schemas";
import { cycleEntries, day, entryFlag, groupBy, hours } from "./flag";
import type { Check, CheckInput } from "./types";

/**
 * CHK-05 zero_or_duplicate: an entry of 0 s, or one worker's entries sharing job, start and
 * duration. A duplicate group gets one flag with all its ids. Members share a duration, so a
 * group of 0 s entries is reported once, as the group, and never again per entry.
 */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const groups = groupBy(cycleEntries(input), (e) =>
    // Start is compared as an instant, so "…:00Z" and "…:00.000Z" are the same start.
    JSON.stringify([e.workerId, e.jobId, Date.parse(e.startAt), e.durationSec]),
  );
  const flags: Flag[] = [];
  for (const group of groups.values()) {
    const [e] = group;
    const when = `for ${e.workerId} on ${day(input, e.startAt)}`;
    if (group.length > 1) {
      const ids = group.map((g) => g.id).sort();
      flags.push(
        entryFlag(
          input,
          "CHK-05",
          "manager",
          group,
          `Entries ${ids.join(", ")} ${when} have the same job, start and duration (${hours(e.durationSec)} each).`,
        ),
      );
    } else if (e.durationSec === 0) {
      flags.push(
        entryFlag(
          input,
          "CHK-05",
          "manager",
          group,
          `Entry ${e.id} ${when} has a duration of 0 h.`,
        ),
      );
    }
  }
  return flags;
}

export default { id: "CHK-05", run } satisfies Check;
