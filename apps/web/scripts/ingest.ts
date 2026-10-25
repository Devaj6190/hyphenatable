// Loads a company into Convex through sync.ingestFixture.
//   bun run scripts/ingest.ts            → the engine's sample company
//   bun run scripts/ingest.ts ../../data/fixtures/a   → A's fixture folder (<table>.json, plus company.json)
//   bun run scripts/ingest.ts ../../data/fixtures/a ../../data/fixtures/a/cycles/a-c06   → A with cycle 2: each
//     extension file adds its rows onto the same-named base file (data/fixtures/README.md, "Loading")
// Answer keys are never loaded: answer-key.json, flags.json (the flags the checks should raise) and rules.json
// (the rules onboarding should propose). Loading them would plant the expected output as if the product made it.
// Needs NEXT_PUBLIC_CONVEX_URL (written by `convex dev` to .env.local) and INGEST_KEY (same value as in Convex env).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sample } from "@payrollpilot/engine/__fixtures__/sample";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const ANSWER_KEYS = new Set(["answer-key.json", "flags.json", "rules.json"]);

function readFolder(dir: string): Record<string, unknown[]> {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !ANSWER_KEYS.has(f))
      .map((f) => {
        const rows = JSON.parse(readFileSync(join(dir, f), "utf8"));
        // A's files are named by table, except company.json (one object).
        const table = f === "company.json" ? "companies" : f.slice(0, -5);
        return [table, Array.isArray(rows) ? rows : [rows]];
      }),
  );
}

const dirs = process.argv.slice(2);
const fixture: Record<string, unknown[]> = dirs.length
  ? dirs.map(readFolder).reduce((base, ext) => {
      for (const [table, rows] of Object.entries(ext))
        base[table] = [...(base[table] ?? []), ...rows];
      return base;
    })
  : (sample as unknown as Record<string, unknown[]>);

console.log(
  Object.entries(fixture)
    .map(([table, rows]) => `${table} ${rows.length}`)
    .join(", "),
);

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const ingestKey = process.env.INGEST_KEY;
if (!url || !ingestKey)
  throw new Error("set NEXT_PUBLIC_CONVEX_URL and INGEST_KEY");

const ids = await new ConvexHttpClient(url).mutation(api.sync.ingestFixture, {
  ingestKey,
  fixture,
});
const named = (table: string) =>
  ((fixture[table] ?? []) as { id: string }[])
    .map((r) => `${r.id} → ${ids[r.id]}`)
    .join(", ");
console.log(
  `ingested ${Object.values(fixture).flat().length} records\ncompanies: ${named("companies")}\ncycles: ${named("cycles")}`,
);
