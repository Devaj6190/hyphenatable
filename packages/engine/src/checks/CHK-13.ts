import type { Flag, Rule } from "../schemas";
import { cycleEntries, day, groupBy, inPeriod, recordFlag } from "./flag";
import type { Check, CheckInput } from "./types";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const entries = cycleEntries(input);
  const visits = [
    ...new Map(
      input.visits
        .filter((v) => v.companyId === input.company.id)
        .map((v) => [v.id, v]),
    ).values(),
  ];
  const visitJob = new Map(visits.map((v) => [v.id, v.jobId]));
  const labored = new Set(
    entries.flatMap((e) => [
      e.jobId,
      e.visitId ? visitJob.get(e.visitId) : undefined,
    ]),
  );
  const done = visits.filter(
    (v) => v.isComplete && inPeriod(input, v.startAt) && !labored.has(v.jobId),
  );
  return [...groupBy(done, (v) => v.jobId)].map(([jobId, vs]) => {
    // Context, not the condition: the assigned crew's entries that day, logged elsewhere.
    const candidates = entries.filter((e) =>
      vs.some(
        (v) =>
          v.assignedWorkerIds.includes(e.workerId) &&
          day(input, e.startAt) === day(input, v.startAt),
      ),
    );
    const ids = vs.map((v) => v.id).sort();
    return recordFlag(
      input,
      "CHK-13",
      "manager",
      jobId,
      { jobId, entryIds: candidates.map((e) => e.id) },
      `Job ${jobId} has completed visit ${ids.join(", ")} in this cycle but no time entries` +
        (candidates.length
          ? `; the assigned crew logged ${candidates
              .map((e) => e.id)
              .sort()
              .join(", ")} that day to other jobs.`
          : "."),
      vs.map((v) => ({ system: "jobber", recordId: v.sourceId, url: null })),
    );
  });
}
export default { id: "CHK-13", run } satisfies Check;
