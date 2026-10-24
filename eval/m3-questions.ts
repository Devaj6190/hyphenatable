// M3 questions per cycle: measured `Cycle.questionsAsked` (live runs), the past cycles' answered questions,
// and, from the answer key, how many planted items need a person's answer in each current cycle
// (CHK-12 is a workbook note, never a question; a-c06 rows with `resolvableByRuleType` are settled by a
// rule learned in cycle 1). The answer-key figure is an expectation, labelled so, never a result.
import type { Cycle } from "@payrollpilot/engine/payroll/types";
import type { AnswerKeyRow, Question } from "./lib/types";

const NEVER_ASKED = new Set(["CHK-12"]);

export type M3 = {
  measured: { cycleId: string; questionsAsked: number }[];
  pastAnswered: Record<string, number>;
  expectedFromAnswerKey: {
    cycleId: string;
    planted: number;
    needAnswer: number;
    resolvedByRule: number;
    perCheck: Record<string, number>;
  }[];
};

export function m3(
  cycles: Cycle[],
  questions: Question[],
  key: AnswerKeyRow[],
  currentCycleIds: string[],
): M3 {
  const firstCurrent = currentCycleIds[0];
  const rowsFor = (c: string) =>
    key.filter((k) => (k.cycleId ?? firstCurrent) === c);
  const pastAnswered: Record<string, number> = {};
  for (const q of questions)
    if (q.status === "answered")
      pastAnswered[q.cycleId] = (pastAnswered[q.cycleId] ?? 0) + 1;
  return {
    measured: cycles
      .filter((c) => currentCycleIds.includes(c.id))
      .map((c) => ({ cycleId: c.id, questionsAsked: c.questionsAsked })),
    pastAnswered,
    expectedFromAnswerKey: currentCycleIds.map((cycleId) => {
      const rows = rowsFor(cycleId).filter((k) => !NEVER_ASKED.has(k.checkId));
      const ask = rows.filter((k) => !k.resolvableByRuleType);
      const perCheck: Record<string, number> = {};
      for (const k of ask) perCheck[k.checkId] = (perCheck[k.checkId] ?? 0) + 1;
      return {
        cycleId,
        planted: rowsFor(cycleId).length,
        needAnswer: ask.length,
        resolvedByRule: rows.length - ask.length,
        perCheck,
      };
    }),
  };
}
