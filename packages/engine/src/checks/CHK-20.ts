import type { Flag, Rule } from "../schemas";
import { activeRules, inPeriod, norm, recordFlag } from "./flag";
import { rulePrecedent } from "./precedent";
import type { Check, CheckInput } from "./types";

/** A quote sent this cycle whose salesperson differs from the in_person_quoter rule for its job. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const quoters = activeRules(input, "in_person_quoter").filter(
    (r) =>
      typeof r.params.titleKeyword === "string" &&
      norm(r.params.titleKeyword) &&
      typeof r.params.workerId === "string",
  );
  if (!quoters.length) return [];
  const jobs = new Map(
    input.jobs
      .filter((j) => j.companyId === input.company.id)
      .map((j) => [j.id, j]),
  );
  const quotes = [
    ...new Map(
      input.quotes
        .filter((q) => q.companyId === input.company.id)
        .map((q) => [q.id, q]),
    ).values(),
  ];
  return quotes.flatMap((q) => {
    const job = q.jobId ? jobs.get(q.jobId) : undefined;
    if (!job || !inPeriod(input, q.sentAt)) return [];
    const rule = quoters.find((r) =>
      norm(job.title).includes(norm(r.params.titleKeyword as string)),
    );
    if (!rule || q.salespersonWorkerId === rule.params.workerId) return [];
    return [
      recordFlag(
        input,
        "CHK-20",
        "owner",
        q.id,
        { workerId: q.salespersonWorkerId, jobId: job.id },
        `Quote ${q.id} on job ${job.id} lists ${q.salespersonWorkerId ?? "no salesperson"}; rule ${rule.id} says ${rule.params.workerId} quotes these in person.`,
        [{ system: "jobber", recordId: q.sourceId, url: null }],
        { confidence: rule.confidence, precedent: rulePrecedent(rule) },
      ),
    ];
  });
}
export default { id: "CHK-20", run } satisfies Check;
