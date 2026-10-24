// Where each worker's rate comes from. An active rule beats the source system; nothing ever defaults.
import type { Rule, Worker } from "./types";

export type Rate =
  | { ok: true; rateCents: number; unit: string; source: string }
  | { ok: false; reason: string };

const activeFor = (rules: Rule[], type: Rule["type"], workerId: string) =>
  rules.filter(
    (r) =>
      r.type === type &&
      r.status === "active" &&
      r.params.workerId === workerId,
  );

const isCents = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** Gusto pay rate: an active `pay_rate` rule overrides the Gusto compensation. */
export function payRate(worker: Worker, rules: Rule[]): Rate {
  const found = activeFor(rules, "pay_rate", worker.id);
  if (found.length > 1)
    return {
      ok: false,
      reason: `conflicting pay_rate rules ${found.map((r) => r.id).join(", ")}`,
    };
  if (found.length === 1) {
    const r = found[0];
    if (
      !isCents(r.params.rateCents) ||
      typeof r.params.paymentUnit !== "string"
    )
      return { ok: false, reason: `pay_rate rule ${r.id} has no usable rate` };
    const g = worker.gusto?.rateCents;
    const note =
      g !== null && g !== undefined && g !== r.params.rateCents
        ? ` (overrides Gusto ${g}¢/${worker.gusto?.paymentUnit})`
        : "";
    return {
      ok: true,
      rateCents: r.params.rateCents,
      unit: r.params.paymentUnit,
      source: `pay_rate rule ${r.id}${note}`,
    };
  }
  const g = worker.gusto;
  if (g && isCents(g.rateCents) && g.paymentUnit)
    return {
      ok: true,
      rateCents: g.rateCents,
      unit: g.paymentUnit,
      source: "Gusto compensation",
    };
  return {
    ok: false,
    reason: "no pay rate: no active pay_rate rule and no Gusto rate",
  };
}

/** Venmo rate: an active `venmo_rate` rule overrides `Worker.venmoRateCents`. */
export function venmoRate(worker: Worker, rules: Rule[]): Rate {
  const found = activeFor(rules, "venmo_rate", worker.id);
  if (found.length > 1)
    return {
      ok: false,
      reason: `conflicting venmo_rate rules ${found.map((r) => r.id).join(", ")}`,
    };
  if (found.length === 1) {
    const r = found[0];
    if (!isCents(r.params.rateCents))
      return {
        ok: false,
        reason: `venmo_rate rule ${r.id} has no usable rate`,
      };
    return {
      ok: true,
      rateCents: r.params.rateCents,
      unit: "Hour",
      source: `venmo_rate rule ${r.id}`,
    };
  }
  if (isCents(worker.venmoRateCents))
    return {
      ok: true,
      rateCents: worker.venmoRateCents,
      unit: "Hour",
      source: "worker Venmo rate",
    };
  return {
    ok: false,
    reason:
      "no Venmo rate (CHK-11): no active venmo_rate rule and venmoRateCents is null",
  };
}
