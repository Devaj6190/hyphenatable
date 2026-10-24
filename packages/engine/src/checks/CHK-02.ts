import type { Flag, Rule } from "../schemas";
import { cycleEntries, day, entryFlag, hours } from "./flag";
import type { Check, CheckInput } from "./types";

/** CHK-02 open_timer: the entry was still ticking when it was synced at cutoff. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  return cycleEntries(input)
    .filter((e) => e.ticking === true)
    .map((e) =>
      entryFlag(
        input,
        "CHK-02",
        "manager",
        [e],
        `Entry ${e.id} for ${e.workerId} started on ${day(input, e.startAt)} is still running at cutoff (${hours(e.durationSec)} so far).`,
      ),
    );
}

export default { id: "CHK-02", run } satisfies Check;
