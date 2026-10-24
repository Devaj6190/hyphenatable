// bun run make-flags.ts [--company a]: writes fixtures/flags.json, the naive stand-in flags for every
// current cycle. Replace with B's eval.summary export when it exists.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixtures } from "./lib/io";
import { naiveFlags } from "./naive-checks";

const i = process.argv.indexOf("--company");
const company = i >= 0 ? process.argv[i + 1] : "a";
const fx = loadFixtures(company);
const flags = fx.cycles
  .filter((c) => c.stage !== "closed")
  .flatMap((c) => naiveFlags(fx, c.id));
const out = join(import.meta.dirname, "fixtures/flags.json");
writeFileSync(out, `${JSON.stringify(flags, null, 2)}\n`);
console.log(`${flags.length} naive flags → ${out}`);
