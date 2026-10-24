// M1 planted-error recall and precision (shared-context section 14): a planted error is caught when a Flag has
// the same checkId and overlapping subject ids. Never matched by text.
import type { AnswerKeyRow, FlagLike, Ratio, Subject } from "./lib/types";
import { ratio } from "./lib/types";

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
  flags: number;
  recall: Ratio;
  precision: Ratio;
  perCheck: Record<string, { recall: Ratio; precision: Ratio }>;
  missedKeyRowIds: string[];
  unmatchedFlags: { id: string; checkId: string; seen: string }[];
};

export function m1(flags: FlagLike[], key: AnswerKeyRow[]): M1 {
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
  };
}
