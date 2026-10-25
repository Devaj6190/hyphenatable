// M2 matching: each runbook key rule vs the frozen proposed rules. Deterministic first (same rule type, the key's
// params equal within a per-type tolerance); then, for ruleType "other" or a key rule with no same-type proposal,
// an optional judge over the proposals still unused. Without a judge those are "needs_human_review".
// Pure apart from the injected judge.
import { z } from "zod";
import type { ProposedRule } from "./m2-freeze";

export const KeyRule = z.object({
  id: z.string().regex(/^[A-Za-z0-9:_.-]{1,40}$/),
  ruleType: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  statement: z.string(),
  scope: z.string(),
  sourceSection: z.string(),
});
export type KeyRule = z.infer<typeof KeyRule>;
export const RunbookKey = z.array(KeyRule);

export type Verdict =
  | "match"
  | "differs"
  | "not_learned"
  | "needs_human_review";
export type Graded = {
  keyId: string;
  ruleType: string;
  verdict: Verdict;
  proposedId: string | null;
  differingParams: string[];
  by: "deterministic" | "judge" | "none";
};
export type GradeResult = {
  rules: Graded[];
  extraProposedIds: string[];
  counts: {
    total: number;
    match: number;
    differs: number;
    notLearned: number;
    needsReview: number;
    extra: number;
  };
};

/** What a judge sees: rule types and params only. The key's statement (free text) is never sent to a model. */
export type JudgeInput = {
  key: {
    id: string;
    ruleType: string;
    params: Record<string, unknown>;
    scope: string;
    sourceSection: string;
  };
  candidates: {
    id: string;
    type: string;
    params: Record<string, unknown>;
    confidence: number;
  }[];
};
export const JudgeOutput = z.object({
  verdict: z.enum(["match", "differs", "not_learned"]),
  proposedId: z.string().nullable(),
  differingParams: z.array(z.string()),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;
export type Judge = (input: JudgeInput) => Promise<JudgeOutput>;

/** Absolute tolerance for numeric params, per rule type and param; default exact (1e-9). */
export const TOLERANCE: Record<string, Record<string, number>> = {
  overtime_policy: { weeklyHours: 0, dailyHours: 0, multiplier: 0.001 },
  long_shift_threshold: { hours: 0.25 },
  commission_plan: { pctOfJobTotal: 0.01, pctOfJobProfit: 0.01 },
  manager_split: { pctOfJobProfit: 0.01 },
  catch_all_threshold: { amountCents: 0 },
};

const norm = (v: unknown): unknown =>
  typeof v === "string" ? v.trim().toLowerCase() : v;

export function sameParam(
  type: string,
  name: string,
  a: unknown,
  b: unknown,
): boolean {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= (TOLERANCE[type]?.[name] ?? 1e-9);
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length && a.every((x, i) => sameParam(type, name, x, b[i]))
    );
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    return (
      ka.join() === kb.join() &&
      ka.every((k) =>
        sameParam(
          type,
          `${name}.${k}`,
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
      )
    );
  }
  return norm(a) === norm(b);
}

/** The key's params the proposal gets wrong or leaves out (extra proposal params are not penalized). */
export function differing(key: KeyRule, p: ProposedRule): string[] {
  return Object.keys(key.params)
    .sort()
    .filter(
      (k) =>
        !(k in p.params) ||
        !sameParam(key.ruleType, k, key.params[k], p.params[k]),
    );
}

export async function gradeRules(
  key: KeyRule[],
  proposed: ProposedRule[],
  judge?: Judge,
): Promise<GradeResult> {
  const used = new Set<string>();
  const out = new Map<string, Graded>();
  const pending: KeyRule[] = [];
  // Pass 1: exact matches, so a perfect pair is never taken by a near miss.
  for (const k of key) {
    if (k.ruleType === "other") continue;
    const p = proposed.find(
      (x) =>
        !used.has(x.id) &&
        x.type === k.ruleType &&
        differing(k, x).length === 0,
    );
    if (p) {
      used.add(p.id);
      out.set(k.id, {
        keyId: k.id,
        ruleType: k.ruleType,
        verdict: "match",
        proposedId: p.id,
        differingParams: [],
        by: "deterministic",
      });
    }
  }
  // Pass 2: same type, closest proposal → differs (with the params).
  for (const k of key) {
    if (out.has(k.id)) continue;
    const same = proposed.filter(
      (x) => !used.has(x.id) && x.type === k.ruleType && k.ruleType !== "other",
    );
    if (!same.length) {
      pending.push(k);
      continue;
    }
    const best = same
      .map((x) => ({ x, d: differing(k, x) }))
      .sort(
        (a, b) => a.d.length - b.d.length || a.x.id.localeCompare(b.x.id),
      )[0];
    used.add(best.x.id);
    out.set(k.id, {
      keyId: k.id,
      ruleType: k.ruleType,
      verdict: "differs",
      proposedId: best.x.id,
      differingParams: best.d,
      by: "deterministic",
    });
  }
  // Pass 3: "other" or no same-type proposal → judge over unused proposals, else human review / not learned.
  for (const k of pending) {
    const candidates = proposed.filter((x) => !used.has(x.id));
    if (!candidates.length) {
      out.set(k.id, {
        keyId: k.id,
        ruleType: k.ruleType,
        verdict: "not_learned",
        proposedId: null,
        differingParams: [],
        by: "none",
      });
      continue;
    }
    if (!judge) {
      out.set(k.id, {
        keyId: k.id,
        ruleType: k.ruleType,
        verdict: "needs_human_review",
        proposedId: null,
        differingParams: [],
        by: "none",
      });
      continue;
    }
    let j: JudgeOutput | null = null;
    try {
      j = await judge({
        key: {
          id: k.id,
          ruleType: k.ruleType,
          params: k.params,
          scope: k.scope,
          sourceSection: k.sourceSection,
        },
        candidates: candidates.map((x) => ({
          id: x.id,
          type: x.type,
          params: x.params,
          confidence: x.confidence,
        })),
      });
    } catch {
      // the input failed the model-input scrub (e.g. a name-like key), or the call failed: a person decides
      j = null;
    }
    const pid = !j || j.verdict === "not_learned" ? null : j.proposedId;
    if (
      !j ||
      (j.verdict !== "not_learned" &&
        (!pid || !candidates.some((x) => x.id === pid)))
    ) {
      out.set(k.id, {
        keyId: k.id,
        ruleType: k.ruleType,
        verdict: "needs_human_review",
        proposedId: null,
        differingParams: [],
        by: "judge",
      });
      continue;
    }
    if (pid) used.add(pid);
    out.set(k.id, {
      keyId: k.id,
      ruleType: k.ruleType,
      verdict: j.verdict,
      proposedId: pid,
      differingParams: j.differingParams,
      by: "judge",
    });
  }
  const rules = key.map((k) => out.get(k.id) as Graded);
  const n = (v: Verdict) => rules.filter((r) => r.verdict === v).length;
  const extraProposedIds = proposed
    .filter((x) => !used.has(x.id))
    .map((x) => x.id);
  return {
    rules,
    extraProposedIds,
    counts: {
      total: key.length,
      match: n("match"),
      differs: n("differs"),
      notLearned: n("not_learned"),
      needsReview: n("needs_human_review"),
      extra: extraProposedIds.length,
    },
  };
}
