// bun run run.ts --company a --cycle a-c05 [--flags fixtures/flags.json] [--out results.json]
// Writes results.json (M1..M6). Flags default to the naive stand-in until B's eval.summary export exists.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixtures, loadFlags, REPO } from "./lib/io";
import { m2 } from "./m2-rules";
import { buildResults } from "./metrics";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const company = arg("company", "a");
const cycleId = arg("cycle", "a-c05");
const flagsPath = arg(
  "flags",
  join(import.meta.dirname, "fixtures/flags.json"),
);
const out = arg("out", join(import.meta.dirname, "results.json"));

let gitSha: string | null = null;
try {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO })
    .toString()
    .trim();
} catch {
  gitSha = null;
}

const results = buildResults({
  fx: loadFixtures(company),
  cycleId,
  flags: loadFlags(flagsPath),
  flagsSource: flagsPath.endsWith("fixtures/flags.json")
    ? "naive-fixture-checker (stand-in, not B's checks engine)"
    : flagsPath,
  m2: m2(),
  syntheticBacktest: loadFixtures("b"),
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
    `wrote ${out}`,
  ].join("\n"),
);
