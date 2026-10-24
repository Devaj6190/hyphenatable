import type { Flag, Rule, TimeEntry } from "../schemas";
import { cmp, cycleEntries, day, entryFlag, groupBy } from "./flag";
import type { Check, CheckInput } from "./types";

/** Overlap up to this many ms is clock noise between two timers, not an error. */
const TOLERANCE_MS = 60_000;

const span = (e: TimeEntry): [number, number] => {
  const start = Date.parse(e.startAt);
  return [start, e.endAt ? Date.parse(e.endAt) : start + e.durationSec * 1000];
};

/** CHK-04 overlap: two entries of one worker whose intervals intersect by more than 60 s. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const byWorker = groupBy(cycleEntries(input), (e) => e.workerId);
  const flags: Flag[] = [];
  for (const entries of byWorker.values()) {
    const sorted = entries.sort((a, b) => cmp(a.id, b.id));
    // ponytail: O(n²) per worker; a week of one worker's entries is tens, not thousands.
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const [a, b] = [sorted[i], sorted[j]];
        const [aStart, aEnd] = span(a);
        const [bStart, bEnd] = span(b);
        const from = Math.max(aStart, bStart);
        const overlap = Math.min(aEnd, bEnd) - from;
        if (overlap <= TOLERANCE_MS) continue;
        flags.push(
          entryFlag(
            input,
            "CHK-04",
            "manager",
            [a, b],
            `Entries ${a.id} and ${b.id} for ${a.workerId} on ${day(input, from)} overlap by ${Math.round(overlap / 60_000)} min.`,
          ),
        );
      }
    }
  }
  return flags;
}

export default { id: "CHK-04", run } satisfies Check;
