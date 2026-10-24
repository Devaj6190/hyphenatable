// Map a company's workers onto the Gusto DEMO company (A-07).
//
//   bun run seed/push-gusto.ts --company a                 dry run (default): mapping plan. No network, no credentials.
//   bun run seed/push-gusto.ts --company a --live          map employees by uuid order, set compensations, create the new hire,
//                                                           find the unprocessed regular payroll; writes data/private/a-gusto-map.json
//   bun run seed/push-gusto.ts --company a --apply-map     copy the map's uuids into seed/companies/a.json (then regenerate fixtures)
//
// Host: api.gusto-demo.com only (A1's client). Header X-Gusto-API-Version 2026-06-15. Token: A1's
// data/private/gusto-token.json (run `packages/connectors/src/gusto/cli.ts auth` once). Never writes a payroll:
// no prepare, update, calculate or submit. Does not depend on the demo company's name.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUSTO_TOKEN_PATH,
  GustoClient,
  gustoAuthFromEnv,
} from "../packages/connectors/src/gusto/client.ts";
import { companyUuidForToken } from "../packages/connectors/src/gusto/read.ts";
import { fileTokenStore } from "../packages/connectors/src/tokens.ts";
import {
  assignExisting,
  buildGustoPlan,
  type GustoMap,
  type GustoPlan,
  GustoSeedWriter,
  pickPayroll,
  WRITE_ALLOWLIST,
} from "./lib/gusto";
import { must } from "./lib/must";
import { PRIVATE_DIR, readJsonOrNull, writePrivateJson } from "./lib/qbo";

type Rec = Record<string, unknown>;
export const mapPath = (company: string) =>
  join(PRIVATE_DIR, `${company}-gusto-map.json`);
const fixtureDir = (company: string) =>
  join(import.meta.dir, "..", "data", "fixtures", company);
const configPath = (company: string) =>
  join(import.meta.dir, "companies", `${company}.json`);

export function loadGusto(company: string) {
  const read = (f: string) =>
    JSON.parse(readFileSync(join(fixtureDir(company), `${f}.json`), "utf8"));
  const workers = read("workers") as Rec[];
  const cycles = read("cycles") as Rec[];
  const cur = cycles.find((c) => c.stage !== "closed") ?? must(cycles.at(-1));
  // periodStart is local midnight and periodEnd the last ms of the local Saturday: +/-12 h lands on the local date
  const date = (iso: string, h: number) =>
    new Date(Date.parse(iso) + h * 3600_000).toISOString().slice(0, 10);
  return {
    workers,
    cycleStart: date(cur.periodStart as string, 12),
    cycleEnd: date(cur.periodEnd as string, -12),
    currentCycleId: cur.id as string,
  };
}

export function printDryRun(
  company: string,
  p: GustoPlan,
  map: GustoMap,
  cycle: { start: string; end: string },
  log: (s: string) => void = console.log,
) {
  log(
    `DRY RUN: Gusto demo mapping for company ${company}. No network calls, no credentials read.`,
  );
  log(
    `host: api.gusto-demo.com only; X-Gusto-API-Version 2026-06-15; token: ${GUSTO_TOKEN_PATH} (A1's)`,
  );
  log(
    `map: ${mapPath(company)} (${Object.keys(map.workers ?? {}).length} workers mapped)`,
  );
  log("");
  log(
    "1. Read employees (include=all_compensations) and contractors. The demo company is found from the token (GET /v1/token_info), never by name.",
  );
  const existing = p.targets.filter((t) => t.source === "existing");
  log(
    `2. Assign ${existing.length} onboarded demo employees by uuid order to: ${existing.map((t) => t.workerId).join(", ")}`,
  );
  log(
    "3. Set compensations (PUT /v1/compensations/{uuid} with the current version):",
  );
  for (const t of p.targets) {
    const c = t.compensation;
    log(
      `   ${t.workerId} ${t.displayName}: ${c ? `rate ${c.rate} per ${c.paymentUnit}, ${c.flsaStatus}` : "no rate in config: left as the demo has it"}${t.workerId === "a-w02" ? "  (deliberately $1/h below Jobber: CHK-10)" : ""}`,
    );
  }
  for (const t of p.targets.filter((x) => x.source === "new_hire")) {
    log(
      `4. New hire ${t.workerId} ${t.displayName}: POST /v1/companies/{c}/employees (+ a job), onboarding left unfinished (CHK-09). If creation is refused, take a demo employee whose onboarding is not complete.`,
    );
  }
  log("   Not sent to Gusto:");
  for (const s of p.skipped) log(`   ${s.workerId}: ${s.reason}`);
  log(
    `5. Find the unprocessed regular payroll covering ${cycle.start}..${cycle.end} (GET only) and record its uuid as the cycle's gustoPayrollId.`,
  );
  log("");
  log(
    `Write endpoints allowed: ${WRITE_ALLOWLIST.map((a) => `${a.method} ${a.re.source}`).join(" | ")}. Any payroll write is refused; submit is never called.`,
  );
  log(
    `After a live run: bun run seed/push-gusto.ts --company ${company} --apply-map && bun run seed/generate.ts --company ${company} (then update the hash in seed/__tests__/generate.test.ts).`,
  );
}

// ---------------------------------------------------------------- live

async function live(company: string) {
  const store = fileTokenStore(GUSTO_TOKEN_PATH);
  const reader = new GustoClient({
    ...gustoAuthFromEnv(),
    tokenStore: store,
    log: console.log,
  });
  const writer = new GustoSeedWriter(reader, store);
  const { workers, cycleStart, cycleEnd } = loadGusto(company);
  const p = buildGustoPlan(workers);
  const map: GustoMap = readJsonOrNull<GustoMap>(mapPath(company)) ?? {};
  const save = () => writePrivateJson(mapPath(company), map);

  const companyUuid = await companyUuidForToken(reader);
  if (map.companyUuid && map.companyUuid !== companyUuid)
    throw new Error(
      `map is for Gusto company ${map.companyUuid}, token is for ${companyUuid}; refusing to mix`,
    );
  map.companyUuid = companyUuid;
  const c = encodeURIComponent(companyUuid);
  const employees = (
    await reader.getAll<Rec>(`/v1/companies/${c}/employees`, {
      include: "all_compensations",
      terminated: "false",
    })
  ).rows as never[];
  const contractors = (
    await reader.getAll<Rec>(`/v1/companies/${c}/contractors`)
  ).rows;
  console.log(
    `demo company ${companyUuid}: ${employees.length} active employees, ${contractors.length} contractors`,
  );

  // existing employees by uuid order
  const already = Object.fromEntries(
    Object.entries(map.workers ?? {}).map(([w, v]) => [w, v.employeeUuid]),
  );
  const assigned = assignExisting(p.targets, employees, already);
  map.workers ??= {};
  const byUuid = new Map(
    (employees as Rec[]).map((e) => [e.uuid as string, e]),
  );

  // new hire: reuse by name, else create (+ job), else an existing not-onboarded employee
  for (const t of p.targets.filter((x) => x.source === "new_hire")) {
    if (map.workers[t.workerId]) continue;
    const [first, ...rest] = t.displayName.split(" ");
    const last = rest.join(" ");
    let emp = (employees as Rec[]).find(
      (e) => e.first_name === first && e.last_name === last,
    );
    if (!emp) {
      try {
        emp = await writer.send("POST", `/v1/companies/${c}/employees`, {
          first_name: first,
          last_name: last,
        });
        const job = await writer.send(
          "POST",
          `/v1/employees/${encodeURIComponent(emp.uuid as string)}/jobs`,
          { title: "Field crew", hire_date: cycleStart },
        );
        emp.jobs = [job];
      } catch (e) {
        console.log(
          `  new hire create refused (${(e as Error).message}); using a demo employee with unfinished onboarding`,
        );
        const used = new Set(Object.values(assigned));
        emp = (employees as Rec[]).find(
          (x) =>
            x.onboarded === false &&
            x.terminated !== true &&
            !used.has(x.uuid as string),
        );
        if (!emp)
          throw new Error(
            `no way to plant ${t.workerId} (CHK-09): create refused and no unfinished-onboarding employee exists`,
          );
      }
    }
    assigned[t.workerId] = emp.uuid as string;
    byUuid.set(emp.uuid as string, emp);
  }

  // compensations
  for (const t of p.targets) {
    const emp = must(byUuid.get(assigned[t.workerId]));
    const job =
      ((emp.jobs as Rec[] | undefined) ?? []).find((j) => j.primary) ??
      (emp.jobs as Rec[] | undefined)?.[0];
    const comps = (job?.compensations as Rec[] | undefined) ?? [];
    const comp =
      comps.find((x) => x.uuid === job?.current_compensation_uuid) ?? comps[0];
    map.workers[t.workerId] = {
      employeeUuid: emp.uuid as string,
      jobUuid: (job?.uuid as string) ?? null,
      compensationUuid: (comp?.uuid as string) ?? null,
    };
    save();
    if (!t.compensation) continue;
    if (!comp)
      throw new Error(
        `${t.workerId}: employee ${emp.uuid} has no compensation to update`,
      );
    await writer.send(
      "PUT",
      `/v1/compensations/${encodeURIComponent(comp.uuid as string)}`,
      {
        version: comp.version,
        rate: t.compensation.rate,
        payment_unit: t.compensation.paymentUnit,
        flsa_status: t.compensation.flsaStatus,
      },
    );
    console.log(
      `  ${t.workerId} -> ${emp.uuid}: ${t.compensation.rate}/${t.compensation.paymentUnit}`,
    );
  }

  // the unprocessed regular payroll for the current cycle (read only)
  const payrolls = (
    await reader.get<Rec[]>(`/v1/companies/${c}/payrolls`, {
      processing_statuses: "unprocessed",
      payroll_types: "regular",
    })
  ).body;
  const pick = pickPayroll(payrolls, cycleStart, cycleEnd);
  map.gustoPayrollId = pick.uuid;
  save();
  console.log(
    pick.uuid
      ? `current-cycle payroll: ${pick.uuid}`
      : `no unprocessed regular payroll covers ${cycleEnd}; candidates: ${pick.candidates.join("; ") || "none"}`,
  );
  console.log(
    `map saved to ${mapPath(company)}. Next: --apply-map, then regenerate fixtures.`,
  );
}

/** Copies the map's uuids into the generator config (seed/companies/<company>.json). Never edits generated files. */
export function applyMap(
  company: string,
  map: GustoMap,
  path = configPath(company),
): number {
  const cfg = JSON.parse(readFileSync(path, "utf8")) as {
    workers: Rec[];
    current: Rec;
  };
  let n = 0;
  for (const w of cfg.workers) {
    const id = `${company}-w${String(w.n).padStart(2, "0")}`;
    const m = map.workers?.[id];
    if (!m) continue;
    w.gustoIds = { employeeUuid: m.employeeUuid, jobUuid: m.jobUuid };
    n++;
  }
  if (map.gustoPayrollId !== undefined)
    cfg.current.gustoPayrollId = map.gustoPayrollId;
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  return n;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (f: string) => {
    const i = args.indexOf(`--${f}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    const company = val("company");
    if (!company)
      throw new Error(
        "usage: bun run seed/push-gusto.ts --company <a|b> [--live | --apply-map]",
      );
    if (args.includes("--live")) await live(company);
    else if (args.includes("--apply-map")) {
      const map = readJsonOrNull<GustoMap>(mapPath(company));
      if (!map)
        throw new Error(`no map at ${mapPath(company)}; run --live first`);
      console.log(
        `applied ${applyMap(company, map)} worker uuid(s) to ${configPath(company)}; now run bun run seed/generate.ts --company ${company}`,
      );
    } else {
      const { workers, cycleStart, cycleEnd } = loadGusto(company);
      printDryRun(
        company,
        buildGustoPlan(workers),
        readJsonOrNull<GustoMap>(mapPath(company)) ?? {},
        { start: cycleStart, end: cycleEnd },
      );
    }
  } catch (e) {
    console.error(`ERROR ${(e as Error).message}`);
    process.exit(1);
  }
}
