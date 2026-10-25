// bun run run.ts --company a --cycle a-c05 [--flags <export.json>] [--out results.json]
// Writes results.json (M1..M6 and the M3 learning curve). Flags come from the checks engine run on the
// fixtures with onboarding's rules approved (engine.ts); --flags scores an exported set instead.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { approve, engineFlags, inputFor, loadEngineFixtures } from "./engine";
import { loadFixtures, loadFlags, REPO, readJson } from "./lib/io";
import type { FlagLike } from "./lib/types";
import { m2 } from "./m2-rules";
import { LEARNED_A, learningCurve } from "./m3-learning";
import { M4Summary } from "./m4-r";

/** Counts only, written by m4-r-run.ts. */
const R_SUMMARY = join(REPO, "data/private/r/m4/summary.json");

import { buildResults } from "./metrics";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const company = arg("company", "a");
const cycleId = arg("cycle", "a-c05");
const flagsPath = arg("flags", "");
const out = arg("out", join(import.meta.dirname, "results.json"));

const fx = loadFixtures(company);
const efx = loadEngineFixtures(company);
const onboarding = efx.onboardingRules.map(approve);
const current = efx.cycles
  .filter((c) => c.stage !== "closed")
  .sort((a, b) => a.number - b.number)
  .map((c) => c.id);
const engineFlagsAll = current.flatMap(
  (c) => engineFlags(inputFor(efx, c, onboarding)) as unknown as FlagLike[],
);
const learning =
  company === "a" && current.length >= 2
    ? learningCurve(efx, fx.answerKey, LEARNED_A, [current[0], current[1]])
    : undefined;

function lastCompanyR() {
  if (!existsSync(out)) return null;
  const prev = M4Summary.safeParse(
    readJson<{ m4?: { companyR?: unknown } }>(out).m4?.companyR,
  );
  return prev.success ? prev.data : null;
}

let gitSha: string | null = null;
try {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO })
    .toString()
    .trim();
} catch {
  gitSha = null;
}

const results = buildResults({
  fx,
  cycleId,
  flags: flagsPath ? loadFlags(flagsPath) : engineFlagsAll,
  flagsSource: flagsPath
    ? flagsPath
    : "checks engine (packages/engine runAll + rule settling), onboarding rules owner-approved",
  allFlags: flagsPath ? undefined : engineFlagsAll,
  learning,
  m2: m2(),
  syntheticBacktest: loadFixtures("b"),
  // The summary exists only on the owner's machine; elsewhere the last measured counts carry forward.
  companyR: existsSync(R_SUMMARY)
    ? M4Summary.parse(readJson(R_SUMMARY))
    : lastCompanyR(),
  generatedAt: new Date().toISOString(),
  gitSha,
});
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
const { m1, m3, m4, m5, m6 } = results;
console.log(
  [
    `${company} ${cycleId} (${results.flagsSource})`,
    `M1 recall ${m1.recall.num}/${m1.recall.den}, precision ${m1.precision.num}/${m1.precision.den}`,
    `M3 expected questions ${m3.expectedFromAnswerKey.map((x) => `${x.cycleId} ${x.needAnswer}`).join(", ")}`,
    `M4 synthetic ${m4.syntheticSelfCheck?.exact}/${m4.syntheticSelfCheck?.workers} exact`,
    `M5 ${m5.runs.num}/${m5.runs.den} complete; M6 ${m6.traceable.num}/${m6.traceable.den} traceable`,
    ...(results.m1ByCycle ?? []).map(
      (c) =>
        `M1 ${c.cycleId} recall ${c.recall.num}/${c.recall.den}, precision ${c.precision.num}/${c.precision.den}${c.missedKeyRowIds.length ? `, missed ${c.missedKeyRowIds.join(" ")}` : ""}`,
    ),
    ...(results.learning?.curve ?? []).map(
      (c) =>
        `M3 ${c.scenario} ${c.cycleId}: ${c.outcomes.needs_person} need a person, ${c.outcomes.rule_backed} rule-backed, ${c.outcomes.settled} settled (${c.rules} rules)`,
    ),
    `wrote ${out}`,
  ].join("\n"),
);
