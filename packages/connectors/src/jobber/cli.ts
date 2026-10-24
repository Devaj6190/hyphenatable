#!/usr/bin/env bun
// Jobber connector CLI (read-only).
//   bun run packages/connectors/src/jobber/cli.ts auth [--account r] [--paste] [--redirect-uri https://payrollpilot.vercel.app/auth]
//     (hosted callback -> paste mode: open the printed URL, then paste the landed address, or PASTED_URL=… on a rerun)
//   bun run packages/connectors/src/jobber/cli.ts pull --company a --from 2026-10-11 --to 2026-10-24 [--tz America/Los_Angeles] [--cycle a-c05] [--out data/private/x.json]
// Env: JOBBER_CLIENT_ID, JOBBER_CLIENT_SECRET. Tokens: data/private/jobber-token.json (trial/tester account) or,
// with --account r, data/private/r/jobber-token.json (Company R's real account). Company R data is pulled
// only through ingest-r.ts (anonymized), so `pull` refuses --account r. Never prints token values or names.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import {
  compareJobber,
  formatCompare,
  loadFixtures,
  loadIdMap,
} from "../compare.ts";
import { resolvePeriod } from "../time.ts";
import { privatePath } from "../tokens.ts";
import {
  authFromEnv,
  fileTokenStore,
  type JobberAccount,
  jobberTokenPath,
} from "./client.ts";
import { pullCycle } from "./index.ts";
import {
  buildAuthorizeUrl,
  codeFromPastedRedirect,
  DEFAULT_REDIRECT_URI,
  exchangeCode,
  type PendingAuth,
} from "./oauth.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    tz: { type: "string" },
    cycle: { type: "string" },
    out: { type: "string" },
    compare: { type: "string" },
    "redirect-uri": { type: "string" },
    account: { type: "string" },
    paste: { type: "boolean" },
  },
});

const account = (values.account ?? "trial") as JobberAccount;
if (account !== "trial" && account !== "r") {
  console.error("--account must be trial or r");
  process.exit(2);
}
const tokenPath = jobberTokenPath(account);

const pendingPath = privatePath(
  account === "r" ? "r/jobber-oauth-pending.json" : "jobber-oauth-pending.json",
);

async function readStdinLine(): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return "";
}

/**
 * Paste flow (the callback is a hosted page, not localhost): print the authorize URL, keep state + PKCE
 * verifier in data/private/ (0600), then take the full redirected address from PASTED_URL or stdin.
 * If PASTED_URL is set and a fresh pending file exists, it exchanges directly (second invocation).
 */
async function authPaste(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
) {
  let pending: PendingAuth | null = null;
  if (process.env.PASTED_URL) {
    try {
      pending = JSON.parse(await readFile(pendingPath, "utf8")) as PendingAuth;
    } catch {}
  }
  if (!pending) {
    const req = buildAuthorizeUrl(clientId, redirectUri);
    pending = {
      state: req.state,
      codeVerifier: req.codeVerifier,
      redirectUri,
      createdAt: new Date().toISOString(),
    };
    await mkdir(dirname(pendingPath), { recursive: true });
    await writeFile(pendingPath, JSON.stringify(pending), { mode: 0o600 });
    console.log(
      "Open this URL in a browser and authorize the Jobber account:\n",
    );
    console.log(req.url);
    console.log(
      `\nThen copy the full address of the page it lands on (${redirectUri}?code=…&state=…).`,
    );
    if (process.env.PASTED_URL)
      throw new Error(
        "PASTED_URL was set but no pending authorization existed; authorize with the URL above, then set PASTED_URL again",
      );
    console.log(
      "Paste it here and press Enter (or rerun with PASTED_URL=… within 10 minutes):",
    );
  }
  const pasted = process.env.PASTED_URL ?? (await readStdinLine());
  const code = codeFromPastedRedirect(pasted, pending);
  const tokens = await exchangeCode({
    clientId,
    clientSecret,
    code,
    codeVerifier: pending.codeVerifier,
    redirectUri: pending.redirectUri,
  });
  await fileTokenStore(tokenPath).save(tokens);
  await rm(pendingPath, { force: true });
  console.log(
    `Stored Jobber tokens (${account} account) in ${tokenPath} (gitignored).`,
  );
}

async function auth() {
  const { clientId, clientSecret } = authFromEnv();
  const redirectUri = values["redirect-uri"] ?? DEFAULT_REDIRECT_URI;
  const redirect = new URL(redirectUri);
  // a hosted callback cannot reach this process: paste mode
  if (values.paste || !["localhost", "127.0.0.1"].includes(redirect.hostname))
    return authPaste(clientId, clientSecret, redirectUri);
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
      w.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" }).end(
        ok
          ? "PayrollPilot: Jobber authorized. You can close this tab."
          : "State mismatch or no code.",
      );
      server.close();
      ok
        ? done(c)
        : fail(new Error("OAuth callback had no code or a bad state"));
    });
    server.listen(Number(redirect.port || 80), redirect.hostname, () => {
      console.log(
        "Open this URL in a browser and authorize the Jobber account:\n",
      );
      console.log(req.url);
      console.log(`\nWaiting for the redirect on ${redirectUri} ...`);
    });
  });
  const tokens = await exchangeCode({
    clientId,
    clientSecret,
    code,
    codeVerifier: req.codeVerifier,
    redirectUri,
  });
  await fileTokenStore(tokenPath).save(tokens);
  console.log(
    `Stored Jobber tokens (${account} account) in ${tokenPath} (gitignored).`,
  );
}

async function pull() {
  const { company, from, to } = values;
  if (!company || !from || !to)
    throw new Error("pull needs --company, --from and --to");
  if (account === "r")
    throw new Error(
      "Company R is pulled only through ingest-r.ts --source jobber-api (anonymized)",
    );
  const result = await pullCycle(
    {
      ...authFromEnv(),
      tokenStore: fileTokenStore(tokenPath),
      log: (l) => console.error(l),
    },
    company,
    from,
    to,
    {
      timezone: values.tz ?? "UTC",
      cycleId: values.cycle ?? null,
    },
  );
  console.log(
    `company ${company}  period ${from} .. ${to}  tz ${values.tz ?? "UTC"}`,
  );
  console.log(
    [
      "object".padEnd(18),
      "pulled".padStart(7),
      "expected".padStart(9),
      "complete".padStart(9),
      "  error",
    ].join(""),
  );
  for (const r of result.syncRuns) {
    console.log(
      [
        r.object.padEnd(18),
        String(r.pulled).padStart(7),
        String(r.expected ?? "null").padStart(9),
        String(r.complete).padStart(9),
        `  ${r.error ?? ""}`,
      ].join(""),
    );
  }
  const e = result.records.timeEntries;
  console.log(
    `\nworkers ${result.records.workers.length} (active ${result.records.workers.filter((w) => w.status === "active").length}); ` +
      `entries ${e.length}: ticking ${e.filter((x) => x.ticking).length}, unapproved ${e.filter((x) => !x.approved).length}, no job ${e.filter((x) => !x.jobId && !x.visitId).length}`,
  );
  if (values.out) {
    const out = resolve(values.out);
    // Records carry display names; only data/private/ (gitignored) may hold them on disk.
    if (!out.includes(`${sep}data${sep}private${sep}`))
      throw new Error("--out must be under data/private/");
    await writeFile(out, JSON.stringify(result, null, 2));
    console.log(`wrote ${out}`);
  }
  if (values.compare) {
    const rows = compareJobber(
      result.records,
      await loadFixtures(values.compare),
      await loadIdMap(company, "jobber"),
      resolvePeriod(from, to, values.tz ?? "UTC"),
    );
    console.log(`\n${formatCompare(rows)}`);
    if (rows.some((r) => r.missing || r.extra)) process.exitCode = 1;
  }
  if (result.syncRuns.some((r) => !r.complete)) process.exitCode = 1;
}

const cmd = positionals[0];
const main = cmd === "auth" ? auth : cmd === "pull" ? pull : null;
if (!main) {
  console.error(
    "usage: cli.ts auth | pull --company <id> --from <date> --to <date> [--tz <IANA>] [--cycle <id>] [--out data/private/…]",
  );
  process.exit(2);
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
