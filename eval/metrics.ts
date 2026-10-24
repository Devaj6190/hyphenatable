// Pure assembly of results.json from loaded data. run.ts does the IO.
import type { Fixtures } from "./lib/io";
import type { FlagLike } from "./lib/types";
import { m1 } from "./m1-planted";
import type { M2 } from "./m2-rules";
import { m3 } from "./m3-questions";
import { m4 } from "./m4-backtest";
import type { M4Summary } from "./m4-r";
import { m5 } from "./m5-completeness";
import { m6 } from "./m6-traceability";
import { Results } from "./schema";

export function buildResults(args: {
  fx: Fixtures;
  cycleId: string;
  flags: FlagLike[];
  flagsSource: string;
  m2: M2;
  syntheticBacktest: Fixtures | null;
  /** Counts-only Company R summary from m4-r-run.ts, when it has been run. */
  companyR?: M4Summary | null;
  generatedAt: string;
  gitSha: string | null;
}): Results {
  const { fx, cycleId } = args;
  const current = fx.cycles
    .filter((c) => c.stage !== "closed")
    .sort((a, b) => a.number - b.number)
    .map((c) => c.id);
  const first = current[0];
  const key = fx.answerKey.filter((k) => (k.cycleId ?? first) === cycleId);
  const flags = args.flags.filter((f) => f.cycleId === cycleId);
  return Results.parse({
    generatedAt: args.generatedAt,
    gitSha: args.gitSha,
    company: fx.company.id,
    cycle: cycleId,
    flagsSource: args.flagsSource,
    synthetic: fx.company.kind === "synthetic",
    m1: m1(flags, key),
    m2: args.m2,
    m3: m3(fx.cycles, fx.questions, fx.answerKey, current),
    m4: m4(args.syntheticBacktest, args.companyR ?? null),
    m5: m5(fx.syncRuns),
    m6: m6(flags),
  });
}
