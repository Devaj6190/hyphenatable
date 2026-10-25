#!/usr/bin/env bun
// Browser Use connector CLI (read-only).
//   bun run packages/connectors/src/browser/cli.ts login [--profile <id>]
//     opens a cloud browser on the profile (a new one when --profile is absent); log in to Jobber yourself at
//     the printed live URL, press Enter, and the login is saved to the profile. Prints the profile id.
//   bun run packages/connectors/src/browser/cli.ts approvals --company a --from 2026-10-10 --to 2026-10-23 [--tz America/New_York] [--cycle a-c05] [--out x.json]
// Env (local shell only, never the repo): BROWSER_USE_API_KEY, BROWSER_USE_PROFILE_ID (for approvals).
// Writes data/private/browser/<company>-approvals-<from>-<to>.json; prints counts only.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { privatePath } from "../tokens.ts";
import { call } from "./client.ts";
import { readJobberApprovals } from "./jobber-approvals.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    tz: { type: "string" },
    cycle: { type: "string" },
    out: { type: "string" },
    profile: { type: "string" },
  },
});

const apiKey = process.env.BROWSER_USE_API_KEY;
if (!apiKey) {
  console.error("BROWSER_USE_API_KEY is not set");
  process.exit(2);
}

if (positionals[0] === "login") {
  const profileId =
    values.profile ??
    (
      (await call({ apiKey }, "POST", "/profiles", { name: "jobber" })) as {
        id: string;
      }
    ).id;
  const b = (await call({ apiKey }, "POST", "/browsers", {
    profileId,
    timeout: 15,
  })) as { id: string; liveUrl: string | null };
  console.log(`profile ${profileId}\nlog in to Jobber here: ${b.liveUrl}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Press Enter once you are logged in…");
  rl.close();
  await call({ apiKey }, "PATCH", `/browsers/${b.id}`, { action: "stop" });
  console.log(
    `saved. set BROWSER_USE_PROFILE_ID=${profileId} in your shell (not the repo).`,
  );
} else if (positionals[0] === "approvals") {
  const { company, from, to } = values;
  const profileId = process.env.BROWSER_USE_PROFILE_ID;
  if (!company || !from || !to || !profileId) {
    console.error(
      "need --company, --from, --to and BROWSER_USE_PROFILE_ID (run `login` first)",
    );
    process.exit(2);
  }
  // The agent sees the page, names included (AGENTS.md: the model never receives names). Synthetic only.
  if (company === "r") {
    console.error(
      "refused: Company R is real; the browser agent would see names. Needs the owner's OK first.",
    );
    process.exit(2);
  }
  const out = await readJobberApprovals({
    apiKey,
    profileId,
    companyId: company,
    cycleId: values.cycle ?? null,
    from,
    to,
    timezone: values.tz ?? "America/New_York",
  });
  const path = values.out
    ? resolve(values.out)
    : privatePath(`browser/${company}-approvals-${from}-${to}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(out, null, 2)}\n`);
  const r = out.syncRun;
  const approved = out.facts.filter((f) => f.approved).length;
  console.log(
    `${r.object}: pulled ${r.pulled}, expected ${r.expected ?? "?"}, complete ${r.complete} (${r.method})`,
  );
  console.log(
    `approved ${approved}, unapproved ${out.facts.length - approved}, with entry id ${out.facts.filter((f) => f.entryId).length}, with user id ${out.facts.filter((f) => f.jobberUserId).length}`,
  );
  if (r.error) console.log(`problems: ${r.error}`);
  console.log(`wrote ${path}`);
  process.exit(r.complete ? 0 : 1);
} else {
  console.error("usage: cli.ts login | approvals (see the header)");
  process.exit(2);
}
