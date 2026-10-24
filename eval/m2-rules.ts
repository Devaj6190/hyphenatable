// M2 rules vs. the owner's runbook. The grading file lives in data/private/r/rule-grading.json and never enters
// the repo; only counts leave this function.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO, readJson } from "./lib/io";

export type M2 =
  | { status: "pending"; reason: string }
  | {
      status: "measured";
      total: number;
      match: number;
      differ: number;
      notLearned: number;
    };

type Grade = {
  ruleId: string | null;
  runbookId: string;
  verdict: "match" | "differs" | "not_learned";
};

export function m2FromGrades(grades: Grade[]): M2 {
  const n = (v: Grade["verdict"]) =>
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
  return m2FromGrades(readJson<Grade[]>(path));
}
