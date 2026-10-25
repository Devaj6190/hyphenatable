// bun run m2-freeze.ts --rules <proposed-rules.json>
// Freezes the onboarding agent's proposed rules BEFORE the runbook key is unsealed: validates them, writes
// out/m2-freeze.json = { sha256, count, frozenAt } and prints the hash. m2-grade refuses a rules file whose
// sha256 differs, so answers cannot change after unsealing.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * One proposed rule, in either shape onboarding produces:
 *  - a Proposal (packages/engine/src/lessons/history.ts): { type, params, statement, evidence, seenInCycles,
 *    ofCycles, confidence }, no id: it gets `proposal-<n>` by its position in the file;
 *  - a Rule row (section 6 / Convex `rules`): { id or _id, type, params, provenance.evidence, backtest, confidence }.
 * Evidence ids are required. The statement is kept for the private detail only; it is never sent to a model.
 */
const RawProposed = z
  .object({
    id: z.string().min(1).optional(),
    _id: z.string().min(1).optional(),
    type: z.string().min(1),
    params: z.record(z.string(), z.unknown()),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().min(1)).optional(),
    provenance: z
      .object({ evidence: z.array(z.string().min(1)) })
      .passthrough()
      .optional(),
    statement: z.string().optional(),
  })
  .passthrough();

export type ProposedRule = {
  id: string;
  type: string;
  params: Record<string, unknown>;
  confidence: number;
  evidence: string[];
  shape: "proposal" | "rule";
};

export const ProposedRules = z
  .array(RawProposed)
  .transform((rs, ctx): ProposedRule[] => {
    const out = rs.map((r, i) => ({
      id: r.id ?? r._id ?? `proposal-${i + 1}`,
      type: r.type,
      params: r.params,
      confidence: r.confidence,
      evidence: r.evidence ?? r.provenance?.evidence ?? [],
      shape: (r.provenance ? "rule" : "proposal") as ProposedRule["shape"],
    }));
    for (const r of out)
      if (!r.evidence.length)
        ctx.addIssue({
          code: "custom",
          message: `rule ${r.id}: no evidence ids`,
        });
    if (new Set(out.map((r) => r.id)).size !== out.length)
      ctx.addIssue({ code: "custom", message: "duplicate rule ids" });
    return out;
  });

export const Freeze = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  count: z.number().int(),
  frozenAt: z.iso.datetime(),
});
export type Freeze = z.infer<typeof Freeze>;

export const sha256 = (b: Buffer) =>
  createHash("sha256").update(b).digest("hex");
export const FREEZE_PATH = join(import.meta.dirname, "out/m2-freeze.json");

export function freeze(rulesBytes: Buffer, now: Date): Freeze {
  const rules = ProposedRules.parse(JSON.parse(rulesBytes.toString("utf8")));
  return {
    sha256: sha256(rulesBytes),
    count: rules.length,
    frozenAt: now.toISOString(),
  };
}

if (import.meta.main) {
  const i = process.argv.indexOf("--rules");
  if (i < 0 || !process.argv[i + 1]) {
    console.error("usage: m2-freeze.ts --rules <proposed-rules.json>");
    process.exit(2);
  }
  const f = freeze(readFileSync(process.argv[i + 1]), new Date());
  mkdirSync(join(import.meta.dirname, "out"), { recursive: true });
  writeFileSync(FREEZE_PATH, `${JSON.stringify(f, null, 2)}\n`);
  console.log(`frozen ${f.count} proposed rules, sha256 ${f.sha256}`);
}
