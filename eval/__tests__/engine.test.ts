// Regression gate: the real checks engine on Company A, and the learning curve. CI runs this on every PR,
// so a check that stops catching a planted error, or a rule that stops settling one, fails the build.
import { describe, expect, test } from "vitest";
import { approve, engineFlags, inputFor, loadEngineFixtures } from "../engine";
import { loadFixtures } from "../lib/io";
import type { FlagLike } from "../lib/types";
import { m1 } from "../m1-planted";
import { LEARNED_A, learningCurve } from "../m3-learning";

const fx = loadEngineFixtures("a");
const key = loadFixtures("a").answerKey;
const onboarding = fx.onboardingRules.map(approve);
const score = (cycleId: string) =>
  m1(
    engineFlags(inputFor(fx, cycleId, onboarding)) as unknown as FlagLike[],
    key.filter((k) => (k.cycleId ?? "a-c05") === cycleId),
  );

describe("M1 on the checks engine", () => {
  test("a-c05: every planted error, nothing else", () => {
    const r = score("a-c05");
    expect(r.missedKeyRowIds).toEqual([]);
    expect(r.unmatchedFlags).toEqual([]);
  });

  test("a-c06: every planted error but the known CHK-08 gap, nothing else", () => {
    const r = score("a-c06");
    // a-w13 is deactivated in Jobber and still active in Gusto, with no hours: the contract has no Gusto
    // employment status, so CHK-08 cannot see it (packages/engine/src/checks/CHK-08.ts).
    expect(r.missedKeyRowIds).toEqual(["a-ak-72"]);
    expect(r.unmatchedFlags).toEqual([]);
  });
});

describe("M3 learning curve", () => {
  const l = learningCurve(fx, key, LEARNED_A, ["a-c05", "a-c06"]);
  const needs = (scenario: string) =>
    l.curve.find((c) => c.scenario === scenario && c.cycleId === "a-c06")
      ?.outcomes.needs_person ?? Number.NaN;

  test("every learned rule passes its backtest", () => {
    expect(
      l.learned.filter((x) => x.verdict === "rejected_by_backtest"),
    ).toEqual([]);
  });

  test("cycle 2 needs a person less at each step", () => {
    expect(needs("onboarding")).toBeLessThan(needs("day0"));
    expect(needs("learned")).toBeLessThan(needs("onboarding"));
  });

  test("every row the answer key marks rule-resolvable is handled by a rule", () => {
    expect(l.resolvedRows).toHaveLength(9);
    expect(l.resolvedRows.filter((r) => r.outcome === "needs_person")).toEqual(
      [],
    );
  });
});
