import { parseOvertimePolicy } from "../payroll/overtime";
import { computeStage1 } from "../payroll/stage1";
import type { Cycle, Flag, PastPayroll, Rule } from "../schemas";
import { cycleEntries } from "./flag";
import type { Check, CheckInput } from "./types";
import { companyWorkers, workerFlag } from "./worker";

/** How many past cycles the mean covers. */
export const PAST_CYCLES = 3;

/**
 * `pastCycles.gross` for a cycle: per worker, regular + Venmo gross (off-cycle is Stage 2) of the
 * last 3 earlier cycles that have any payroll row, oldest first. A worker with no row in such a
 * cycle was paid 0 there; a cycle with no rows at all is unknown and skipped, never counted as 0.
 */
export function pastGross(
  cycle: Pick<Cycle, "companyId" | "number">,
  cycles: Pick<Cycle, "id" | "companyId" | "number">[],
  payrolls: Pick<
    PastPayroll,
    "companyId" | "cycleId" | "workerId" | "paidVia" | "grossCents"
  >[],
): Record<string, number[]> {
  const rows = payrolls.filter(
    (p) => p.companyId === cycle.companyId && p.paidVia !== "gusto_off_cycle",
  );
  const known = new Set(rows.map((p) => p.cycleId));
  const past = cycles
    .filter(
      (c) =>
        c.companyId === cycle.companyId &&
        c.number < cycle.number &&
        known.has(c.id),
    )
    .sort((a, b) => a.number - b.number)
    .slice(-PAST_CYCLES)
    .map((c) => c.id);
  const gross: Record<string, number[]> = {};
  for (const p of rows) {
    const i = past.indexOf(p.cycleId);
    if (i < 0) continue;
    gross[p.workerId] ??= past.map(() => 0);
    gross[p.workerId][i] += p.grossCents;
  }
  return gross;
}

/** Stage 1 gross differs from the mean of the last 3 cycles by more than `settings.grossChangePct`. */
export function run(input: CheckInput, rules: Rule[]): Flag[] {
  const workers = companyWorkers(input);
  const own = rules.filter((r) => r.companyId === input.company.id);
  const { pay } = computeStage1(
    input.cycle,
    cycleEntries(input),
    workers,
    own,
    {
      company: input.company,
      expenses: input.expenses.filter((x) => x.companyId === input.company.id),
    },
  );
  const otKnown = parseOvertimePolicy(own).ok;
  const pct = input.company.settings.grossChangePct;
  return workers.flatMap((w) => {
    const history = (input.pastCycles.gross[w.id] ?? []).slice(-PAST_CYCLES);
    if (!history.length) return [];
    const sum = history.reduce((s, g) => s + g, 0);
    // ponytail: a zero history mean has no percent change; such a worker is CHK-07/08 territory.
    if (sum <= 0) return [];
    const excluded = pay[w.id]?.excluded ?? false;
    // No usable overtime policy excludes every hourly worker with hours: one company-wide gap,
    // not a pay change per worker, so their gross is unknown here rather than 0.
    if (excluded && !otKnown && w.payType === "hourly") return [];
    // Otherwise the draft pays an excluded worker nothing, so their draft gross is 0.
    const gross = pay[w.id] && !excluded ? pay[w.id].grossCents : 0;
    // |gross - sum/n| * 100 > pct * sum/n, kept in integers.
    const diff = Math.abs(gross * history.length - sum);
    if (diff * 100 <= pct * sum) return [];
    const change = Math.round((diff * 100) / sum);
    return [
      workerFlag(
        input,
        w,
        "CHK-22",
        "owner",
        `Worker ${w.id}'s draft gross is ${change}% ${gross * history.length > sum ? "above" : "below"} the mean of their last ${history.length} cycles (limit ${pct}%)${excluded ? "; the draft excludes them" : ""}.`,
      ),
    ];
  });
}
export default { id: "CHK-22", run } satisfies Check;
