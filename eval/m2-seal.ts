// bun run m2-seal.ts encrypt|decrypt [--in <file>] [--out <file>]
//   encrypt: runbook-key.json      → runbook-key.json.enc (default paths under data/private/r/)
//   decrypt: runbook-key.json.enc  → runbook-key.json      (only for the owner's own review; m2-grade decrypts in memory)
// Passphrase: M2_KEY_PASSPHRASE or a hidden prompt. Never logged.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "./lib/io";
import { passphrase, seal, unseal } from "./lib/seal";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

if (import.meta.main) {
  const mode = process.argv[2];
  const plainPath = join(REPO, "data/private/r/runbook-key.json");
  const encPath = `${plainPath}.enc`;
  const pass = await passphrase();
  if (mode === "encrypt") {
    const out = arg("out", encPath);
    writeFileSync(
      out,
      `${JSON.stringify(seal(readFileSync(arg("in", plainPath)), pass), null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(`sealed → ${out}`);
  } else if (mode === "decrypt") {
    const out = arg("out", plainPath);
    writeFileSync(
      out,
      unseal(JSON.parse(readFileSync(arg("in", encPath), "utf8")), pass),
      { mode: 0o600 },
    );
    console.log(`unsealed → ${out}`);
  } else {
    console.error("usage: m2-seal.ts encrypt|decrypt [--in file] [--out file]");
    process.exit(2);
  }
}
