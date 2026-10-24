// Loads a company into Convex through sync.ingestFixture.
//   bun run scripts/ingest.ts            → the engine's sample company
//   bun run scripts/ingest.ts ../../data/fixtures/a   → A's fixture folder (one <table>.json per table)
// Needs NEXT_PUBLIC_CONVEX_URL (written by `convex dev` to .env.local) and INGEST_KEY (same value as in Convex env).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sample } from "@payrollpilot/engine/__fixtures__/sample";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const dir = process.argv[2];
const fixture: Record<string, unknown[]> = dir
  ? Object.fromEntries(
      readdirSync(dir)
        .filter((f) => f.endsWith(".json") && f !== "answer-key.json")
        .map((f) => [
          f.slice(0, -5),
          JSON.parse(readFileSync(join(dir, f), "utf8")),
        ]),
    )
  : (sample as unknown as Record<string, unknown[]>);

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const ingestKey = process.env.INGEST_KEY;
if (!url || !ingestKey)
  throw new Error("set NEXT_PUBLIC_CONVEX_URL and INGEST_KEY");

const ids = await new ConvexHttpClient(url).mutation(api.sync.ingestFixture, {
  ingestKey,
  fixture,
});
const companies = (fixture.companies as { id: string }[]).map(
  (c) => `${c.id} → ${ids[c.id]}`,
);
console.log(
  `ingested ${Object.keys(ids).length} records; companies: ${companies.join(", ")}`,
);
