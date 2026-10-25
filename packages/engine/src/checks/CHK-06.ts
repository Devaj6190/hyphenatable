import type { Flag, Rule } from "../schemas";
import { cycleEntries, entryFlag, groupBy } from "./flag";
import type { Check, CheckInput } from "./types";

/** CHK-06 unapproved_at_cutoff: one flag per worker, since the owner approves in bulk. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const byWorker = groupBy(
    cycleEntries(input).filter((e) => e.approved === false),
    (e) => e.workerId,
  );
  return [...byWorker].map(([workerId, entries]) => {
    const ids = entries.map((e) => e.id).sort();
    return entryFlag(
      input,
      "CHK-06",
      "owner",
      entries,
      `${ids.length} ${ids.length === 1 ? "entry" : "entries"} for ${workerId} not approved at cutoff: ${ids.join(", ")}.`,
    );
  });
}

export default { id: "CHK-06", run } satisfies Check;
