// M4 backtest to the cent. The real metric is Company R (A-12, pending its paid export). Until then this
// reports a synthetic self-check: Stage 1 gross per worker on a synthetic company's past cycles vs what its
// pastPayrolls.json says was paid. Labelled synthetic; never presented as the Company R result.
import { computeStage1 } from "@payrollpilot/engine/payroll/stage1";
import type { Rule } from "@payrollpilot/engine/payroll/types";
import type { Fixtures } from "./lib/io";
import type { M4Summary } from "./m4-r";

export type Backtest = {
  company: string;
  synthetic: boolean;
  cycles: string[];
  workers: number;
  exact: number;
  maxDiffCents: number;
  diffs: {
    cycleId: string;
    workerId: string;
    engineCents: number;
    paidCents: number;
  }[];
};

export type M4 = {
  companyR: { status: "pending"; reason: string } | M4Summary;
  syntheticSelfCheck: Backtest | null;
};

export function backtest(fx: Fixtures): Backtest {
  const rules: Rule[] = fx.rules.map((r) => ({ ...r, status: "active" }));
  const closed = fx.cycles.filter((c) => c.stage === "closed");
  const out: Backtest = {
    company: fx.company.id,
    synthetic: fx.company.kind === "synthetic",
    cycles: closed.map((c) => c.id),
    workers: 0,
    exact: 0,
    maxDiffCents: 0,
    diffs: [],
  };
  for (const c of closed) {
    const r = computeStage1(
      c,
      fx.entries.filter((e) => e.cycleId === c.id),
      fx.workers,
      rules,
      { company: fx.company },
    );
    for (const p of fx.pastPayrolls.filter(
      (x) => x.cycleId === c.id && x.paidVia === "gusto_regular",
    )) {
      const engineCents = r.pay[p.workerId]?.grossCents ?? 0;
      out.workers++;
      const d = Math.abs(engineCents - p.grossCents);
      if (d === 0) out.exact++;
      else
        out.diffs.push({
          cycleId: c.id,
          workerId: p.workerId,
          engineCents,
          paidCents: p.grossCents,
        });
      out.maxDiffCents = Math.max(out.maxDiffCents, d);
    }
  }
  return out;
}

/** `companyR` is the counts-only summary m4-r-run.ts writes to data/private/r/m4/summary.json, if any. */
export function m4(
  synthetic: Fixtures | null,
  companyR: M4Summary | null = null,
): M4 {
  return {
    companyR: companyR ?? {
      status: "pending",
      reason: "Company R paid export not ingested yet (A-12)",
    },
    syntheticSelfCheck: synthetic ? backtest(synthetic) : null,
  };
}
