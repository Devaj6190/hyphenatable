// Overtime from the active `overtime_policy` rule, in seconds (money is computed later, once).
// Weekly (Company A): `{ weeklyHours: 40, multiplier: 1.5, dailyHours: null }`.
// California (Company B): `daily: [{ overHours: 8, multiplier: 1.5 }, { overHours: 12, multiplier: 2 }]`,
// `weekly: { overHours: 40, multiplier: 1.5 }`; daily-OT hours do not count toward the weekly 40.
// The seventh-consecutive-day premium is NOT modeled: a worker with all 7 days of a workweek under a
// daily policy is held instead of guessed.
import type { HourlyName, Rule } from "./types";

export type OvertimePolicy = {
  ruleId: string;
  workweek: unknown;
  /** Thresholds in seconds, ascending; the hours above each are paid at its multiplier. */
  daily: { overSec: number; multiplier: number }[];
  weekly: { overSec: number; multiplier: number } | null;
};

export type Split = Record<HourlyName, number>;

const NAME_BY_MULTIPLIER: Record<number, HourlyName> = {
  1.5: "Overtime",
  2: "Double Overtime",
};

export function nameFor(multiplier: number): HourlyName | null {
  return NAME_BY_MULTIPLIER[multiplier] ?? null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

export function parseOvertimePolicy(
  rules: Rule[],
): { ok: true; policy: OvertimePolicy } | { ok: false; reason: string } {
  const found = rules.filter(
    (r) => r.type === "overtime_policy" && r.status === "active",
  );
  if (found.length === 0)
    return { ok: false, reason: "no active overtime_policy rule" };
  if (found.length > 1)
    return {
      ok: false,
      reason: `conflicting overtime_policy rules ${found.map((r) => r.id).join(", ")}`,
    };
  const r = found[0];
  const p = r.params;
  const daily: OvertimePolicy["daily"] = [];
  if (Array.isArray(p.daily)) {
    for (const t of p.daily as Record<string, unknown>[]) {
      const over = num(t?.overHours);
      const m = num(t?.multiplier);
      if (over === null || m === null)
        return { ok: false, reason: `${r.id}: unreadable daily tier` };
      daily.push({ overSec: over * 3600, multiplier: m });
    }
  } else if (p.dailyHours !== null && p.dailyHours !== undefined) {
    const over = num(p.dailyHours);
    const m = num(p.multiplier);
    if (over === null || m === null)
      return { ok: false, reason: `${r.id}: unreadable dailyHours` };
    daily.push({ overSec: over * 3600, multiplier: m });
  }
  daily.sort((a, b) => a.overSec - b.overSec);
  let weekly: OvertimePolicy["weekly"] = null;
  const w = p.weekly as Record<string, unknown> | undefined;
  const wOver = num(w?.overHours ?? p.weeklyHours);
  const wMult = num(w?.multiplier ?? p.multiplier);
  if (wOver !== null && wMult !== null)
    weekly = { overSec: wOver * 3600, multiplier: wMult };
  if (!weekly && daily.length === 0)
    return { ok: false, reason: `${r.id}: no weekly or daily threshold` };
  for (const m of [
    ...daily.map((d) => d.multiplier),
    ...(weekly ? [weekly.multiplier] : []),
  ])
    if (!nameFor(m))
      return {
        ok: false,
        reason: `${r.id}: multiplier ${m} has no Gusto earning (only 1.5 Overtime, 2 Double Overtime)`,
      };
  if (p.seventhConsecutiveDay !== null && p.seventhConsecutiveDay !== undefined)
    return {
      ok: false,
      reason: `${r.id}: seventh-consecutive-day premium is not modeled`,
    };
  return {
    ok: true,
    policy: { ruleId: r.id, workweek: p.workweek ?? null, daily, weekly },
  };
}

/** Split one workweek (local day → seconds) into Regular / Overtime / Double Overtime seconds. */
export function splitWeek(days: Map<string, number>, p: OvertimePolicy): Split {
  const out: Split = { "Regular Hours": 0, Overtime: 0, "Double Overtime": 0 };
  for (const sec of days.values()) {
    const first = p.daily[0]?.overSec ?? Number.POSITIVE_INFINITY;
    out["Regular Hours"] += Math.min(sec, first);
    p.daily.forEach((tier, i) => {
      const next = p.daily[i + 1]?.overSec ?? Number.POSITIVE_INFINITY;
      const above = Math.min(sec, next) - tier.overSec;
      if (above > 0) out[nameFor(tier.multiplier) as HourlyName] += above;
    });
  }
  if (p.weekly && out["Regular Hours"] > p.weekly.overSec) {
    const excess = out["Regular Hours"] - p.weekly.overSec;
    out["Regular Hours"] = p.weekly.overSec;
    out[nameFor(p.weekly.multiplier) as HourlyName] += excess;
  }
  return out;
}

/** True when the worker has hours on all 7 days of a workweek (the CA 7th-day case we do not model). */
export function worksSevenDays(days: Map<string, number>): boolean {
  return [...days.values()].filter((s) => s > 0).length >= 7;
}
