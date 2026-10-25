// M2 matching: runbook key rules vs the frozen proposed rules.
//  - Headline: key rules with a specific ruleType, scored deterministically on type + params (a per-type
//    tolerance for numbers; a key param that is null — unstated by the owner — matches only null or an absent
//    param, never a value). Recall, precision and the wrong-value count come from these alone.
//  - "other" key rules (free-text statements) are never in the headline: each is "needs_human_review", with an
//    optional judge suggestion of the closest unused proposal (the judge never sees the statement).
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
  /** "other" rules only: the judge's suggested proposal, for the person reviewing. */
  suggestedProposedId?: string | null;
  by: "deterministic" | "judge" | "none";
};
export type Ratio = { num: number; den: number; value: number | null };
const ratio = (num: number, den: number): Ratio => ({
  num,
  den,
  value: den ? Math.round((num / den) * 10000) / 10000 : null,
});
export type GradeResult = {
  rules: Graded[];
  /** Proposals no typed key rule used (they may correspond to "other" rules pending review). */
  extraProposedIds: string[];
  counts: {
    typed: {
      total: number;
      match: number;
      /** Same rule, wrong value: the params are named per rule in the private detail. */
      differs: number;
      notLearned: number;
      extra: number;
      recall: Ratio;
      /** match / (match + differs + extra): every proposal not matched counts against it. */
      precision: Ratio;
    };
    other: { total: number; needsReview: number; suggested: number };
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

/**
 * The key's params the proposal gets wrong or leaves out. Extra proposal params are not penalized. A key param
 * that is null (the owner did not state it) is satisfied only by null or by leaving it out (a question).
 */
export function differing(key: KeyRule, p: ProposedRule): string[] {
  return Object.keys(key.params)
    .sort()
    .filter((k) => {
      const kv = key.params[k];
      if (kv === null) return k in p.params && p.params[k] !== null;
      return !(k in p.params) || !sameParam(key.ruleType, k, kv, p.params[k]);
    });
}

export async function gradeRules(
  key: KeyRule[],
  proposed: ProposedRule[],
  judge?: Judge,
): Promise<GradeResult> {
  const typed = key.filter((k) => k.ruleType !== "other");
  const used = new Set<string>();
  const out = new Map<string, Graded>();
  const g = (k: KeyRule, v: Omit<Graded, "keyId" | "ruleType">) =>
    out.set(k.id, { keyId: k.id, ruleType: k.ruleType, ...v });
  // Pass 1: exact matches first, so a perfect pair is never taken by a near miss.
  for (const k of typed) {
    const p = proposed.find(
      (x) =>
        !used.has(x.id) &&
        x.type === k.ruleType &&
        differing(k, x).length === 0,
    );
    if (!p) continue;
    used.add(p.id);
    g(k, {
      verdict: "match",
      proposedId: p.id,
      differingParams: [],
      by: "deterministic",
    });
  }
  // Pass 2: same type, closest proposal → differs; no same-type proposal → not learned.
  for (const k of typed) {
    if (out.has(k.id)) continue;
    const best = proposed
      .filter((x) => !used.has(x.id) && x.type === k.ruleType)
      .map((x) => ({ x, d: differing(k, x) }))
      .sort(
        (a, b) => a.d.length - b.d.length || a.x.id.localeCompare(b.x.id),
      )[0];
    if (!best) {
      g(k, {
        verdict: "not_learned",
        proposedId: null,
        differingParams: [],
        by: "deterministic",
      });
      continue;
    }
    used.add(best.x.id);
    g(k, {
      verdict: "differs",
      proposedId: best.x.id,
      differingParams: best.d,
      by: "deterministic",
    });
  }
  const extraProposedIds = proposed
    .filter((x) => !used.has(x.id))
    .map((x) => x.id);
  // "other": always a person's call; the judge (if any) only suggests the closest unused proposal.
  let suggested = 0;
  for (const k of key.filter((x) => x.ruleType === "other")) {
    let suggestion: string | null = null;
    const candidates = proposed.filter((x) => !used.has(x.id));
    if (judge && candidates.length) {
      try {
        const j = await judge({
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
        if (
          j.verdict !== "not_learned" &&
          j.proposedId &&
          candidates.some((x) => x.id === j.proposedId)
        )
          suggestion = j.proposedId;
      } catch {
        // failed the model-input scrub or the call: no suggestion
      }
    }
    if (suggestion) suggested++;
    g(k, {
      verdict: "needs_human_review",
      proposedId: null,
      differingParams: [],
      suggestedProposedId: suggestion,
      by: judge ? "judge" : "none",
    });
  }
  const rules = key.map((k) => out.get(k.id) as Graded);
  const n = (v: Verdict) =>
    rules.filter((r) => r.ruleType !== "other" && r.verdict === v).length;
  const match = n("match");
  const differs = n("differs");
  return {
    rules,
    extraProposedIds,
    counts: {
      typed: {
        total: typed.length,
        match,
        differs,
        notLearned: n("not_learned"),
        extra: extraProposedIds.length,
        recall: ratio(match, typed.length),
        precision: ratio(match, match + differs + extraProposedIds.length),
      },
      other: {
        total: key.length - typed.length,
        needsReview: key.length - typed.length,
        suggested,
      },
    },
  };
}
