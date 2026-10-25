import { describe, expect, it } from "vitest";
import { fixtures } from "../payroll/__tests__/fixtures";
import type { Rule } from "../schemas";
import {
  backtest,
  classifyLexical,
  type LessonDraft,
  lessonFromAnswer,
  type PastCycle,
} from "./lessons";

const lesson = lessonFromAnswer({
  checkId: "CHK-01",
  answeredByRole: "manager",
  record: { table: "timeEntries", id: "te_14", field: "jobId" },
  before: null,
  after: "j_12",
  context: "w_07, 2026-10-08, 8.00 h",
});

describe("lessonFromAnswer", () => {
  it("writes the lesson from ids, with what was assumed and what the person said", () => {
    expect(lesson.text).toBe(
      "CHK-01 timeEntries te_14 (w_07, 2026-10-08, 8.00 h): jobId none → j_12; answered by the manager.",
    );
    expect(lesson.evaluation).toEqual({
      expected: "none",
      actual: "j_12",
      source: "answer",
    });
    expect(lesson.structured).toEqual({
      ruleType: "routing",
      params: { checkId: "CHK-01", answeredBy: "manager" },
    });
  });
});

describe("classifyLexical", () => {
  const known = (params: Record<string, unknown>, id = "l1") => ({
    id,
    status: "new",
    structured: { ruleType: "routing" as const, params },
  });

  it("confirms an identical known lesson", () => {
    expect(
      classifyLexical(lesson, [known(lesson.structured.params)], []).kind,
    ).toBe("confirmed");
  });

  it("supersedes a known lesson about the same check with a different answer", () => {
    const r = classifyLexical(
      lesson,
      [known({ checkId: "CHK-01", answeredBy: "owner" })],
      [],
    );
    expect(r).toMatchObject({ kind: "superseded", relatedLessonId: "l1" });
  });

  it("escalates a contradiction with an active rule instead of overwriting it", () => {
    const rule = {
      id: "r1",
      type: "routing" as const,
      params: {
        checkId: "CHK-01",
        answeredBy: "owner",
        statement: "owner answers",
      },
    };
    expect(classifyLexical(lesson, [], [rule])).toMatchObject({
      kind: "conflict",
      conflictRuleId: "r1",
    });
  });

  it("agrees with an active rule that says the same thing", () => {
    const rule = {
      id: "r1",
      type: "routing" as const,
      params: { checkId: "CHK-01", answeredBy: "manager", statement: "x" },
    };
    expect(classifyLexical(lesson, [], [rule]).kind).toBe("new");
  });

  it("treats a lesson with no rule type as new", () => {
    const plain: LessonDraft = {
      ...lesson,
      structured: { ruleType: null, params: {} },
    };
    expect(classifyLexical(plain, [known({})], []).kind).toBe("new");
  });
});

describe("backtest", () => {
  const A = fixtures("a");
  // Past cycles with what was actually paid per worker.
  const past: PastCycle[] = A.cycles
    .filter((c) => A.pastPayrolls.some((p) => p.cycleId === c.id))
    .map((cycle) => {
      const paid: Record<string, number> = {};
      for (const p of A.pastPayrolls.filter((x) => x.cycleId === cycle.id))
        paid[p.workerId] = (paid[p.workerId] ?? 0) + p.grossCents;
      return {
        checks: undefined as unknown as PastCycle["checks"],
        pay: [
          cycle,
          A.entries.filter((e) => e.cycleId === cycle.id),
          A.workers,
          A.rules,
          { company: A.company, expenses: A.expenses },
        ],
        paid,
      };
    });
  const hourly = A.workers.find(
    (w) =>
      w.gusto?.rateCents &&
      w.gusto.paymentUnit === "Hour" &&
      w.payType === "hourly",
  );
  const baseRate = hourly?.gusto?.rateCents;
  if (!hourly || !baseRate) throw new Error("no hourly worker in fixtures");
  const rate = (rateCents: number) =>
    ({
      id: "cand",
      companyId: A.company.id,
      type: "pay_rate",
      params: { workerId: hourly.id, rateCents, paymentUnit: "Hour" },
    }) as Pick<Rule, "id" | "companyId" | "type" | "params">;

  it("has past cycles to run over", () => {
    expect(past.length).toBeGreaterThan(0);
  });

  it("a rate that matches what was paid agrees in every cycle", () => {
    const r = backtest(rate(baseRate), past);
    expect(r).toEqual({ cycles: past.length, agree: past.length, disagree: 0 });
  });

  it("a rate far from what was paid disagrees wherever that worker had hours", () => {
    const r = backtest(rate(baseRate * 3), past);
    expect(r?.disagree).toBeGreaterThan(0);
  });

  it("returns null for rule types it cannot evaluate", () => {
    expect(backtest({ ...rate(1), type: "routing" }, past)).toBeNull();
  });
});
