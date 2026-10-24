// M2 rules vs. the owner's runbook. The grading file lives in data/private/r/rule-grading.json and never enters
// the repo; only counts leave this module. The format (eval/README.md) holds ids and a verdict, nothing else:
// the schema is strict and ids are short tokens, so rule or runbook text cannot pass through.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { REPO, readJson } from "./lib/io";

const Token = z.string().regex(/^[A-Za-z0-9:_.-]{1,40}$/, "an id, not text");

export const RuleGrading = z.array(
  z.strictObject({
    /** The learned Rule.id, or null when the runbook rule was not learned. */
    ruleId: Token.nullable(),
    /** The owner's runbook rule id (e.g. RB-07). */
    runbookId: Token,
    verdict: z.enum(["match", "differs", "not_learned"]),
  }),
);
export type RuleGrading = z.infer<typeof RuleGrading>;

export type M2 =
  | { status: "pending"; reason: string }
  | {
      status: "measured";
      total: number;
      match: number;
      differ: number;
      notLearned: number;
    };

export function m2FromGrades(input: unknown): M2 {
  const grades = RuleGrading.parse(input);
  for (const g of grades)
    if ((g.verdict === "not_learned") !== (g.ruleId === null))
      throw new Error(
        `runbook ${g.runbookId}: ruleId must be null exactly when not_learned`,
      );
  const n = (v: RuleGrading[number]["verdict"]) =>
    grades.filter((g) => g.verdict === v).length;
  return {
    status: "measured",
    total: grades.length,
    match: n("match"),
    differ: n("differs"),
    notLearned: n("not_learned"),
  };
}

export function m2(path = join(REPO, "data/private/r/rule-grading.json")): M2 {
  if (!existsSync(path))
    return {
      status: "pending",
      reason:
        "no data/private/r/rule-grading.json yet (Company R onboarding not graded)",
    };
  return m2FromGrades(readJson<unknown>(path));
}
