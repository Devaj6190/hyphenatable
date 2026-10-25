// M1 planted-error recall and precision (shared-context section 14): a planted error is caught when a Flag has
// the same checkId and overlapping subject ids. Never matched by text.
// Only the section 9 checks (CHK-01..CHK-23) can be planted errors. Any other checkId (AGT-01, an agent's question
// on a vague case; LRN-01, a lesson that contradicts an active rule; anything newer) is counted in `otherFlags`
// and left out of precision. CHK-23 stays in: it is an expected extra (a sync run has no subject to key).
import type { AnswerKeyRow, FlagLike, Ratio, Subject } from "./lib/types";
import { ratio } from "./lib/types";

/**
 * Check ids that are flags but never planted errors. Local mirror until contract PR #82 (which adds them to
 * `CheckId` in packages/engine/src/schemas.ts) merges; `isPlanted` decides by pattern, so newer ids are covered too.
 */
export type NonPlantedCheckId = "AGT-01" | "LRN-01";

const PLANTED = /^CHK-(0[1-9]|1\d|2[0-3])$/;
export const isPlanted = (checkId: string) => PLANTED.test(checkId);

const ids = (s: Subject) =>
  new Set(
    [s.workerId, s.jobId, ...s.entryIds, ...s.expenseIds].filter(
      (x): x is string => typeof x === "string",
    ),
  );

export const overlaps = (a: Subject, b: Subject) => {
  const x = ids(a);
  for (const y of ids(b)) if (x.has(y)) return true;
  return false;
};

export type M1 = {
  keyRows: number;
  /** Flags from the section 9 checks only (the precision denominator). */
  flags: number;
  recall: Ratio;
  precision: Ratio;
  perCheck: Record<string, { recall: Ratio; precision: Ratio }>;
  missedKeyRowIds: string[];
  unmatchedFlags: { id: string; checkId: string; seen: string }[];
  /** Flags that are not planted-error checks, by checkId (e.g. AGT-01, LRN-01); not in precision. */
  otherFlags: Record<string, number>;
};

export function m1(allFlags: FlagLike[], key: AnswerKeyRow[]): M1 {
  const flags = allFlags.filter((f) => isPlanted(f.checkId));
  const otherFlags: Record<string, number> = {};
  for (const f of allFlags)
    if (!isPlanted(f.checkId))
      otherFlags[f.checkId] = (otherFlags[f.checkId] ?? 0) + 1;
  const caught = (k: AnswerKeyRow) =>
    flags.some(
      (f) => f.checkId === k.checkId && overlaps(f.subject, k.subject),
    );
  const matches = (f: FlagLike) =>
    key.some((k) => k.checkId === f.checkId && overlaps(f.subject, k.subject));
  const checks = [...new Set([...key, ...flags].map((x) => x.checkId))].sort();
  const perCheck: M1["perCheck"] = {};
  for (const c of checks) {
    const k = key.filter((x) => x.checkId === c);
    const f = flags.filter((x) => x.checkId === c);
    perCheck[c] = {
      recall: ratio(k.filter(caught).length, k.length),
      precision: ratio(f.filter(matches).length, f.length),
    };
  }
  return {
    keyRows: key.length,
    flags: flags.length,
    recall: ratio(key.filter(caught).length, key.length),
    precision: ratio(flags.filter(matches).length, flags.length),
    perCheck,
    missedKeyRowIds: key.filter((k) => !caught(k)).map((k) => k.id),
    unmatchedFlags: flags
      .filter((f) => !matches(f))
      .map((f) => ({ id: f.id, checkId: f.checkId, seen: f.seen })),
    otherFlags,
  };
}

/** The results.json note for M1's scope. */
export function m1Notes(r: M1): string[] {
  const other = Object.entries(r.otherFlags).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const n = other.reduce((s, [, c]) => s + c, 0);
  return [
    "M1 scores only section 9 checks (CHK-01..CHK-23); CHK-23 on a sync run is an expected extra with no key row",
    ...(n
      ? [
          `M1 precision excludes ${n} flag(s) that are not planted-error checks (${other.map(([id, c]) => `${id} ${c}`).join(", ")}): agent questions and lesson conflicts`,
        ]
      : []),
  ];
}
