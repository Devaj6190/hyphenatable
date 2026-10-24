#!/usr/bin/env bun
// Company R ingest (A-09): real data -> anonymized, normalized JSON in data/private/r/out/. Prints counts only.
// Writing into Convex is B's loader.
//   exports:    bun run packages/connectors/src/ingest-r.ts --tz America/Los_Angeles \
//                 --timesheets data/private/r/<file>.xlsx [...] --journal data/private/r/<file>.csv [...] [--dry-run]
//   jobber-api: bun run packages/connectors/src/ingest-r.ts --source jobber-api --tz America/Los_Angeles \
//                 --from 2026-09-27 --to 2026-10-10 [--dry-run]
//               (needs `jobber/cli.ts auth --account r` once; token data/private/r/jobber-token.json)
// Enforced in code, not by convention:
//   - export inputs must be inside data/private/r/; output goes only to data/private/r/out/
//   - the API mode uses Company R's own token file, never the trial account's
//   - nothing is written unless it is stamped namesAnonymized: true AND contains no real token
//   - file names (which can carry names) never reach the output: files are tagged by content hash
//   - salt, pseudonym map and real-token list stay in data/private/r/ (0600); never printed

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  Anonymizer,
  anonymizeExports,
  anonymizeJobberPull,
  chartWordsOf,
  findRealTokens,
  loadOrCreateSalt,
  type PseudonymMap,
} from "./anonymize.ts";
import { readGustoPayrollJournalCsv } from "./exports/gusto-payroll-journal-csv.ts";
import { readJobberTimesheetsXlsx } from "./exports/jobber-timesheets-xlsx.ts";
import { readQboXlsx } from "./exports/qbo-xlsx.ts";
import {
  authFromEnv,
  DEFAULT_TOKEN_PATH,
  fileTokenStore,
  JobberClient,
} from "./jobber/client.ts";
import { pullCycle } from "./jobber/index.ts";
import { privatePath } from "./tokens.ts";
import type { SyncRun } from "./types.ts";

export const R_PRIVATE_DIR = privatePath("r");

export interface IngestOptions {
  privateDir: string;
  companyId?: string;
  timezone: string;
  timesheets: string[];
  journals: string[];
  /** QBO Excel exports (.xlsx or the Export data zip) */
  qbo?: string[];
  dryRun?: boolean;
  now?: () => Date;
}

type RunCount = {
  object: string;
  pulled: number;
  expected: number | null;
  complete: boolean;
};
export interface IngestCounts {
  workers: number;
  clients: number;
  jobs: number;
  timeEntries: number;
  paidRows: number;
  expenses: number;
  syncRuns: RunCount[];
  outPath: string | null;
}

const inside = (dir: string, p: string) => {
  const rel = relative(resolve(dir), resolve(p));
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
};
const runCounts = (runs: SyncRun[]): RunCount[] =>
  runs.map((s) => ({
    object: s.object,
    pulled: s.pulled,
    expected: s.expected,
    complete: s.complete,
  }));

/** The only door to disk for Company R output. Refuses un-anonymized payloads and any real token. */
export function assertSafeToWrite(
  payload: unknown,
  realTokens: string[],
): string {
  if (
    (payload as { namesAnonymized?: unknown } | null)?.namesAnonymized !== true
  ) {
    throw new Error(
      "refusing to write: payload is not anonymized (namesAnonymized !== true)",
    );
  }
  const json = JSON.stringify(payload, null, 2);
  const leaks = findRealTokens(json, realTokens);
  // the count only: printing the tokens would print real names
  if (leaks.length)
    throw new Error(
      `refusing to write: anonymization check found ${leaks.length} real token(s) in the output`,
    );
  return json;
}

const writePrivate = (path: string, content: string) =>
  writeFile(path, content, { mode: 0o600 });

async function openAnonymizer(privateDir: string): Promise<Anonymizer> {
  const salt = await loadOrCreateSalt(join(privateDir, "salt"));
  let map: PseudonymMap | undefined;
  try {
    map = JSON.parse(
      await readFile(join(privateDir, "pseudonyms.json"), "utf8"),
    ) as PseudonymMap;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return new Anonymizer(salt, map);
}

/** Check, then (unless dry run) persist map + token list and write the payload to out/. Returns the out path. */
async function persist(
  privateDir: string,
  a: Anonymizer,
  payload: { namesAnonymized: true },
  name: string,
  dryRun?: boolean,
  chartWords?: Set<string>,
): Promise<string | null> {
  const tokens = a.realTokens(chartWords);
  const json = assertSafeToWrite(payload, tokens);
  if (dryRun) return null;
  await mkdir(join(privateDir, "out"), { recursive: true, mode: 0o700 });
  const outPath = join(privateDir, "out", `${name}.json`);
  await writePrivate(
    join(privateDir, "pseudonyms.json"),
    JSON.stringify(a.map, null, 2),
  );
  await writePrivate(
    join(privateDir, "real-tokens.txt"),
    `${tokens.join("\n")}\n`,
  );
  await writePrivate(outPath, json);
  return outPath;
}

const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, "-");

export async function ingestR(o: IngestOptions): Promise<IngestCounts> {
  const companyId = o.companyId ?? "r";
  const now = o.now ?? (() => new Date());
  for (const p of [...o.timesheets, ...o.journals, ...(o.qbo ?? [])]) {
    if (!inside(o.privateDir, p))
      throw new Error(`input must be inside the private dir (${o.privateDir})`);
  }
  const a = await openAnonymizer(o.privateDir);

  const syncRuns: SyncRun[] = [];
  const tagged = async (p: string) => {
    const bytes = await readFile(p);
    return {
      bytes,
      fileTag: createHash("sha256").update(bytes).digest("hex").slice(0, 10),
    };
  };
  // file names are replaced by the content tag in every SyncRun.method
  const scrub = (run: SyncRun, reader: string, fileTag: string): SyncRun => ({
    ...run,
    method: `export ${reader} file:${fileTag}`,
  });

  const timesheets = [];
  for (const p of o.timesheets) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readJobberTimesheetsXlsx(bytes, {
      companyId,
      timezone: o.timezone,
      fileName: fileTag,
      now,
    });
    syncRuns.push(scrub(r.syncRun, "jobber-timesheets-xlsx", fileTag));
    timesheets.push({ fileTag, rows: r.rows });
  }
  const journals = [];
  for (const p of o.journals) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readGustoPayrollJournalCsv(
      { text: bytes.toString("utf8"), fileName: fileTag },
      { companyId, now },
    );
    syncRuns.push(scrub(r.syncRun, "gusto-payroll-journal-csv", fileTag));
    journals.push({ fileTag, rows: r.rows });
  }

  const qbo = [];
  for (const p of o.qbo ?? []) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readQboXlsx(
      { bytes: new Uint8Array(bytes), fileName: fileTag },
      { companyId, now },
    );
    // scrub also drops workbook and sheet names, which can carry the company's name
    syncRuns.push(scrub(r.syncRun, "qbo-xlsx", fileTag));
    qbo.push({ fileTag, rows: r.rows });
  }

  const generatedAt = now();
  const bundle = {
    ...anonymizeExports(a, companyId, { timesheets, journals, qbo }),
    syncRuns,
    generatedAt: generatedAt.toISOString(),
  };
  const outPath = await persist(
    o.privateDir,
    a,
    bundle,
    `${companyId}-exports-${stamp(generatedAt)}`,
    o.dryRun,
    chartWordsOf(bundle.expenses.map((x) => x.accountName)),
  );
  return {
    workers: bundle.workers.length,
    clients: bundle.clients.length,
    jobs: bundle.jobs.length,
    timeEntries: bundle.timeEntries.length,
    paidRows: bundle.paid.length,
    expenses: bundle.expenses.length,
    syncRuns: runCounts(syncRuns),
    outPath,
  };
}

/** Company R's real Jobber account: its own token file under the private dir, never the trial token. */
export function rJobberClient(
  privateDir: string,
  env: Record<string, string | undefined> = process.env,
): JobberClient {
  const tokenPath = join(privateDir, "jobber-token.json");
  if (resolve(tokenPath) === resolve(DEFAULT_TOKEN_PATH))
    throw new Error("Company R must not use the trial account's token file");
  return new JobberClient({
    ...authFromEnv(env),
    tokenStore: fileTokenStore(tokenPath),
    log: (l) => console.error(l),
  });
}

export interface JobberIngestOptions {
  privateDir: string;
  companyId?: string;
  timezone: string;
  from: string;
  to: string;
  dryRun?: boolean;
  /** Injectable for tests; default rJobberClient(privateDir). */
  client?: JobberClient;
  now?: () => Date;
}

export async function ingestRFromJobber(o: JobberIngestOptions): Promise<{
  workers: number;
  timeEntries: number;
  jobs: number;
  visits: number;
  quotes: number;
  invoices: number;
  payments: number;
  expenses: number;
  syncRuns: RunCount[];
  outPath: string | null;
}> {
  const companyId = o.companyId ?? "r";
  const now = o.now ?? (() => new Date());
  const a = await openAnonymizer(o.privateDir);
  const client = o.client ?? rJobberClient(o.privateDir);
  // auth is unused when a client is given; credentials never reach the output
  const pull = await pullCycle(
    { clientId: "", clientSecret: "" },
    companyId,
    o.from,
    o.to,
    { client, timezone: o.timezone, now },
  );
  const generatedAt = now();
  const payload = {
    ...anonymizeJobberPull(a, companyId, pull),
    period: { from: o.from, to: o.to, timezone: o.timezone },
    generatedAt: generatedAt.toISOString(),
  };
  const outPath = await persist(
    o.privateDir,
    a,
    payload,
    `${companyId}-jobber-${o.from}-${o.to}-${stamp(generatedAt)}`,
    o.dryRun,
  );
  const r = payload.records;
  return {
    workers: r.workers.length,
    timeEntries: r.timeEntries.length,
    jobs: r.jobs.length,
    visits: r.visits.length,
    quotes: r.quotes.length,
    invoices: r.invoices.length,
    payments: r.payments.length,
    expenses: r.expenses.length,
    syncRuns: runCounts(payload.syncRuns),
    outPath,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      tz: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      timesheets: { type: "string", multiple: true },
      journal: { type: "string", multiple: true },
      qbo: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
    },
  });
  const source = values.source ?? "exports";
  if (
    !values.tz ||
    !["exports", "jobber-api"].includes(source) ||
    (source === "jobber-api" && (!values.from || !values.to))
  ) {
    console.error(
      "usage: ingest-r.ts --tz <IANA> [--timesheets data/private/r/x.xlsx ...] [--journal data/private/r/y.csv ...] [--qbo data/private/r/z.zip ...] [--dry-run]",
    );
    console.error(
      "       ingest-r.ts --source jobber-api --tz <IANA> --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run]",
    );
    process.exit(2);
  }
  const job =
    source === "jobber-api"
      ? ingestRFromJobber({
          privateDir: R_PRIVATE_DIR,
          timezone: values.tz,
          from: values.from as string,
          to: values.to as string,
          dryRun: values["dry-run"],
        })
      : ingestR({
          privateDir: R_PRIVATE_DIR,
          timezone: values.tz,
          timesheets: values.timesheets ?? [],
          journals: values.journal ?? [],
          qbo: values.qbo ?? [],
          dryRun: values["dry-run"],
        });
  job
    .then((c) => {
      const { syncRuns, outPath, ...counts } = c;
      console.log(
        Object.entries(counts)
          .map(([k, v]) => `${k} ${v}`)
          .join(", "),
      );
      for (const s of syncRuns)
        console.log(
          `  ${s.object}: pulled ${s.pulled} of ${s.expected ?? "?"}, complete ${s.complete}`,
        );
      console.log(
        outPath
          ? `wrote ${relative(process.cwd(), outPath)}`
          : "dry run: nothing written",
      );
      if (syncRuns.some((s) => !s.complete)) process.exitCode = 1;
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
