import { describe, expect, test } from "vitest";
import {
  Interpretation,
  InterpretationResult,
  interpretationKinds,
} from "./schema";

const base = {
  id: "int_01",
  questionId: "q_01",
  messageId: "msg_01",
  confidence: 0.93,
  model: "claude-haiku-5-5",
  needsFollowUp: false,
};

// One fixture per kind, shaped as shared-context section 6 has them.
const fixtures = {
  confirm: { kind: "confirm", optionIndex: 1, values: {} },
  change: { kind: "change", optionIndex: 2, values: { jobId: "a-j04" } },
  fixed_in_source: { kind: "fixed_in_source", optionIndex: null, values: {} },
  escalate: { kind: "escalate", optionIndex: null, values: {} },
  ambiguous: { kind: "ambiguous", optionIndex: null, values: {} },
  stop: { kind: "stop", optionIndex: null, values: {} },
} as const;

describe("Interpretation schema", () => {
  test("covers exactly the six kinds", () => {
    expect([...interpretationKinds].sort()).toEqual(
      Object.keys(fixtures).sort(),
    );
  });

  test.each(Object.entries(fixtures))("%s round-trips", (_, result) => {
    const parsed = Interpretation.parse({ ...base, result });
    expect(Interpretation.parse(JSON.parse(JSON.stringify(parsed)))).toEqual({
      ...base,
      result,
    });
  });

  test("values carry strings or numbers", () => {
    expect(
      InterpretationResult.parse({
        kind: "change",
        optionIndex: null,
        values: { endAt: "16:30", hours: 8 },
      }).values,
    ).toEqual({ endAt: "16:30", hours: 8 });
    expect(() =>
      InterpretationResult.parse({
        kind: "change",
        optionIndex: null,
        values: { ok: true },
      }),
    ).toThrow();
  });

  test("optionIndex is 1 to 4 or null, matching at most four options", () => {
    for (const optionIndex of [0, 5, 1.5]) {
      expect(() =>
        InterpretationResult.parse({ ...fixtures.confirm, optionIndex }),
      ).toThrow();
    }
  });

  test("confidence is between 0 and 1", () => {
    expect(() =>
      Interpretation.parse({
        ...base,
        confidence: 1.2,
        result: fixtures.confirm,
      }),
    ).toThrow();
  });

  test("follows the shared context: the result has no restatement field", () => {
    expect(Object.keys(InterpretationResult.shape).sort()).toEqual([
      "kind",
      "optionIndex",
      "values",
    ]);
    expect(Object.keys(Interpretation.shape).sort()).toEqual(
      [
        "confidence",
        "id",
        "messageId",
        "model",
        "needsFollowUp",
        "questionId",
        "result",
      ].sort(),
    );
  });
});
