import type { Flag, Rule } from "../schemas";
import { cycleEntries, day, entryFlag, hours } from "./flag";
import type { Check, CheckInput } from "./types";

/** CHK-03 long_shift: one entry strictly longer than the company's long-shift limit. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const limit = input.company.settings.longShiftHours;
  return cycleEntries(input)
    .filter((e) => e.durationSec > limit * 3600)
    .map((e) =>
      entryFlag(
        input,
        "CHK-03",
        "manager",
        [e],
        `Entry ${e.id} for ${e.workerId} on ${day(input, e.startAt)} is ${hours(e.durationSec)}, over the ${limit} h limit.`,
      ),
    );
}

export default { id: "CHK-03", run } satisfies Check;
