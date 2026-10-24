#!/usr/bin/env bun
// Company R ingest (A-09): real exports in data/private/r/ -> anonymized, normalized JSON in
// data/private/r/out/. Prints counts only. Writing into Convex is B's loader.
//   bun run packages/connectors/src/ingest-r.ts --tz America/Los_Angeles \
//     --timesheets data/private/r/<file>.xlsx [...] --journal data/private/r/<file>.csv [...] [--dry-run]
// Enforced in code, not by convention:
//   - inputs must be inside data/private/r/; output goes only to data/private/r/out/
//   - nothing is written unless it is stamped namesAnonymized: true AND contains no real token
//   - file names (which can carry names) never reach the output: files are tagged by content hash
//   - salt, pseudonym map and real-token list stay in data/private/r/ (0600); never printed

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { Anonymizer, anonymizeExports, findRealTokens, loadOrCreateSalt, type PseudonymMap } from "./anonymize.ts";
import { readGustoPayrollJournalCsv } from "./exports/gusto-payroll-journal-csv.ts";
import { readJobberTimesheetsXlsx } from "./exports/jobber-timesheets-xlsx.ts";
import { privatePath } from "./tokens.ts";
import type { SyncRun } from "./types.ts";

export const R_PRIVATE_DIR = privatePath("r");

export interface IngestOptions {
  privateDir: string;
  companyId?: string;
  timezone: string;
  timesheets: string[];
  journals: string[];
  dryRun?: boolean;
  now?: () => Date;
}

export interface IngestCounts {
  workers: number; clients: number; jobs: number; timeEntries: number; paidRows: number;
  syncRuns: { object: string; pulled: number; expected: number | null; complete: boolean }[];
  outPath: string | null;
}

const inside = (dir: string, p: string) => {
  const rel = relative(resolve(dir), resolve(p));
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
};

/** The only door to disk for Company R output. Refuses un-anonymized payloads and any real token. */
export function assertSafeToWrite(payload: unknown, realTokens: string[]): string {
  if ((payload as { namesAnonymized?: unknown } | null)?.namesAnonymized !== true) {
    throw new Error("refusing to write: payload is not anonymized (namesAnonymized !== true)");
  }
  const json = JSON.stringify(payload, null, 2);
  const leaks = findRealTokens(json, realTokens);
  // the count only: printing the tokens would print real names
  if (leaks.length) throw new Error(`refusing to write: anonymization check found ${leaks.length} real token(s) in the output`);
  return json;
}

async function writePrivate(path: string, content: string) {
  await writeFile(path, content, { mode: 0o600 });
}

export async function ingestR(o: IngestOptions): Promise<IngestCounts> {
  const companyId = o.companyId ?? "r";
  const now = o.now ?? (() => new Date());
  for (const p of [...o.timesheets, ...o.journals]) {
    if (!inside(o.privateDir, p)) throw new Error(`input must be inside the private dir (${o.privateDir})`);
  }
  const salt = await loadOrCreateSalt(join(o.privateDir, "salt"));
  const mapPath = join(o.privateDir, "pseudonyms.json");
  let map: PseudonymMap | undefined;
  try {
    map = JSON.parse(await readFile(mapPath, "utf8")) as PseudonymMap;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const a = new Anonymizer(salt, map);

  const syncRuns: SyncRun[] = [];
  const tagged = async (p: string) => {
    const bytes = await readFile(p);
    return { bytes, fileTag: createHash("sha256").update(bytes).digest("hex").slice(0, 10) };
  };
  // file names are replaced by the content tag in every SyncRun.method
  const scrub = (run: SyncRun, reader: string, fileTag: string): SyncRun => ({ ...run, method: `export ${reader} file:${fileTag}` });

  const timesheets = [];
  for (const p of o.timesheets) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readJobberTimesheetsXlsx(bytes, { companyId, timezone: o.timezone, fileName: fileTag, now });
    syncRuns.push(scrub(r.syncRun, "jobber-timesheets-xlsx", fileTag));
    timesheets.push({ fileTag, rows: r.rows });
  }
  const journals = [];
  for (const p of o.journals) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readGustoPayrollJournalCsv({ text: bytes.toString("utf8"), fileName: fileTag }, { companyId, now });
    syncRuns.push(scrub(r.syncRun, "gusto-payroll-journal-csv", fileTag));
    journals.push({ fileTag, rows: r.rows });
  }

  const bundle = { ...anonymizeExports(a, companyId, { timesheets, journals }), syncRuns, generatedAt: now().toISOString() };
  const json = assertSafeToWrite(bundle, a.realTokens());

  let outPath: string | null = null;
  if (!o.dryRun) {
    await mkdir(join(o.privateDir, "out"), { recursive: true, mode: 0o700 });
    outPath = join(o.privateDir, "out", `${companyId}-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`);
    await writePrivate(mapPath, JSON.stringify(a.map, null, 2));
    await writePrivate(join(o.privateDir, "real-tokens.txt"), `${a.realTokens().join("\n")}\n`);
    await writePrivate(outPath, json);
  }
  return {
    workers: bundle.workers.length, clients: bundle.clients.length, jobs: bundle.jobs.length,
    timeEntries: bundle.timeEntries.length, paidRows: bundle.paid.length,
    syncRuns: syncRuns.map((s) => ({ object: s.object, pulled: s.pulled, expected: s.expected, complete: s.complete })),
    outPath,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { tz: { type: "string" }, timesheets: { type: "string", multiple: true }, journal: { type: "string", multiple: true }, "dry-run": { type: "boolean" } },
  });
  if (!values.tz) {
    console.error("usage: ingest-r.ts --tz <IANA> [--timesheets data/private/r/x.xlsx ...] [--journal data/private/r/y.csv ...] [--dry-run]");
    process.exit(2);
  }
  ingestR({ privateDir: R_PRIVATE_DIR, timezone: values.tz, timesheets: values.timesheets ?? [], journals: values.journal ?? [], dryRun: values["dry-run"] })
    .then((c) => {
      console.log(`workers ${c.workers}, clients ${c.clients}, jobs ${c.jobs}, time entries ${c.timeEntries}, paid rows ${c.paidRows}`);
      for (const s of c.syncRuns) console.log(`  ${s.object}: pulled ${s.pulled} of ${s.expected ?? "?"}, complete ${s.complete}`);
      console.log(c.outPath ? `wrote ${relative(process.cwd(), c.outPath)}` : "dry run: nothing written");
      if (c.syncRuns.some((s) => !s.complete)) process.exitCode = 1;
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
