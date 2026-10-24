// Push a company's QuickBooks expenses into the QuickBooks Online SANDBOX (A-06).
//
//   bun run seed/push-qbo.ts --company a [--verbose]      dry run (default): plan and counts. No network, no credentials.
//   bun run seed/push-qbo.ts init-token <refresh token>   store a sandbox refresh token (OAuth Playground) for the seed pusher
//   bun run seed/push-qbo.ts --company a --live           create what is missing (accounts/vendors/customers looked up first)
//   bun run seed/push-qbo.ts --company a --live --reseed  first delete OUR Purchases and Bills (PrivateNote marker) by API, then push
//
// Host: sandbox-quickbooks.api.intuit.com only. Never "Clear data and reset". Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET,
// QBO_REALM_ID. Id map: data/private/<company>-qbo-map.json (gitignored).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bucket, must } from "./lib/must";
import {
  buildQboPlan,
  PRIVATE_DIR,
  QBO_SEED_TOKEN_PATH,
  type QboFixtures,
  type QboIdMap,
  QboSeedClient,
  type QboStep,
  qboSeedAuthFromEnv,
  type Rec,
  readJsonOrNull,
  resolveQboRefs,
  writePrivateJson,
} from "./lib/qbo";

export const mapPath = (company: string) =>
  join(PRIVATE_DIR, `${company}-qbo-map.json`);

export function loadQbo(
  company: string,
  dir = join(import.meta.dir, "..", "data", "fixtures", company),
) {
  const read = (f: string) =>
    JSON.parse(readFileSync(join(dir, `${f}.json`), "utf8"));
  const fx: QboFixtures = { expenses: read("expenses"), jobs: read("jobs") };
  const cycles = read("cycles") as Rec[];
  const cur = cycles.find((c) => c.stage !== "closed") ?? must(cycles.at(-1));
  // periodStart is local midnight; the local date is the UTC date of periodStart + 12 h
  const currentPeriodStartDate = new Date(
    Date.parse(cur.periodStart as string) + 12 * 3600_000,
  )
    .toISOString()
    .slice(0, 10);
  const company_ = read("company") as Rec;
  return {
    fx,
    currentPeriodStartDate,
    currentCycleId: cur.id as string,
    companyName: String(company_.name).split(" (")[0],
  };
}

export function plan(company: string, map: QboIdMap) {
  const { fx, currentPeriodStartDate, companyName } = loadQbo(company);
  return {
    ...buildQboPlan(fx, map, { currentPeriodStartDate, companyName }),
    fx,
    currentPeriodStartDate,
  };
}

const OBJECTS: QboStep["object"][] = [
  "accounts",
  "vendors",
  "customers",
  "jobs",
  "purchases",
  "bills",
];

export function printDryRun(
  company: string,
  p: ReturnType<typeof plan>,
  map: QboIdMap,
  opts: { verbose: boolean; log?: (s: string) => void },
) {
  const log = opts.log ?? console.log;
  log(
    `DRY RUN: QuickBooks sandbox seed plan for company ${company}. No network calls, no credentials read.`,
  );
  log(
    `host: sandbox-quickbooks.api.intuit.com only. id map: ${mapPath(company)}`,
  );
  log("");
  log(
    "Counts (steps / already mapped):  [ensure = look up by name, create only if missing]",
  );
  for (const o of OBJECTS) {
    const n = p.steps.filter((s) => s.object === o).length;
    log(
      `  ${o.padEnd(10)} ${String(n).padStart(4)} / ${Object.keys(map[o] ?? {}).length}  ${o === "purchases" || o === "bills" ? "create (marked)" : "ensure"}`,
    );
  }
  const cur = p.fx.expenses.filter(
    (x) => x.source === "qbo" && (x.date as string) >= p.currentPeriodStartDate,
  );
  log(
    `  current cycle Purchases: ${cur.length} (from ${p.currentPeriodStartDate}); Bills: ${p.bills.join(", ")} (past cycles)`,
  );
  log("");
  log("Untagged purchases (no CustomerRef):");
  for (const s of p.steps.filter((x) => x.entity === "Purchase" && x.note))
    log(`  ${s.key} ${s.body.TxnDate as string} ${s.note}`);
  log("");
  log(
    opts.verbose
      ? "Request plan (all):"
      : "Request plan (first 2 per object; --verbose for all):",
  );
  for (const o of OBJECTS) {
    const list = p.steps.filter((s) => s.object === o);
    for (const s of opts.verbose ? list : list.slice(0, 2))
      log(`  ${s.mode} ${s.entity} ${s.key} ${JSON.stringify(s.body)}`);
    if (!opts.verbose && list.length > 2)
      log(`  ... ${list.length - 2} more ${o}`);
  }
  log("");
  log(
    "Re-seed (--live --reseed): deletes only Purchases/Bills whose PrivateNote carries payrollpilot:<id>, one by one via ?operation=delete. Customers, vendors and accounts are reused, never deleted. Never 'Clear data and reset'.",
  );
  log(
    `Acceptance after a live push: SELECT count(*) FROM Purchase WHERE TxnDate >= '${p.currentPeriodStartDate}' = ${cur.length}; a-ex-0003 has no CustomerRef.`,
  );
}

// ---------------------------------------------------------------- live

const MARKER_RE = /payrollpilot:([A-Za-z0-9_-]+)/;
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function selectAll(client: QboSeedClient, entity: string, where = "") {
  const out: Rec[] = [];
  for (let start = 1; ; start += 1000) {
    const r = await client.query(
      `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ""} STARTPOSITION ${start} MAXRESULTS 1000`,
    );
    const rows =
      ((r.QueryResponse as Rec | undefined)?.[entity] as Rec[] | undefined) ??
      [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Our transactions in the sandbox, found by scanning the fixture date range (PrivateNote is not filterable). */
async function ourTxns(client: QboSeedClient, from: string, to: string) {
  const found: {
    entity: "Purchase" | "Bill";
    id: string;
    syncToken: string;
    ourId: string;
  }[] = [];
  for (const entity of ["Purchase", "Bill"] as const) {
    for (const t of await selectAll(
      client,
      entity,
      `TxnDate >= '${from}' AND TxnDate <= '${to}'`,
    )) {
      const m = MARKER_RE.exec(String(t.PrivateNote ?? ""));
      if (m)
        found.push({
          entity,
          id: t.Id as string,
          syncToken: t.SyncToken as string,
          ourId: m[1],
        });
    }
  }
  return found;
}

async function live(company: string, opts: { reseed: boolean }) {
  const client = new QboSeedClient(qboSeedAuthFromEnv());
  const map: QboIdMap = readJsonOrNull<QboIdMap>(mapPath(company)) ?? {};
  const save = () => writePrivateJson(mapPath(company), map);
  const { fx } = loadQbo(company);
  const dates = fx.expenses
    .filter((x) => x.source === "qbo")
    .map((x) => x.date as string)
    .sort();
  const [from, to] = [dates[0], must(dates.at(-1))];

  const existing = await ourTxns(client, from, to);
  if (opts.reseed) {
    for (const t of existing) {
      await client.deleteTxn(t.entity, t.id, t.syncToken);
      console.log(`  deleted ${t.entity} ${t.id} (${t.ourId})`);
    }
    map.purchases = {};
    map.bills = {};
    save();
  } else {
    for (const t of existing)
      bucket(map, t.entity === "Bill" ? "bills" : "purchases")[t.ourId] = t.id;
    save();
  }

  const p = plan(company, map);
  let created = 0;
  for (const s of p.steps) {
    if (s.mode === "ensure" && s.lookup) {
      const rows = await selectAll(
        client,
        s.entity,
        `${s.lookup.field} = '${q(s.lookup.value)}'`,
      );
      if (rows.length > 1)
        throw new Error(
          `${s.entity} ${s.lookup.field}='${s.lookup.value}' is ambiguous (${rows.length} matches)`,
        );
      if (rows[0]) {
        if (
          s.requireMarker &&
          !String(rows[0].Notes ?? "").includes(s.requireMarker)
        ) {
          throw new Error(
            `${s.entity} '${s.lookup.value}' exists in the sandbox but is not ours (no ${s.requireMarker} in Notes); rename it or pick another sandbox company`,
          );
        }
        bucket(map, s.object)[s.key] = rows[0].Id as string;
        save();
        continue;
      }
    }
    const missing: string[] = [];
    const body = resolveQboRefs(s.body, map, missing) as Rec;
    if (missing.length)
      throw new Error(`${s.entity} ${s.key}: unresolved ${missing.join(", ")}`);
    const r = await client.create(s.entity, body);
    const id = (r[s.entity] as Rec | undefined)?.Id as string | undefined;
    if (!id) throw new Error(`${s.entity} ${s.key}: no Id in response`);
    bucket(map, s.object)[s.key] = id;
    save();
    created++;
  }
  console.log(
    `created ${created}, reused ${p.steps.length - created}; map saved to ${mapPath(company)}`,
  );
}

// ---------------------------------------------------------------- cli

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (f: string) => args.includes(`--${f}`);
  const val = (f: string) => {
    const i = args.indexOf(`--${f}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    if (args[0] === "init-token") {
      if (!args[1])
        throw new Error(
          "usage: bun run seed/push-qbo.ts init-token <refresh token>",
        );
      writePrivateJson(QBO_SEED_TOKEN_PATH, {
        accessToken: null,
        accessTokenExpiresAt: null,
        refreshToken: args[1],
      });
      console.log(
        `stored the QBO seed refresh token in ${QBO_SEED_TOKEN_PATH} (gitignored)`,
      );
    } else {
      const company = val("company");
      if (!company)
        throw new Error(
          "usage: bun run seed/push-qbo.ts --company <a|b> [--live [--reseed]] [--verbose]",
        );
      if (flag("live")) await live(company, { reseed: flag("reseed") });
      else {
        if (flag("reseed"))
          console.log(
            "(--reseed only applies with --live; showing the dry run)",
          );
        const map = readJsonOrNull<QboIdMap>(mapPath(company)) ?? {};
        printDryRun(company, plan(company, map), map, {
          verbose: flag("verbose"),
        });
      }
    }
  } catch (e) {
    console.error(`ERROR ${(e as Error).message}`);
    process.exit(1);
  }
}
