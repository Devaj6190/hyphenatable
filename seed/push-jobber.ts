// Push a company's fixtures into the allowlisted Jobber seed account through the seed app (A-05).
//
//   bun run seed/push-jobber.ts --company a                 dry run (default): plan, counts, manual checklists. No network, no credentials.
//   bun run seed/push-jobber.ts --company a --live --one    live: create ONE past-dated entry (and what it needs) to test back-dating
//   bun run seed/push-jobber.ts --company a --live          live: everything not yet in data/private/a-jobber-map.json
//   bun run seed/push-jobber.ts auth-url | auth-code <code> one-time seed-app authorization (a person opens the URL)
//
// Live mode refuses to run unless the authorized account id equals JOBBER_SEED_ACCOUNT_ID (or Jobber reports
// it as a developer tester account). Idempotent:
// every record carries `payrollpilot:<id>`; the id map in data/private/ is updated after each create, and
// existing markers in the account are discovered before anything is written. Never touches the read app's token.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPlan,
  type Fixtures,
  type IdMap,
  MUTATIONS,
  OBJECTS,
  type PlanResult,
  partitionSupported,
  QUERIES,
  resolveRefs,
  type Step,
} from "./lib/jobber-mutations";
import {
  authorizeUrl,
  exchangeCode,
  PRIVATE_DIR,
  readJsonOrNull,
  SeedClient,
  seedAuthFromEnv,
  writePrivateJson,
} from "./lib/jobber-seed-client";
import { bucket, must } from "./lib/must";

const FIXTURE_FILES = [
  "workers",
  "timeEntries",
  "jobs",
  "visits",
  "quotes",
  "invoices",
  "payments",
  "expenses",
] as const;

export function loadFixtures(
  company: string,
  dir = join(import.meta.dir, "..", "data", "fixtures", company),
): { fx: Fixtures; company: Record<string, unknown>; currentCycleId: string } {
  const read = (f: string) =>
    JSON.parse(readFileSync(join(dir, `${f}.json`), "utf8"));
  const fx = Object.fromEntries(
    FIXTURE_FILES.map((f) => [f, read(f)]),
  ) as Fixtures;
  const cycles = read("cycles") as Record<string, unknown>[];
  const current =
    cycles.find((c) => c.stage !== "closed") ?? must(cycles.at(-1));
  return { fx, company: read("company"), currentCycleId: current.id as string };
}

export const mapPath = (company: string) =>
  join(PRIVATE_DIR, `${company}-jobber-map.json`);

export function plan(company: string, map: IdMap): PlanResult {
  const { fx, company: co, currentCycleId } = loadFixtures(company);
  return buildPlan(fx, map, {
    currentCycleId,
    companyName: String(co.name).split(" (")[0],
    timezone: String(co.timezone),
  });
}

/** Steps needed for one target step, dependencies first (for --one). */
export function closure(steps: Step[], target: Step, map: IdMap): Step[] {
  const byKey = new Map(steps.map((s) => [`${s.object}:${s.ourId}`, s]));
  const producer: Record<string, string> = {
    clients: "clients",
    properties: "properties",
    quotes: "quotes",
    jobs: "jobs",
    visits: "visits",
    invoices: "invoices",
  };
  const out: Step[] = [];
  const seen = new Set<string>();
  const visit = (s: Step) => {
    const k = `${s.object}:${s.ourId}`;
    if (seen.has(k)) return;
    seen.add(k);
    const refs: string[] = [];
    JSON.stringify(s.variables, (_, v) => {
      if (v && typeof v === "object" && "$ref" in v) refs.push(v.$ref);
      return v;
    });
    for (const r of refs) {
      const [kind, ...rest] = r.split(":");
      const id = rest.join(":");
      if (kind === "users" || map[kind as keyof IdMap]?.[id]) continue;
      const dep = byKey.get(`${producer[kind]}:${id}`);
      if (dep) visit(dep);
    }
    out.push(s);
  };
  visit(target);
  return out;
}

export function printDryRun(
  company: string,
  p: PlanResult,
  map: IdMap,
  opts: { verbose: boolean; log?: (s: string) => void },
) {
  const log = opts.log ?? console.log;
  log(
    `DRY RUN: Jobber seed plan for company ${company}. No network calls, no credentials read.`,
  );
  log(
    `id map: ${mapPath(company)} (${Object.values(map).reduce((n, m) => n + Object.keys(m ?? {}).length, 0)} ids already mapped)`,
  );
  log("");
  log("Manual steps BEFORE the push (no user-create mutation exists):");
  for (const l of p.manual.before) log(l);
  log("");
  log("Counts (to create / already mapped):");
  for (const o of OBJECTS) {
    const n = p.steps.filter((s) => s.object === o).length;
    log(
      `  ${o.padEnd(15)} ${String(n).padStart(4)} / ${Object.keys(map[o] ?? {}).length}`,
    );
  }
  log(`  ${"total".padEnd(15)} ${String(p.steps.length).padStart(4)}`);
  if (p.skipped.length) {
    log("Not pushed:");
    for (const s of p.skipped) log(`  ${s.object} ${s.ourId}: ${s.reason}`);
  }
  log("");
  log(
    opts.verbose
      ? "Mutation plan (all steps):"
      : "Mutation plan (first 2 per object; --verbose for all):",
  );
  for (const o of OBJECTS) {
    const list = p.steps.filter((s) => s.object === o);
    for (const s of opts.verbose ? list : list.slice(0, 2)) {
      log(
        `  ${s.mutation} ${s.ourId} ${JSON.stringify(s.variables)}${s.note ? `  # ${s.note}` : ""}`,
      );
    }
    if (!opts.verbose && list.length > 2)
      log(`  ... ${list.length - 2} more ${o}`);
  }
  log("");
  log("Manual steps AFTER the push:");
  for (const l of p.manual.after) log(l);
}

// ---------------------------------------------------------------- live

const get = (o: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (x, k) => (x == null ? x : (x as Record<string, unknown>)[k]),
      o,
    );
const MARKER_RE = /payrollpilot:([a-z0-9-]+)/;

async function paginate(
  client: SeedClient,
  query: string,
  root: string,
  vars: Record<string, unknown> = {},
) {
  const nodes: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (;;) {
    const r = await client.gql(query, { ...vars, after });
    if (r.errors.length)
      throw new Error(`${root}: ${r.errors.map((e) => e.message).join("; ")}`);
    const conn = r.data?.[root] as {
      nodes: Record<string, unknown>[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
    nodes.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) return nodes;
    after = conn.pageInfo.endCursor;
  }
}

/**
 * Refuses (throws) unless the authorized account id equals JOBBER_SEED_ACCOUNT_ID. There is no fallback:
 * the live schema has no Account.tester field, so an unset variable always refuses. The refusal prints the
 * account id and name so it can be copied into .env.
 */
export async function requireAllowedAccount(
  client: Pick<SeedClient, "gql">,
  env: Record<string, string | undefined> = process.env,
): Promise<{ id: string; name: string }> {
  const r = await client.gql(QUERIES.account);
  const account = r.data?.account as { id: string; name: string } | undefined;
  if (!account?.id)
    throw new Error(
      `account query failed: ${r.errors.map((e) => e.message).join("; ")}`,
    );
  const allowed = env.JOBBER_SEED_ACCOUNT_ID?.trim();
  if (allowed && account.id === allowed) return account;
  throw new Error(
    `REFUSED: authorized Jobber account id=${account.id} name="${account.name}" is not allowlisted. ` +
      (allowed
        ? `JOBBER_SEED_ACCOUNT_ID is set to a different account (${allowed}).`
        : "JOBBER_SEED_ACCOUNT_ID is not set.") +
      " If this is the PayrollPilot seed account, set JOBBER_SEED_ACCOUNT_ID to this id in .env and rerun.",
  );
}

/** Mutation names in the token's schema (read-only introspection). */
export async function availableMutations(
  client: Pick<SeedClient, "gql">,
): Promise<Set<string>> {
  const r = await client.gql(QUERIES.mutationNames);
  const fields = (
    (r.data?.__type as { fields?: { name: string }[] } | undefined)?.fields ??
    []
  ).map((f) => f.name);
  if (!fields.length)
    throw new Error(
      `could not read the Mutation type: ${r.errors.map((e) => e.message).join("; ")}`,
    );
  return new Set(fields);
}

/** The --one target: the earliest record of the first supported kind (entries, then visits, then jobs). */
export function oneTarget(steps: Step[]): Step | undefined {
  const when = (s: Step): string => {
    const input = s.variables.input as Record<string, unknown> | undefined;
    if (s.object === "entries") return String(input?.startAt);
    if (s.object === "visits") {
      const v = (input?.visits as Record<string, unknown>[])[0]
        .schedule as Record<string, Record<string, string>>;
      return `${v.startAt.date}T${v.startAt.time}`;
    }
    return s.ourId;
  };
  for (const kind of ["entries", "visits", "jobs"]) {
    const list = steps
      .filter((s) => s.object === kind)
      .sort((a, b) => when(a).localeCompare(when(b)));
    if (list.length) return list[0];
  }
  return undefined;
}

async function live(company: string, opts: { one: boolean }) {
  const auth = seedAuthFromEnv();
  const client = new SeedClient(auth);
  const account = await requireAllowedAccount(client);
  console.log(
    `account ${account.id} "${account.name}" allowed (JOBBER_SEED_ACCOUNT_ID)`,
  );

  const map: IdMap = readJsonOrNull<IdMap>(mapPath(company)) ?? {};
  const save = () => writePrivateJson(mapPath(company), map);
  const { fx } = loadFixtures(company);

  // users: no create mutation; map by display name (manual step adds them)
  const users = [
    ...(await paginate(client, QUERIES.users, "users", {
      status: "ACTIVATED",
    })),
    ...(await paginate(client, QUERIES.users, "users", {
      status: "DEACTIVATED",
    })),
  ];
  map.users = {};
  const missing: string[] = [];
  for (const w of fx.workers) {
    const u = users.find(
      (x) => (x.name as { full: string }).full === w.displayName,
    );
    if (u) map.users[w.id as string] = u.id as string;
    else missing.push(`${w.displayName} (${w.id})`);
  }
  save();
  if (missing.length) {
    console.error(
      `STOP: ${missing.length} worker(s) not found as Jobber users: ${missing.join(", ")}. Add them in Manage Team (dry run prints the checklist).`,
    );
    process.exit(4);
  }

  // what this token can create; the rest is skipped and recorded, never refused silently
  const available = await availableMutations(client);
  const first = partitionSupported(plan(company, map).steps, available);
  const pushing = new Set(first.run.map((s) => s.object as string));
  map.skipped = {
    checkedAt: new Date().toISOString(),
    accountId: account.id,
    objects: first.skipped,
  };
  save();
  for (const [object, r] of Object.entries(first.skipped)) {
    console.log(
      `SKIPPED ${object}: ${r.count} record(s); ${r.reason} (${r.mutations.join(", ")})`,
    );
  }

  // discover markers already in the account for what we push (a lost map file never causes duplicates)
  const discover = (
    kind: keyof IdMap,
    nodes: Record<string, unknown>[],
    field: string,
  ) => {
    for (const n of nodes) {
      const m = MARKER_RE.exec(String(n[field] ?? ""));
      if (m) bucket(map, kind)[m[1]] = n.id as string;
    }
  };
  if (pushing.has("entries")) {
    const starts = fx.timeEntries.map((e) => e.startAt as string).sort();
    discover(
      "entries",
      await paginate(client, QUERIES.entries, "timeSheetEntries", {
        from: starts[0],
        to: new Date(
          Date.parse(must(starts.at(-1))) + 86_400_000,
        ).toISOString(),
      }),
      "note",
    );
  }
  if (pushing.has("jobs"))
    discover("jobs", await paginate(client, QUERIES.jobs, "jobs"), "title");
  if (pushing.has("expenses"))
    discover(
      "expenses",
      await paginate(client, QUERIES.expenses, "expenses"),
      "title",
    );
  if (pushing.has("clients"))
    discover(
      "clients",
      await paginate(client, QUERIES.clients, "clients"),
      "companyName",
    );
  if (pushing.has("quotes"))
    discover(
      "quotes",
      await paginate(client, QUERIES.quotes, "quotes"),
      "title",
    );
  if (pushing.has("invoices"))
    discover(
      "invoices",
      await paginate(client, QUERIES.invoices, "invoices"),
      "subject",
    );
  save();

  const p = plan(company, map);
  let steps = partitionSupported(p.steps, available).run;
  if (opts.one) {
    const target = oneTarget(steps);
    if (!target) {
      console.log("--one: nothing left to create");
      return;
    }
    steps = closure(steps, target, map);
    console.log(
      `--one: creating ${target.object} ${target.ourId} and ${steps.length - 1} record(s) it needs`,
    );
  }

  let done = 0;
  for (const s of steps) {
    const missingRefs: string[] = [];
    const variables = resolveRefs(s.variables, map, missingRefs) as Record<
      string,
      unknown
    >;
    if (missingRefs.length)
      throw new Error(
        `${s.object} ${s.ourId}: unresolved ${missingRefs.join(", ")}`,
      );
    const r = await client.gql(MUTATIONS[s.mutation], variables);
    const payload = r.data?.[s.mutation] as
      | { userErrors?: { message: string }[] }
      | undefined;
    const errs = [
      ...r.errors.map((e) => e.message),
      ...(payload?.userErrors ?? []).map((e) => e.message),
    ];
    if (errs.length)
      throw new Error(
        `${s.mutation} ${s.ourId}: ${errs.join("; ")} (check the input shape in GraphiQL on the seed app)`,
      );
    const id = s.idPath
      ? (get(r.data, s.idPath) as string | undefined)
      : undefined;
    bucket(map, s.object)[s.ourId] = id ?? "done";
    save();
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${steps.length}`);
  }
  console.log(`created ${done} record(s); map saved to ${mapPath(company)}`);
  if (!opts.one) {
    console.log("\nManual steps AFTER the push:");
    for (const l of p.manual.after) console.log(l);
  }
}

/** The redirected address for auth-code: argument, else PASTED_URL, else stdin. */
export async function pastedAddress(
  arg: string | undefined,
  env: Record<string, string | undefined>,
  readStdin: () => Promise<string> = () => Bun.stdin.text(),
): Promise<string> {
  const v = arg ?? env.PASTED_URL ?? (await readStdin());
  if (!v?.trim())
    throw new Error("no address given: pipe it on stdin or set PASTED_URL");
  return v.trim();
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
    if (args[0] === "auth-url") {
      console.log(
        `Open this URL as the seed account admin and approve:\n${authorizeUrl(seedAuthFromEnv().clientId, val("redirect"))}\n\n` +
          "The browser lands on the callback page. Copy the WHOLE address from the address bar, then either:\n" +
          "  pbpaste | bun run seed/push-jobber.ts auth-code        (stdin)\n" +
          "  PASTED_URL='<address>' bun run seed/push-jobber.ts auth-code\n" +
          "The code is single-use and expires within minutes.",
      );
    } else if (args[0] === "auth-code") {
      await exchangeCode(
        seedAuthFromEnv(),
        await pastedAddress(args[1], process.env),
      );
      console.log("seed-app token saved under data/private/");
    } else {
      const company = val("company");
      if (!company)
        throw new Error(
          "usage: bun run seed/push-jobber.ts --company <a|b> [--live [--one]] [--verbose]",
        );
      if (flag("live")) await live(company, { one: flag("one") });
      else {
        const map = readJsonOrNull<IdMap>(mapPath(company)) ?? {};
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
