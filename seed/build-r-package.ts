#!/usr/bin/env bun
// Company R package: ingest-r's anonymized output -> strict contract tables for `sync.ingestFixture`.
//   bun run seed/build-r-package.ts [--date 2026-10-25] [--current 2026-10-05..2026-10-18]
//     [--low-margin-pct N] [--employees-may-be-texted true|false] [--long-shift-hours N] [--gross-change-pct N]
//     [--roles data/private/r/roles.json] [--dry-run]
// Reads only data/private/r/out/*.json, data/private/r/m4-rules.json (optional) and data/private/r/real-tokens.txt.
// Writes only data/private/r/package-<date>/:
//   history/<table>.json   paid cycles (load with apps/web/scripts/ingest.ts <dir>)
//   current/<table>.json   history + the current unpaid cycle (a superset: load one folder, not both)
//   extras/                blocked.json, <table>.unloadable.json, ownerDraws.json (not tables; never loaded)
//   MANIFEST.md            counts, what is unloadable and why, check-fixtures output; "real, anonymized"
// Refuses to write anything if a real token (data/private/r/real-tokens.txt) appears in any output.
// Prints counts only (no names, no values).

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { findRealTokens } from "../packages/connectors/src/anonymize.ts";
import {
  buildRPackage,
  counts,
  type RPackage,
  type RRules,
} from "./lib/r-package";

export const REPO = resolve(import.meta.dir, "..");
export const R_DIR = join(REPO, "data", "private", "r");

const inside = (dir: string, p: string) => {
  const rel = relative(resolve(dir), resolve(p));
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
};

export type Files = Record<string, string>;

/** Every file of the package (relative path -> text), MANIFEST excluded. */
export function packageFiles(p: RPackage): Files {
  const files: Files = {};
  const j = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  for (const [folder, tables] of [
    ["history", p.history],
    ["current", p.current],
  ] as const)
    for (const [f, rows] of Object.entries(tables))
      files[`${folder}/${f}`] = j(rows);
  files["extras/blocked.json"] = j(p.blocked);
  files["extras/ownerDraws.json"] = j(p.ownerDraws);
  const byTable = new Map<string, RPackage["unloadable"]>();
  for (const u of p.unloadable)
    byTable.set(u.table, [...(byTable.get(u.table) ?? []), u]);
  for (const [t, rows] of byTable)
    files[`extras/${t}.unloadable.json`] = j({
      table: t,
      count: rows.length,
      rows,
    });
  return files;
}

export function manifest(
  p: RPackage,
  date: string,
  checks: Record<string, string>,
): string {
  const reasonCounts = new Map<string, number>();
  for (const u of p.unloadable)
    for (const r of u.reasons) {
      const k = `${u.table}: ${r.replace(/[a-z]+:[a-z]+:[A-Za-z0-9#:_-]+/g, "<id>")}`;
      reasonCounts.set(k, (reasonCounts.get(k) ?? 0) + 1);
    }
  const table = (folder: Record<string, unknown>) =>
    Object.entries(counts(folder as never))
      .map(([f, n]) => `| ${f} | ${n} |`)
      .join("\n");
  return `# Company R package ${date}: real, anonymized

Real data from Company R, anonymized by ingest-r: pseudonymous ids and names, no notes, no addresses. It is not synthetic. Built by \`seed/build-r-package.ts\` from \`data/private/r/out/*.json\`. Never commit it.

**Loading:** \`cd apps/web && bun run scripts/ingest.ts ../../data/private/r/package-${date}/history\` (or \`current\`). \`current\` is \`history\` plus the unpaid cycle; load one folder per deployment, not both.
${p.companyMissing.length ? `\n**NOT LOADABLE YET:** the company row is missing settings the exports don't carry: ${p.companyMissing.join(", ")}. Pass them as flags (e.g. \`--low-margin-pct\`), then rebuild.\n` : ""}
## history
| table | rows |
|---|---|
${table(p.history)}

## current
| table | rows |
|---|---|
${table(p.current)}

## Not loaded
- Blocked workers (role or pay type unknown; never guessed): ${p.blocked.length}. Reasons: ${JSON.stringify(Object.fromEntries(p.blocked.reduce((m, b) => m.set(b.reason, (m.get(b.reason) ?? 0) + 1), new Map<string, number>())))}
- Owner draws (not wages): ${p.ownerDraws.length} rows (extras/ownerDraws.json)
- Personal Venmo rows excluded: ${p.excluded.personalVenmo}
- Venmo rows with no contract table (tip, commission, referral, ...): ${JSON.stringify(p.excluded.venmoNotWage)}
- Duplicate ids across bundles (first kept): ${p.excluded.duplicateIds}
- Unloadable rows: ${p.unloadable.length}, by reason:
${
  [...reasonCounts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `  - ${n} × ${k}`)
    .join("\n") || "  - none"
}
- Source fields with no place in the contract (dropped): ${JSON.stringify(p.excluded.droppedFields)}
${p.notes.map((n) => `- Note: ${n}`).join("\n")}

## check-fixtures (packages/engine/scripts/check-fixtures.ts, strict)
${Object.entries(checks)
  .map(([d, out]) => `### ${d}\n\`\`\`\n${out.trim()}\n\`\`\``)
  .join("\n")}
`;
}

/** Refuses (throws) when any real token appears in any file. Returns the number of files checked. */
export function leakCheck(files: Files, tokens: string[]): number {
  const hits = Object.values(files).reduce(
    (n, text) => n + findRealTokens(text, tokens).length,
    0,
  );
  if (hits)
    throw new Error(
      `refusing to write: ${hits} real token hit(s) in the package`,
    );
  return Object.keys(files).length;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      date: { type: "string" },
      current: { type: "string" },
      roles: { type: "string" },
      "low-margin-pct": { type: "string" },
      "employees-may-be-texted": { type: "string" },
      "long-shift-hours": { type: "string" },
      "gross-change-pct": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  try {
    const date = values.date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error("--date must be YYYY-MM-DD");
    const [cs, ce] = (values.current ?? "2026-10-05..2026-10-18").split("..");
    const outDir = join(R_DIR, "out");
    const bundles = readdirSync(outDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(outDir, f), "utf8")));
    if (!bundles.every((b) => b.namesAnonymized === true))
      throw new Error(
        "refusing: an input bundle is not stamped namesAnonymized: true",
      );
    const rulesPath = join(R_DIR, "m4-rules.json");
    const rules = existsSync(rulesPath)
      ? (JSON.parse(readFileSync(rulesPath, "utf8")) as RRules)
      : null;
    if (values.roles && !inside(R_DIR, values.roles))
      throw new Error("--roles must be inside data/private/r/");
    const roles = values.roles
      ? JSON.parse(readFileSync(values.roles, "utf8"))
      : undefined;
    const num = (k: string) =>
      values[k as keyof typeof values] === undefined
        ? undefined
        : Number(values[k as keyof typeof values]);
    const texted = values["employees-may-be-texted"];
    const p = buildRPackage(bundles, rules, {
      current: { start: cs, end: ce },
      roles,
      settings: {
        lowMarginPct: num("low-margin-pct"),
        longShiftHours: num("long-shift-hours"),
        grossChangePct: num("gross-change-pct"),
        employeesMayBeTexted:
          texted === undefined ? undefined : texted === "true",
      },
    });
    const tokens = readFileSync(join(R_DIR, "real-tokens.txt"), "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const files = packageFiles(p);
    leakCheck(files, tokens);
    const pkg = join(R_DIR, `package-${date}`);
    if (!inside(R_DIR, pkg))
      throw new Error("output must stay inside data/private/r/");
    const checks: Record<string, string> = {};
    if (!values["dry-run"]) {
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(join(pkg, rel, ".."), { recursive: true, mode: 0o700 });
        writeFileSync(join(pkg, rel), text, { mode: 0o600 });
      }
      for (const d of ["history", "current"]) {
        const r = spawnSync(
          "bun",
          [
            "run",
            join(REPO, "packages/engine/scripts/check-fixtures.ts"),
            join(pkg, d),
          ],
          { encoding: "utf8" },
        );
        checks[d] = `${r.stdout}${r.stderr}exit ${r.status}`;
      }
      const m = manifest(p, date, checks);
      leakCheck({ "MANIFEST.md": m }, tokens);
      writeFileSync(join(pkg, "MANIFEST.md"), m, { mode: 0o600 });
    }
    console.log(`history: ${JSON.stringify(counts(p.history))}`);
    console.log(`current: ${JSON.stringify(counts(p.current))}`);
    console.log(
      `blocked workers ${p.blocked.length}, unloadable rows ${p.unloadable.length}, owner draws ${p.ownerDraws.length}, personal Venmo excluded ${p.excluded.personalVenmo}`,
    );
    if (p.companyMissing.length)
      console.log(
        `company row NOT written: missing ${p.companyMissing.join(", ")}`,
      );
    for (const [d, out] of Object.entries(checks))
      console.log(`check-fixtures ${d}: ${out.trim().split("\n").at(-1)}`);
    console.log(
      values["dry-run"]
        ? "dry run: nothing written"
        : `wrote ${relative(REPO, pkg)}`,
    );
  } catch (e) {
    console.error(`ERROR ${(e as Error).message}`);
    process.exit(1);
  }
}
