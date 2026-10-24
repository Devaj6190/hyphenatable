#!/usr/bin/env bun
// Gusto read connector CLI (demo API, read-only).
//   bun run packages/connectors/src/gusto/cli.ts auth [--redirect-uri http://localhost:3000/auth/gusto]
//   bun run packages/connectors/src/gusto/cli.ts employees|contractors|unprocessed --company a
//   bun run packages/connectors/src/gusto/cli.ts payrolls --company a --from 2026-07-01 --to 2026-10-10
// Env: GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET. Token: data/private/gusto-token.json. Never prints token values or names.

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import {
  compareGustoEmployees,
  formatCompare,
  loadFixtures,
  loadIdMap,
} from "../compare.ts";
import { fileTokenStore } from "../tokens.ts";
import type { SyncRun } from "../types.ts";
import {
  GUSTO_AUTHORIZE_URL,
  GUSTO_REDIRECT_URI,
  GUSTO_TOKEN_PATH,
  GustoClient,
  gustoAuthFromEnv,
  gustoTokenRequest,
} from "./client.ts";
import {
  companyUuidForToken,
  pullContractors,
  pullEmployees,
  pullPayrolls,
  pullUnprocessed,
} from "./read.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    "redirect-uri": { type: "string" },
    compare: { type: "string" },
  },
});

async function auth() {
  const redirectUri = values["redirect-uri"] ?? GUSTO_REDIRECT_URI;
  const a = { ...gustoAuthFromEnv(), redirectUri };
  const redirect = new URL(redirectUri);
  const state = randomBytes(16).toString("hex");
  const url = `${GUSTO_AUTHORIZE_URL}?${new URLSearchParams({ client_id: a.clientId, redirect_uri: redirectUri, response_type: "code", state })}`;
  const code = await new Promise<string>((done, fail) => {
    const server = createServer((r, w) => {
      const u = new URL(r.url ?? "/", redirectUri);
      if (u.pathname !== redirect.pathname) return void w.writeHead(404).end();
      const c = u.searchParams.get("code");
      const ok = c && u.searchParams.get("state") === state;
      w.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" }).end(
        ok
          ? "PayrollPilot: Gusto demo authorized. You can close this tab."
          : "State mismatch or no code.",
      );
      server.close();
      ok
        ? done(c)
        : fail(new Error("OAuth callback had no code or a bad state"));
    });
    server.listen(Number(redirect.port || 80), redirect.hostname, () =>
      console.log(
        `Open this URL and authorize the Gusto demo company:\n\n${url}\n\nWaiting on ${redirectUri} ...`,
      ),
    );
  });
  const store = fileTokenStore(GUSTO_TOKEN_PATH);
  await store.save(
    await gustoTokenRequest(a, { grant_type: "authorization_code", code }),
  );
  console.log(`Stored Gusto tokens in ${GUSTO_TOKEN_PATH} (gitignored).`);
  console.log(
    `Company uuid: ${await companyUuidForToken(new GustoClient({ ...a, tokenStore: store }))}`,
  );
}

function print(run: SyncRun, summary: string) {
  console.log(
    `${run.object}: pulled ${run.pulled}, expected ${run.expected ?? "null"}, complete ${run.complete}${run.error ? `, error: ${run.error}` : ""}`,
  );
  console.log(summary);
  if (!run.complete) process.exitCode = 1;
}

async function read(cmd: string) {
  const company = values.company;
  if (!company) throw new Error(`${cmd} needs --company`);
  const a = { ...gustoAuthFromEnv(), log: (l: string) => console.error(l) };
  const client = new GustoClient(a);
  const uuid = await companyUuidForToken(client);
  const opts = { client };
  if (cmd === "employees" || cmd === "contractors") {
    const r = await (cmd === "employees" ? pullEmployees : pullContractors)(
      a,
      company,
      uuid,
      opts,
    );
    const w = r.records.workers;
    print(
      r.syncRun,
      `active ${w.filter((x) => x.status === "active").length}; with rate ${w.filter((x) => x.gusto?.rateCents !== null).length}; not onboarded ${w.filter((x) => x.gusto?.onboarded === false).length}`,
    );
    if (values.compare && cmd === "employees") {
      const rows = compareGustoEmployees(
        w,
        await loadFixtures(values.compare),
        await loadIdMap(company, "gusto"),
      );
      console.log(`\n${formatCompare(rows)}`);
      if (rows.some((x) => x.missing || x.extra)) process.exitCode = 1;
    }
  } else if (cmd === "payrolls") {
    if (!values.from || !values.to)
      throw new Error("payrolls needs --from and --to (YYYY-MM-DD)");
    const r = await pullPayrolls(
      a,
      company,
      uuid,
      values.from,
      values.to,
      opts,
    );
    print(
      r.syncRun,
      r.records.payrolls
        .map(
          (p) =>
            `${p.sourceId} ${p.payrollType} ${p.periodStart}..${p.periodEnd} employees ${p.employees?.length ?? "?"}`,
        )
        .join("\n"),
    );
  } else {
    const r = await pullUnprocessed(a, company, uuid, opts);
    print(
      r.syncRun,
      r.records.payrolls
        .map(
          (p) =>
            `${p.sourceId} ${p.payrollType} ${p.periodStart}..${p.periodEnd}`,
        )
        .join("\n"),
    );
  }
}

const cmd = positionals[0] ?? "";
if (
  !["auth", "employees", "contractors", "payrolls", "unprocessed"].includes(cmd)
) {
  console.error(
    "usage: cli.ts auth | employees | contractors | unprocessed --company <id> | payrolls --company <id> --from <date> --to <date>",
  );
  process.exit(2);
}
(cmd === "auth" ? auth() : read(cmd)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
