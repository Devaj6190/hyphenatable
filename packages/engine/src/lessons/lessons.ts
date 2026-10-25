// B-14: the learning contract's code steps (shared context section 11). A lesson is written from ids,
// compared with what is known, backtested over past cycles, and only becomes a rule once the owner
// approves it (low-risk routing activates on its own and is logged). Pure; no IO.
import { runAll } from "../checks/index";
import type { CheckInput } from "../checks/types";
import { computeStage1 } from "../payroll/stage1";
import type { Rule as PayRule } from "../payroll/types";
import type { CheckId, Rule, RuleType } from "../schemas";

export type LessonDraft = {
  text: string;
  structured: { ruleType: RuleType | null; params: Record<string, unknown> };
  evaluation: {
    expected: string;
    actual: string;
    source: "answer" | "answer_key" | "paid";
  };
};

const show = (v: unknown) =>
  v === null || v === undefined ? "none" : String(v);

/**
 * From an answered question: what PayrollPilot assumed, what the person said, and who answers this
 * kind of question (a routing lesson, the one rule code can state on its own; the Analyst may
 * propose a more specific rule when it classifies the lesson).
 */
export function lessonFromAnswer(a: {
  checkId: CheckId;
  answeredByRole: "owner" | "manager" | "employee";
  record: { table: string; id: string; field: string | null };
  before: unknown;
  after: unknown;
  context: string;
}): LessonDraft {
  const change =
    a.record.field === null
      ? "confirmed as recorded"
      : `${a.record.field} ${show(a.before)} → ${show(a.after)}`;
  return {
    text: `${a.checkId} ${a.record.table} ${a.record.id} (${a.context}): ${change}; answered by the ${a.answeredByRole}.`,
    structured: {
      ruleType: "routing",
      params: { checkId: a.checkId, answeredBy: a.answeredByRole },
    },
    evaluation: {
      expected: a.record.field === null ? "needs a check" : show(a.before),
      actual: a.record.field === null ? "correct as recorded" : show(a.after),
      source: "answer",
    },
  };
}

export type KnownLesson = {
  id: string;
  status: string;
  structured: { ruleType: RuleType | null; params: Record<string, unknown> };
};

export type Classification = {
  kind: "new" | "confirmed" | "superseded" | "conflict";
  relatedLessonId: string | null;
  conflictRuleId: string | null;
  reason: string;
};

/** JSON with object keys sorted, so the same params compare equal however they were stored. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** The key that makes two rules of one type about the same thing (e.g. routing for one check). */
const KEY: Partial<Record<RuleType, string[]>> = {
  routing: ["checkId"],
  pay_rate: ["workerId"],
  venmo_rate: ["workerId"],
  long_shift_threshold: [],
  overtime_policy: [],
  expense_account_kind: ["accountName"],
  vendor_job_hint: ["vendor"],
};

const sameSubject = (
  type: RuleType,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) => (KEY[type] ?? Object.keys(a)).every((k) => same(a[k], b[k]));

/**
 * Deterministic comparison: an identical known lesson confirms it; an active rule about the same
 * subject with different params is a conflict (escalated, never overwritten); a known lesson about
 * the same subject with different params is superseded. Otherwise new. The Analyst refines this
 * when a model is available; code still enforces the conflict check.
 */
export function classifyLexical(
  l: LessonDraft,
  known: KnownLesson[],
  activeRules: Pick<Rule, "id" | "type" | "params">[],
): Classification {
  const { ruleType, params } = l.structured;
  if (!ruleType)
    return {
      kind: "new",
      relatedLessonId: null,
      conflictRuleId: null,
      reason: "no rule type",
    };
  const live = known.filter(
    (k) => k.status !== "superseded" && k.status !== "rejected",
  );
  const identical = live.find(
    (k) =>
      k.structured.ruleType === ruleType && same(k.structured.params, params),
  );
  const rule = activeRules.find(
    (r) => r.type === ruleType && sameSubject(ruleType, r.params, params),
  );
  if (rule && !same(stripMeta(rule.params), params))
    return {
      kind: "conflict",
      relatedLessonId: identical?.id ?? null,
      conflictRuleId: rule.id,
      reason: `contradicts active rule ${rule.id}`,
    };
  if (identical)
    return {
      kind: "confirmed",
      relatedLessonId: identical.id,
      conflictRuleId: null,
      reason: "same as a known lesson",
    };
  const older = live.find(
    (k) =>
      k.structured.ruleType === ruleType &&
      sameSubject(ruleType, k.structured.params, params),
  );
  if (older)
    return {
      kind: "superseded",
      relatedLessonId: older.id,
      conflictRuleId: null,
      reason: `replaces lesson ${older.id}`,
    };
  return {
    kind: "new",
    relatedLessonId: null,
    conflictRuleId: null,
    reason: "nothing like it is known",
  };
}

/** Rule params carry a plain-words statement beside the structured fields; compare only the fields. */
function stripMeta(p: Record<string, unknown>) {
  const { statement: _s, ...rest } = p;
  return rest;
}

/** Rule types that only route questions; they activate on their own (learning contract step 4). */
export const LOW_RISK: RuleType[] = ["routing"];

export type PastCycle = {
  checks: CheckInput;
  /** Stage 1 inputs for the same cycle. */
  pay: Parameters<typeof computeStage1>;
  /** workerId → gross actually paid that cycle (Gusto or Venmo), when known. */
  paid: Record<string, number>;
};

export type Backtest = { cycles: number; agree: number; disagree: number };

const PAY_TYPES: RuleType[] = [
  "overtime_policy",
  "pay_rate",
  "venmo_rate",
  "commission_plan",
  "tip_policy",
  "manager_split",
];
const CHECK_TYPES: RuleType[] = [
  "long_shift_threshold",
  "disposal_parent_link",
  "vendor_job_hint",
  "expense_account_kind",
  "worker_mapping",
  "deposit_vs_final",
  "catch_all_threshold",
  "in_person_quoter",
];

const flagKey = (f: { checkId: string; subject: unknown }) =>
  canonical([f.checkId, f.subject]);

/**
 * Runs a candidate rule over past cycles. A pay rule agrees in a cycle when every worker whose pay
 * it changes ends up closer to what was actually paid; a check rule agrees when it raises no flag on
 * a past record that was paid as recorded. Null for types the engine cannot evaluate (routing).
 */
export function backtest(
  candidate: Pick<Rule, "id" | "companyId" | "type" | "params">,
  past: PastCycle[],
): Backtest | null {
  const isPay = PAY_TYPES.includes(candidate.type);
  if (!isPay && !CHECK_TYPES.includes(candidate.type)) return null;
  let agree = 0;
  let disagree = 0;
  for (const c of past) {
    const ok = isPay ? payAgrees(candidate, c) : checksAgree(candidate, c);
    if (ok) agree++;
    else disagree++;
  }
  return { cycles: past.length, agree, disagree };
}

function payAgrees(
  candidate: Pick<Rule, "id" | "companyId" | "type" | "params">,
  c: PastCycle,
): boolean {
  const [cycle, entries, workers, rules, opts] = c.pay;
  const active = { ...candidate, status: "active" } as PayRule;
  const others = rules.filter(
    (r) =>
      r.id !== candidate.id &&
      !(
        r.type === candidate.type &&
        sameSubject(candidate.type, r.params, candidate.params)
      ),
  );
  const without = computeStage1(cycle, entries, workers, others, opts).pay;
  const withRule = computeStage1(
    cycle,
    entries,
    workers,
    [...others, active],
    opts,
  ).pay;
  for (const w of workers) {
    const a = without[w.id]?.grossCents ?? 0;
    const b = withRule[w.id]?.grossCents ?? 0;
    const paid = c.paid[w.id];
    if (a === b || paid === undefined) continue;
    if (Math.abs(b - paid) > Math.abs(a - paid)) return false;
  }
  return true;
}

function checksAgree(
  candidate: Pick<Rule, "id" | "companyId" | "type" | "params">,
  c: PastCycle,
): boolean {
  const others = c.checks.rules.filter((r) => r.id !== candidate.id);
  const active = { ...candidate, status: "active" } as Rule;
  const before = new Set(runAll({ ...c.checks, rules: others }).map(flagKey));
  const after = runAll({ ...c.checks, rules: [...others, active] });
  return after.every((f) => before.has(flagKey(f)));
}
