// bun run m2-run.ts [--grading data/private/r/rule-grading.json]
// M2: learned rules vs the owner's runbook. Prints counts only; ids and verdicts only are accepted, so rule
// or runbook text can never pass through (the schema rejects any other field).
import { join } from "node:path";
import { REPO } from "./lib/io";
import { m2 } from "./m2-rules";

const i = process.argv.indexOf("--grading");
const path =
  i >= 0 && process.argv[i + 1]
    ? process.argv[i + 1]
    : join(REPO, "data/private/r/rule-grading.json");
const r = m2(path);
console.log(
  r.status === "pending"
    ? `M2 pending: ${r.reason}`
    : `M2: ${r.match} of ${r.total} onboarding rules match the owner's runbook; ${r.differ} differ; ${r.notLearned} were not learned`,
);
