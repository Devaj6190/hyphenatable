// M5 completeness: the share of SyncRuns with complete = true, and every blocked object listed.
import type { Ratio, SyncRun } from "./lib/types";
import { ratio } from "./lib/types";

export type M5 = {
  runs: Ratio;
  blocked: {
    id: string;
    cycleId: string | null;
    source: string;
    object: string;
    pulled: number;
    expected: number | null;
    error: string | null;
  }[];
};

export function m5(runs: SyncRun[], cycleIds?: string[]): M5 {
  const rs = cycleIds
    ? runs.filter((r) => r.cycleId !== null && cycleIds.includes(r.cycleId))
    : runs;
  return {
    runs: ratio(rs.filter((r) => r.complete).length, rs.length),
    blocked: rs
      .filter((r) => !r.complete)
      .map(({ id, cycleId, source, object, pulled, expected, error }) => ({
        id,
        cycleId,
        source,
        object,
        pulled,
        expected,
        error: error ?? null,
      })),
  };
}
