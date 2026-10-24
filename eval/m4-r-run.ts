// bun run m4-r-run.ts [--private data/private/r] [--rules <private>/m4-rules.json] [--corrections <private>/corrections.json]
//                     [--from YYYY-MM-DD --to YYYY-MM-DD]   (the timesheet export window; default: min/max entry date)
// Company R backtest. Reads ingest-r's anonymized output (<private>/out/*.json), writes explain trails and a
// counts-only summary under <private>/m4/, and prints counts only. Refuses any directory outside data/private/.
// Only pay periods fully inside the timesheet export window are compared; the rest are counted as
// "not compared (outside the timesheet export window)".
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { REPO, readJson } from "./lib/io";
import {
  AnonBundle,
  backtestR,
  type M4Summary,
  mergeBundles,
  RCorrections,
  RSetup,
} from "./m4-r";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function insidePrivate(dir: string, repo = REPO): boolean {
  const rel = relative(join(repo, "data/private"), resolve(dir));
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

export function runM4R(
  privateDir: string,
  rulesPath: string,
  correctionsPath: string,
  now: Date,
  window?: { from?: string; to?: string },
): M4Summary {
  if (!insidePrivate(privateDir))
    throw new Error("the Company R directory must be inside data/private/");
  for (const d of [window?.from, window?.to])
    if (d !== undefined && !DAY.test(d))
      throw new Error("--from/--to must be YYYY-MM-DD");
  const outDir = join(privateDir, "out");
  const files = existsSync(outDir)
    ? readdirSync(outDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];
  if (!files.length) throw new Error(`no ingest-r output in ${outDir}`);
  const bundle = mergeBundles(
    files.map((f) => AnonBundle.parse(readJson(join(outDir, f)))),
  );
  const setup = RSetup.parse(readJson(rulesPath));
  const corrections = existsSync(correctionsPath)
    ? RCorrections.parse(readJson(correctionsPath))
    : null;
  const r = backtestR(bundle, setup, corrections, window);
  const dir = join(privateDir, "m4");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  writeFileSync(
    join(dir, `trails-${stamp}.json`),
    JSON.stringify(r.trails, null, 2),
    { mode: 0o600 },
  );
  const summary: M4Summary = {
    status: "measured",
    measuredAt: now.toISOString(),
    rulesSource: setup.source,
    periods: r.periods.length,
    window: r.window,
    coverage: r.coverage,
    notes: r.notes,
    pre: r.pre,
    post: r.post,
  };
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2), {
    mode: 0o600,
  });
  return summary;
}

export function describeSummary(s: M4Summary): string[] {
  const line = (name: string, p: M4Summary["pre"] | null) =>
    p
      ? [
          `${name}: ${p.exact} of ${p.compared} exact, ${p.within100} within $1 (${p.withinRounding} explained by 2-dp entry rounding), max diff ${p.maxDiffCents}¢, ${p.unmatched} unmatched${Object.entries(
            p.separate,
          )
            .map(([why, n]) => `; ${n} not compared (${why})`)
            .join("")}`,
          ...p.perPeriod
            .filter((x) => x.coverage === "full")
            .map(
              (x) =>
                `  ${x.period}: ${x.exact} of ${x.compared} exact, ${x.within100} within $1 (${x.withinRounding} rounding), max diff ${x.maxDiffCents}¢`,
            ),
        ]
      : [`${name}: no corrections file`];
  return [
    `Company R, ${s.periods} pay periods; timesheet window ${s.window ? `${s.window.from}..${s.window.to} (${s.window.source})` : "none"}: ${s.coverage.full} fully covered, ${s.coverage.partial} partly, ${s.coverage.none} not covered; rules ${s.rulesSource}`,
    ...line("pre-correction", s.pre),
    ...line("post-correction", s.post),
    ...s.notes.map((n) => `note: ${n}`),
    "trails and summary under <private>/m4/",
  ];
}

if (import.meta.main) {
  const privateDir = arg("private", join(REPO, "data/private/r"));
  const from = arg("from", "");
  const to = arg("to", "");
  const s = runM4R(
    privateDir,
    arg("rules", join(privateDir, "m4-rules.json")),
    arg("corrections", join(privateDir, "corrections.json")),
    new Date(),
    { from: from || undefined, to: to || undefined },
  );
  console.log(describeSummary(s).join("\n"));
}
