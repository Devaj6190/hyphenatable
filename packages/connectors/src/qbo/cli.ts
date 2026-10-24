#!/usr/bin/env bun
// QuickBooks read connector CLI (read-only, sandbox).
//   bun run packages/connectors/src/qbo/cli.ts init-token          # paste the OAuth Playground refresh token on stdin
//   bun run packages/connectors/src/qbo/cli.ts pull --company a --from 2026-10-11 --to 2026-10-24 [--out data/private/x.json]
// Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REALM_ID. Token file: data/private/qbo-token.json. Never prints token values.

import { writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  compareFailed,
  compareQbo,
  formatCompare,
  loadFixtures,
  loadIdMap,
} from "../compare.ts";
import { fileTokenStore } from "../tokens.ts";
import { QBO_TOKEN_PATH, qboAuthFromEnv } from "./client.ts";
import { pullExpenses } from "./index.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    cycle: { type: "string" },
    out: { type: "string" },
    compare: { type: "string" },
  },
});

async function initToken() {
  // stdin, not argv: keeps the token out of shell history and process lists
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const refreshToken = Buffer.concat(chunks).toString("utf8").trim();
  if (!refreshToken) throw new Error("no refresh token on stdin");
  await fileTokenStore(QBO_TOKEN_PATH).save({
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshToken,
  });
  console.log(
    `Stored the QBO refresh token in ${QBO_TOKEN_PATH} (gitignored).`,
  );
}

async function pull() {
  const { company, from, to } = values;
  if (!company || !from || !to)
    throw new Error("pull needs --company, --from and --to");
  const r = await pullExpenses(
    { ...qboAuthFromEnv(), log: (l) => console.error(l) },
    company,
    from,
    to,
    { cycleId: values.cycle ?? null },
  );
  console.log(`company ${company}  TxnDate ${from} .. ${to}`);
  console.log(
    `${"object".padEnd(10)}${"pulled".padStart(7)}${"expected".padStart(9)}${"complete".padStart(9)}  error`,
  );
  for (const s of r.syncRuns)
    console.log(
      `${s.object.padEnd(10)}${String(s.pulled).padStart(7)}${String(s.expected ?? "null").padStart(9)}${String(s.complete).padStart(9)}  ${s.error ?? ""}`,
    );
  const e = r.records.expenses;
  console.log(
    `\nexpense records ${e.length}: job-tagged ${e.filter((x) => x.customerRef).length}, seed-marked ${e.filter((x) => !/^(Purchase|Bill):/.test(x.sourceId)).length}`,
  );
  if (values.out) {
    const out = resolve(values.out);
    if (!out.includes(`${sep}data${sep}private${sep}`))
      throw new Error("--out must be under data/private/");
    await writeFile(out, JSON.stringify(r, null, 2));
    console.log(`wrote ${out}`);
  }
  if (values.compare) {
    const rows = compareQbo(
      r.records.expenses,
      await loadFixtures(values.compare),
      await loadIdMap(company, "qbo"),
      from,
      to,
    );
    console.log(`\n${formatCompare(rows)}`);
    if (compareFailed(rows)) process.exitCode = 1;
  }
  if (r.syncRuns.some((s) => !s.complete)) process.exitCode = 1;
}

const main =
  positionals[0] === "init-token"
    ? initToken
    : positionals[0] === "pull"
      ? pull
      : null;
if (!main) {
  console.error(
    "usage: cli.ts init-token < token | pull --company <id> --from YYYY-MM-DD --to YYYY-MM-DD [--cycle <id>] [--out data/private/…]",
  );
  process.exit(2);
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
