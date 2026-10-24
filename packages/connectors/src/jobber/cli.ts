#!/usr/bin/env bun
// Jobber connector CLI (read-only).
//   bun run packages/connectors/src/jobber/cli.ts auth [--redirect-uri http://localhost:3000/auth]
//   bun run packages/connectors/src/jobber/cli.ts pull --company a --from 2026-10-11 --to 2026-10-24 [--tz America/Los_Angeles] [--cycle a-c05] [--out data/private/x.json]
// Env: JOBBER_CLIENT_ID, JOBBER_CLIENT_SECRET. Tokens live in data/private/jobber-token.json. Never prints token values or names.

import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { authFromEnv, DEFAULT_TOKEN_PATH, fileTokenStore } from "./client.ts";
import { pullCycle } from "./index.ts";
import { buildAuthorizeUrl, DEFAULT_REDIRECT_URI, exchangeCode } from "./oauth.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    tz: { type: "string" },
    cycle: { type: "string" },
    out: { type: "string" },
    "redirect-uri": { type: "string" },
  },
});

async function auth() {
  const { clientId, clientSecret } = authFromEnv();
  const redirectUri = values["redirect-uri"] ?? DEFAULT_REDIRECT_URI;
  const redirect = new URL(redirectUri);
  const req = buildAuthorizeUrl(clientId, redirectUri);
  const code = await new Promise<string>((done, fail) => {
    const server = createServer((r, w) => {
      const u = new URL(r.url ?? "/", redirectUri);
      if (u.pathname !== redirect.pathname) {
        w.writeHead(404).end();
        return;
      }
      const c = u.searchParams.get("code");
      const ok = c && u.searchParams.get("state") === req.state;
      w.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" }).end(ok ? "PayrollPilot: Jobber authorized. You can close this tab." : "State mismatch or no code.");
      server.close();
      ok ? done(c) : fail(new Error("OAuth callback had no code or a bad state"));
    });
    server.listen(Number(redirect.port || 80), redirect.hostname, () => {
      console.log("Open this URL in a browser and authorize the Jobber account:\n");
      console.log(req.url);
      console.log(`\nWaiting for the redirect on ${redirectUri} ...`);
    });
  });
  const tokens = await exchangeCode({ clientId, clientSecret, code, codeVerifier: req.codeVerifier, redirectUri });
  await fileTokenStore().save(tokens);
  console.log(`Stored Jobber tokens in ${DEFAULT_TOKEN_PATH} (gitignored).`);
}

async function pull() {
  const { company, from, to } = values;
  if (!company || !from || !to) throw new Error("pull needs --company, --from and --to");
  const result = await pullCycle({ ...authFromEnv(), log: (l) => console.error(l) }, company, from, to, {
    timezone: values.tz ?? "UTC",
    cycleId: values.cycle ?? null,
  });
  console.log(`company ${company}  period ${from} .. ${to}  tz ${values.tz ?? "UTC"}`);
  console.log(["object".padEnd(18), "pulled".padStart(7), "expected".padStart(9), "complete".padStart(9), "  error"].join(""));
  for (const r of result.syncRuns) {
    console.log([r.object.padEnd(18), String(r.pulled).padStart(7), String(r.expected ?? "null").padStart(9), String(r.complete).padStart(9), `  ${r.error ?? ""}`].join(""));
  }
  const e = result.records.timeEntries;
  console.log(
    `\nworkers ${result.records.workers.length} (active ${result.records.workers.filter((w) => w.status === "active").length}); ` +
      `entries ${e.length}: ticking ${e.filter((x) => x.ticking).length}, unapproved ${e.filter((x) => !x.approved).length}, no job ${e.filter((x) => !x.jobId && !x.visitId).length}`,
  );
  if (values.out) {
    const out = resolve(values.out);
    // Records carry display names; only data/private/ (gitignored) may hold them on disk.
    if (!out.includes(`${sep}data${sep}private${sep}`)) throw new Error("--out must be under data/private/");
    await writeFile(out, JSON.stringify(result, null, 2));
    console.log(`wrote ${out}`);
  }
  if (result.syncRuns.some((r) => !r.complete)) process.exitCode = 1;
}

const cmd = positionals[0];
const main = cmd === "auth" ? auth : cmd === "pull" ? pull : null;
if (!main) {
  console.error("usage: cli.ts auth | pull --company <id> --from <date> --to <date> [--tz <IANA>] [--cycle <id>] [--out data/private/…]");
  process.exit(2);
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
