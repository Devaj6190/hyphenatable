import type { Flag, Rule } from "../schemas";
import {
  activeRules,
  cycleEntries,
  cycleExpenses,
  inPeriod,
  recordFlag,
} from "./flag";
import { rulePrecedent } from "./precedent";
import type { Check, CheckInput } from "./types";

// ponytail: sub-jobs only. An expense whose description carries the prefix but has no job is
// already CHK-14 (job cost) or CHK-17 (kind unknown); add it here if a rule ever targets expenses.
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const links = activeRules(input, "disposal_parent_link").filter(
    (r) => typeof r.params.titlePrefix === "string" && r.params.titlePrefix,
  );
  if (!links.length) return [];
  const jobs = input.jobs.filter((j) => j.companyId === input.company.id);
  const expenses = cycleExpenses(input);
  const labored = new Set(cycleEntries(input).map((e) => e.jobId));
  const flags: Flag[] = [];
  for (const job of jobs) {
    if (job.parentJobId !== null) continue;
    const link = links.find((r) =>
      job.title.startsWith(r.params.titlePrefix as string),
    );
    if (!link) continue;
    const xs = expenses.filter((x) => x.matchedJobId === job.id);
    if (!inPeriod(input, job.startAt) && !labored.has(job.id) && !xs.length)
      continue;
    const prefix = link.params.titlePrefix as string;
    const suffix = ` - ${job.title.slice(prefix.length)}`;
    const parents = jobs
      .filter(
        (j) =>
          j.id !== job.id &&
          !j.title.startsWith(prefix) &&
          j.title.endsWith(suffix),
      )
      .map((j) => j.id)
      .sort();
    flags.push(
      recordFlag(
        input,
        "CHK-16",
        "manager",
        job.id,
        { jobId: job.id, expenseIds: xs.map((x) => x.id) },
        `Job ${job.id} is a disposal sub-job (rule ${link.id}) with no parent job` +
          (parents.length ? `; possible parent ${parents.join(" or ")}.` : "."),
        [{ system: "jobber", recordId: job.sourceId, url: null }],
        {
          confidence: link.confidence,
          dollarsCents: xs.every((x) => x.amountCents !== null)
            ? xs.reduce((s, x) => s + (x.amountCents as number), 0) || null
            : null,
          precedent: rulePrecedent(link),
        },
      ),
    );
  }
  return flags;
}
export default { id: "CHK-16", run } satisfies Check;
