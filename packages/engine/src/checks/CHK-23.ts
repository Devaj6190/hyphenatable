import type { Flag, Rule } from "../schemas";
import type { Check, CheckInput } from "./types";

export function run(input: CheckInput, _rules: Rule[]): Flag[] {
  const runs = new Map(
    (input.syncRuns ?? [])
      .filter(
        (r) =>
          r.companyId === input.company.id &&
          r.cycleId === input.cycle.id &&
          r.complete === false,
      )
      .map((r) => [r.id, r]),
  );
  return [...runs.values()].map((r) => ({
    id: `CHK-23:${input.cycle.id}:${r.id}`,
    companyId: input.company.id,
    cycleId: input.cycle.id,
    checkId: "CHK-23",
    status: "open",
    subject: { workerId: null, jobId: null, entryIds: [], expenseIds: [] },
    seen: `Sync ${r.id} for ${r.source}/${r.object} is incomplete: pulled ${r.pulled}, expected ${r.expected ?? "unknown"}.`,
    where: [{ system: r.source, recordId: r.id, url: null }],
    confidence: "certain",
    precedent: null,
    routeTo: "owner",
    affects: { workerId: null, jobId: null, dollarsCents: null },
    questionId: null,
    correctionId: null,
  }));
}
export default { id: "CHK-23", run } satisfies Check;
