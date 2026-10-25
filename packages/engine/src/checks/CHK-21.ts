import { jobProfit } from "../payroll/profit";
import type { Flag, Rule } from "../schemas";
import { reconcileCycle, recordFlag } from "./flag";
import type { Check, CheckInput } from "./types";

/** Job margin below `settings.lowMarginPct`. The math is certain; the listed reasons are hints. */
export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const recon = reconcileCycle(input);
  const jobs = input.jobs.filter((j) => j.companyId === input.company.id);
  return recon.jobs.flatMap((r) => {
    const job = jobs.find((j) => j.id === r.jobId);
    const p = jobProfit(r, {
      job,
      jobs,
      expenses: input.expenses.filter((x) => x.companyId === input.company.id),
      rules: input.rules.filter((x) => x.companyId === input.company.id),
      recon,
      lowMarginPct: input.company.settings.lowMarginPct,
      timeZone: input.company.timezone,
    });
    if (!p.low) return [];
    // ponytail: hints keep ids and drop the rates after ":", so no pay amount reaches the sentence.
    const hints = p.hints.map((h) => h.replace(/: .*$/, ""));
    return [
      recordFlag(
        input,
        "CHK-21",
        "owner",
        r.jobId,
        { jobId: r.jobId },
        `Job ${r.jobId} has a ${p.marginPct}% margin, below the ${input.company.settings.lowMarginPct}% threshold` +
          (hints.length ? `; possible reasons: ${hints.join("; ")}.` : "."),
        [
          {
            system: "jobber",
            recordId: job?.sourceId ?? r.jobId,
            url: null,
          },
        ],
      ),
    ];
  });
}
export default { id: "CHK-21", run } satisfies Check;
