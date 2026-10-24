import { describe, expect, test } from "vitest";
import { loadFixtures } from "../lib/io";
import type { AnswerKeyRow, FlagLike } from "../lib/types";
import { m1, overlaps } from "../m1-planted";
import { m2FromGrades } from "../m2-rules";
import { m3 } from "../m3-questions";
import { backtest } from "../m4-backtest";
import { m5 } from "../m5-completeness";
import { m6 } from "../m6-traceability";
import { buildResults } from "../metrics";
import { Results } from "../schema";

const S = (s: Partial<FlagLike["subject"]> = {}) => ({
  workerId: null,
  jobId: null,
  entryIds: [],
  expenseIds: [],
  ...s,
});
const flag = (
  id: string,
  checkId: string,
  subject = S(),
  extra: Partial<FlagLike> = {},
): FlagLike => ({
  id,
  companyId: "a",
  cycleId: "a-c05",
  checkId,
  status: "open",
  subject,
  seen: id,
  where: [{ system: "jobber", recordId: id, url: null }],
  confidence: "certain",
  precedent: null,
  routeTo: "manager",
  affects: { workerId: null, jobId: null, dollarsCents: null },
  questionId: null,
  correctionId: null,
  ...extra,
});
const row = (
  id: string,
  checkId: string,
  subject = S(),
  extra: Partial<AnswerKeyRow> = {},
): AnswerKeyRow => ({
  id,
  checkId,
  subject,
  truth: "",
  registerCategory: "",
  ...extra,
});

describe("M1", () => {
  test("matches on checkId and any overlapping subject id, never on text", () => {
    expect(
      overlaps(S({ entryIds: ["e1", "e2"] }), S({ entryIds: ["e2"] })),
    ).toBe(true);
    expect(overlaps(S({ workerId: "w1" }), S({ workerId: "w2" }))).toBe(false);
    expect(overlaps(S(), S())).toBe(false);
    const r = m1(
      [
        flag("f1", "CHK-01", S({ entryIds: ["e1"] })),
        flag("f2", "CHK-02", S({ entryIds: ["e1"] })),
        flag("f3", "CHK-23"),
      ],
      [
        row("k1", "CHK-01", S({ workerId: "w", entryIds: ["e1"] })),
        row("k2", "CHK-04", S({ entryIds: ["e9"] })),
      ],
    );
    expect(r.recall).toEqual({ num: 1, den: 2, value: 0.5 });
    expect(r.precision).toEqual({ num: 1, den: 3, value: 0.3333 });
    expect(r.missedKeyRowIds).toEqual(["k2"]);
    expect(r.unmatchedFlags.map((f) => f.id)).toEqual(["f2", "f3"]);
    expect(r.perCheck["CHK-04"].recall.value).toBe(0);
    expect(r.perCheck["CHK-23"].precision.value).toBe(0);
  });
});

describe("M2, M5, M6", () => {
  test("M2 emits counts only", () => {
    expect(
      m2FromGrades([
        { ruleId: "r1", runbookId: "rb1", verdict: "match" },
        { ruleId: null, runbookId: "rb2", verdict: "not_learned" },
      ]),
    ).toEqual({
      status: "measured",
      total: 2,
      match: 1,
      differ: 0,
      notLearned: 1,
    });
  });
  test("M5 lists every blocked object", () => {
    const r = m5([
      {
        id: "s1",
        cycleId: "c",
        source: "jobber",
        object: "x",
        pulled: 1,
        expected: 1,
        complete: true,
        error: null,
      },
      {
        id: "s2",
        cycleId: "c",
        source: "qbo",
        object: "y",
        pulled: 0,
        expected: 2,
        complete: false,
        error: "boom",
      },
    ]);
    expect(r.runs.value).toBe(0.5);
    expect(r.blocked.map((b) => b.id)).toEqual(["s2"]);
  });
  test("M6: a where ref plus a deterministic check, a precedent rule or a model call", () => {
    const r = m6(
      [
        flag("ok", "CHK-01"),
        flag("judged", "CHK-14", S(), { confidence: 0.8 }),
        flag("judgedRule", "CHK-14", S(), {
          confidence: 0.8,
          precedent: { ruleId: "r1", flagId: null, note: "" },
        }),
        flag("nowhere", "CHK-01", S(), { where: [] }),
        flag("model", "CHK-15", S(), { confidence: 0.9 }),
      ],
      new Set(["model"]),
    );
    expect(r.traceable).toEqual({ num: 3, den: 5, value: 0.6 });
    expect(r.untraceableFlagIds).toEqual(["judged", "nowhere"]);
  });
});

describe("Company A fixtures (a-c05 + the a-c06 extension)", () => {
  const fx = loadFixtures("a");
  test("the a-c06 extension is concatenated onto the base files", () => {
    expect(fx.cycles.map((c) => c.id)).toContain("a-c06");
    expect(
      fx.answerKey.filter((k) => k.cycleId === "a-c06").length,
    ).toBeGreaterThan(20);
    expect(fx.entries.some((e) => e.cycleId === "a-c06")).toBe(true);
  });
  test("M3 expectation: cycle 2 needs fewer answers because cycle-1 rules resolve some rows", () => {
    const r = m3(fx.cycles, fx.questions, fx.answerKey, ["a-c05", "a-c06"]);
    const [c5, c6] = r.expectedFromAnswerKey;
    const resolvable = fx.answerKey.filter(
      (k) => k.cycleId === "a-c06" && k.resolvableByRuleType,
    ).length;
    expect(c6.resolvedByRule).toBe(resolvable);
    expect(c6.needAnswer).toBeLessThan(c5.needAnswer);
    expect(c5.perCheck["CHK-12"]).toBeUndefined();
    expect(r.pastAnswered).toEqual({
      "a-c01": 1,
      "a-c02": 2,
      "a-c03": 2,
      "a-c04": 1,
    });
  });
  test("buildResults scores only the cycle's own key rows and flags, and the output validates", () => {
    const keyed = fx.answerKey.find((k) => k.cycleId === "a-c06");
    if (!keyed) throw new Error("no a-c06 key row");
    const flags = [
      flag("f5", "CHK-23"),
      { ...flag("f6", keyed.checkId, keyed.subject), cycleId: "a-c06" },
    ];
    const r = buildResults({
      fx,
      cycleId: "a-c06",
      flags,
      flagsSource: "test",
      m2: { status: "pending", reason: "test" },
      syntheticBacktest: null,
      generatedAt: "2026-10-24T12:00:00.000Z",
      gitSha: null,
    });
    expect(r.m1.flags).toBe(1);
    expect(r.m1.keyRows).toBe(
      fx.answerKey.filter((k) => k.cycleId === "a-c06").length,
    );
    expect(r.m1.precision.value).toBe(1);
    expect(Results.safeParse(r).success).toBe(true);
    expect(Results.safeParse({ ...r, m1: {} }).success).toBe(false);
  });
});

describe("M4 synthetic self-check (Company B, not Company R)", () => {
  test("Stage 1 gross matches every past Gusto regular row to the cent", () => {
    const r = backtest(loadFixtures("b"));
    expect(r.synthetic).toBe(true);
    expect(r.workers).toBe(120);
    expect(r.exact).toBe(r.workers);
    expect(r.maxDiffCents).toBe(0);
  });
});
