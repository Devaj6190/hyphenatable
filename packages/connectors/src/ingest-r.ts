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
  jobKey,
  leakReport,
  loadOrCreateSalt,
  nameKey,
  type PseudonymMap,
} from "./anonymize.ts";
import { CrossFileDedupe, noteDuplicates } from "./dedupe.ts";
import { readGustoPayrollJournalCsv } from "./exports/gusto-payroll-journal-csv.ts";
import {
  isSectionedJournal,
  readGustoPayrollJournalSectionedCsv,
} from "./exports/gusto-payroll-journal-sectioned.ts";
import {
  EXPENSE_REPORT,
  INVOICES_REPORT,
  JOBS_REPORT,
  QUOTES_REPORT,
  type ReportRow,
  type ReportSpec,
  readJobberReportCsv,
  TRANSACTION_LIST,
} from "./exports/jobber-reports.ts";
import { readJobberTimesheetsCsv } from "./exports/jobber-timesheets-csv.ts";
import {
  readJobberTimesheetsXlsx,
  type TimesheetRow,
} from "./exports/jobber-timesheets-xlsx.ts";
import { readQboTransactionDetailXlsx } from "./exports/qbo-tda-xlsx.ts";
import { readQboXlsx } from "./exports/qbo-xlsx.ts";
import { readVenmoCsv, type VenmoRow } from "./exports/venmo-csv.ts";
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
  /** --diagnose: label shapes (A/a/9, never the labels) of ledger total rows that close nothing */
  diagnose?: (line: string) => void;
  companyId?: string;
  timezone: string;
  timesheets: string[];
  journals: string[];
  /** QBO Excel exports (.xlsx or the Export data zip) */
  qbo?: string[];
  /** Jobber report CSVs */
  jobberExpenses?: string[];
  transactions?: string[];
  invoices?: string[];
  quotes?: string[];
  jobsOneOff?: string[];
  jobsRecurring?: string[];
  /** QBO "Transaction Detail by Account" (.xlsx / zip) */
  qboLedger?: string[];
  /** Venmo monthly statement CSVs */
  venmo?: string[];
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
  /** entries dropped because an earlier, overlapping export of the same kind already had them */
  duplicatesAcrossFiles: number;
  workers: number;
  clients: number;
  jobs: number;
  timeEntries: number;
  paidRows: number;
  /** worker x pay period rows for M4 (regular gross; off-cycle apart) */
  paidPeriods: number;
  /** paid rows that are owner draws (excluded from the wage comparison) */
  ownerDrawRows: number;
  /** of those, how many carry off-cycle gross */
  paidPeriodsWithOffCycle: number;
  expenses: number;
  jobberExpenses: number;
  laborPaidAsExpense: number;
  transactions: number;
  invoices: number;
  quotes: number;
  jobsReport: number;
  ledgerLines: number;
  venmo: number;
  venmoToWorkers: number;
  /** counts per class, e.g. "wage 12 / reimbursement 3 / personal_or_unknown 40" */
  venmoByClass: string;
  /** counts per funding token, so the owner can confirm e.g. "bank:B = personal" */
  venmoByFunding: string;
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

/**
 * data/private/r/token-allow.txt: words the owner approved as not names ("owner", "pay"), one per line,
 * case-insensitive, "#" comments. Written by a person, never by code; absent means nothing is allowed.
 */
export async function loadTokenAllow(privateDir: string): Promise<Set<string>> {
  try {
    const text = await readFile(join(privateDir, "token-allow.txt"), "utf8");
    return new Set(
      text
        .split("\n")
        .map((l) => l.replace(/#.*/, "").trim().toLowerCase())
        .filter(Boolean),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return new Set();
  }
}

/** The system word list, when there is one (macOS / most Linux): only to say "dictionary word or not". */
async function dictionaryWords(): Promise<Set<string>> {
  try {
    const t = await readFile("/usr/share/dict/words", "utf8");
    return new Set(t.split("\n").map((w) => w.trim().toLowerCase()));
  } catch {
    return new Set();
  }
}

/** Check, then (unless dry run) persist map + token list and write the payload to out/. Returns the out path. */
async function persist(
  privateDir: string,
  a: Anonymizer,
  payload: { namesAnonymized: true },
  name: string,
  dryRun?: boolean,
  chartWords?: Set<string>,
  diagnose?: (line: string) => void,
): Promise<string | null> {
  const allow = await loadTokenAllow(privateDir);
  const tokens = a.realTokens(chartWords, allow);
  let json: string;
  try {
    json = assertSafeToWrite(payload, tokens);
  } catch (e) {
    if (diagnose)
      for (const l of leakReport(
        payload,
        a.tokenSources(chartWords, allow),
        await dictionaryWords(),
      ))
        diagnose(l);
    throw e;
  }
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
  const reportPaths = [
    ...(o.jobberExpenses ?? []),
    ...(o.transactions ?? []),
    ...(o.invoices ?? []),
    ...(o.quotes ?? []),
    ...(o.jobsOneOff ?? []),
    ...(o.jobsRecurring ?? []),
    ...(o.qboLedger ?? []),
    ...(o.venmo ?? []),
  ];
  for (const p of [
    ...o.timesheets,
    ...o.journals,
    ...(o.qbo ?? []),
    ...reportPaths,
  ]) {
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

  let duplicatesAcrossFiles = 0;
  // the same entry in two overlapping exports: same worker, date, start, end, duration, job, label, category
  const timesheetDedupe = new CrossFileDedupe<TimesheetRow>((t) =>
    JSON.stringify([
      nameKey(t.workerName),
      t.date,
      t.startAt,
      t.endAt,
      t.durationSec,
      t.jobText ? jobKey(t.jobText) : null,
      t.label ?? null,
      t.category,
    ]),
  );
  const timesheets = [];
  for (const p of o.timesheets) {
    const { bytes, fileTag } = await tagged(p);
    // xlsx is a zip ("PK"); anything else is the CSV export
    const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const r = isXlsx
      ? await readJobberTimesheetsXlsx(bytes, {
          companyId,
          timezone: o.timezone,
          fileName: fileTag,
          now,
        })
      : await readJobberTimesheetsCsv(
          { text: bytes.toString("utf8"), fileName: fileTag },
          { companyId, timezone: o.timezone, now },
        );
    const d = timesheetDedupe.take(r.rows);
    duplicatesAcrossFiles += d.dropped;
    syncRuns.push(
      noteDuplicates(
        scrub(
          r.syncRun,
          isXlsx ? "jobber-timesheets-xlsx" : "jobber-timesheets-csv",
          fileTag,
        ),
        d.dropped,
      ),
    );
    timesheets.push({ fileTag, rows: d.rows });
  }
  const journals = [];
  for (const p of o.journals) {
    const { bytes, fileTag } = await tagged(p);
    const csv = bytes.toString("utf8");
    // the sectioned "Payroll Journal Report" has "Pay period" lines; the flat journal does not
    const sectioned = isSectionedJournal(csv);
    const r = sectioned
      ? await readGustoPayrollJournalSectionedCsv(
          { text: csv, fileName: fileTag },
          { companyId, now },
        )
      : await readGustoPayrollJournalCsv(
          { text: csv, fileName: fileTag },
          { companyId, now },
        );
    syncRuns.push(
      scrub(
        r.syncRun,
        sectioned
          ? "gusto-payroll-journal-sectioned"
          : "gusto-payroll-journal-csv",
        fileTag,
      ),
    );
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

  // Jobber report CSVs
  // overlapping report files: an entry is its source number (invoice #, quote #, job #) when the report has
  // one, else the whole parsed row
  const readReport = async <K extends string>(
    paths: string[] | undefined,
    spec: ReportSpec<K>,
    sourceNumber: (
      r: ReportRow<K>,
    ) => string | number | null | undefined = () => null,
  ) => {
    const dedupe = new CrossFileDedupe<ReportRow<K>>((r) => {
      const n = sourceNumber(r);
      if (n !== null && n !== undefined && n !== "") return `#${n}`;
      const { rowNumber: _, ...rest } = r;
      return JSON.stringify(rest);
    });
    const out: { fileTag: string; rows: ReportRow<K>[] }[] = [];
    for (const p of paths ?? []) {
      const { bytes, fileTag } = await tagged(p);
      const r = await readJobberReportCsv(
        spec,
        { text: bytes.toString("utf8"), fileName: fileTag },
        { companyId, now },
      );
      const d = dedupe.take(r.rows);
      duplicatesAcrossFiles += d.dropped;
      syncRuns.push(
        noteDuplicates(
          scrub(r.syncRun, `jobber-${spec.name}-csv`, fileTag),
          d.dropped,
        ),
      );
      out.push({ fileTag, rows: d.rows });
    }
    return out;
  };
  const reports = {
    jobberExpenses: await readReport(o.jobberExpenses, EXPENSE_REPORT),
    transactions: await readReport(o.transactions, TRANSACTION_LIST),
    invoices: await readReport(
      o.invoices,
      INVOICES_REPORT,
      (r) => r.keep.invoice,
    ),
    quotes: await readReport(o.quotes, QUOTES_REPORT, (r) => r.keep.quote),
    jobsReports: [
      ...(
        await readReport(o.jobsOneOff, JOBS_REPORT, (r) => r.jobs.job?.[0])
      ).map((f) => ({
        ...f,
        kind: "one_off" as const,
      })),
      ...(
        await readReport(o.jobsRecurring, JOBS_REPORT, (r) => r.jobs.job?.[0])
      ).map((f) => ({
        ...f,
        kind: "recurring" as const,
      })),
    ],
  };
  const qboLedger = [];
  for (const p of o.qboLedger ?? []) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readQboTransactionDetailXlsx(
      { bytes: new Uint8Array(bytes), fileName: fileTag },
      {
        companyId,
        now,
        diagnose:
          o.diagnose && ((l) => o.diagnose?.(`qbo-ledger ${fileTag} ${l}`)),
      },
    );
    syncRuns.push(scrub(r.syncRun, "qbo-transaction-detail", fileTag));
    qboLedger.push({ fileTag, rows: r.rows });
  }
  const venmo = [];
  const venmoDedupe = new CrossFileDedupe<VenmoRow>((v) => v.id);
  for (const p of o.venmo ?? []) {
    const { bytes, fileTag } = await tagged(p);
    const r = await readVenmoCsv(
      { text: bytes.toString("utf8"), fileName: fileTag },
      { companyId, now },
    );
    // overlapping statements: a Venmo transaction id appears once
    const d = venmoDedupe.take(r.rows);
    duplicatesAcrossFiles += d.dropped;
    syncRuns.push(
      noteDuplicates(scrub(r.syncRun, "venmo-csv", fileTag), d.dropped),
    );
    venmo.push({ fileTag, rows: d.rows });
  }

  const generatedAt = now();
  const bundle = {
    ...anonymizeExports(a, companyId, {
      timesheets,
      journals,
      qbo,
      ...reports,
      qboLedger,
      venmo,
    }),
    syncRuns,
    generatedAt: generatedAt.toISOString(),
  };
  const outPath = await persist(
    o.privateDir,
    a,
    bundle,
    `${companyId}-exports-${stamp(generatedAt)}`,
    o.dryRun,
    chartWordsOf([
      ...bundle.expenses.map((x) => x.accountName),
      ...bundle.ledger.flatMap((x) => [x.accountName, x.splitAccount]),
    ]),
    o.diagnose,
  );
  return {
    duplicatesAcrossFiles,
    workers: bundle.workers.length,
    clients: bundle.clients.length,
    jobs: bundle.jobs.length,
    timeEntries: bundle.timeEntries.length,
    paidRows: bundle.paid.length,
    paidPeriods: bundle.paidByPeriod.length,
    ownerDrawRows: bundle.paid.filter((p) => p.payKind === "owner_draw").length,
    paidPeriodsWithOffCycle: bundle.paidByPeriod.filter(
      (p) => p.offCycleGrossCents !== 0,
    ).length,
    expenses: bundle.expenses.length,
    jobberExpenses: bundle.jobberExpenses.length,
    laborPaidAsExpense: bundle.jobberExpenses.filter(
      (x) => x.kind === "labor_paid_as_expense",
    ).length,
    transactions: bundle.transactions.length,
    invoices: bundle.invoices.length,
    quotes: bundle.quotes.length,
    jobsReport: bundle.jobsReport.length,
    ledgerLines: bundle.ledger.length,
    venmo: bundle.venmo.length,
    venmoToWorkers: bundle.venmo.filter((v) => v.counterpartyWorkerId).length,
    venmoByClass:
      Object.entries(bundle.venmoSummary.byClass)
        .map(([k, v]) => `${k} ${v.count}`)
        .join(" / ") || "none",
    venmoByFunding:
      Object.entries(bundle.venmoSummary.byFunding)
        .map(([k, v]) => `${k} ${v.count} (to workers ${v.workerPayments})`)
        .join(" / ") || "none",
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
      expenses: { type: "string", multiple: true },
      transactions: { type: "string", multiple: true },
      invoices: { type: "string", multiple: true },
      quotes: { type: "string", multiple: true },
      "jobs-one-off": { type: "string", multiple: true },
      "jobs-recurring": { type: "string", multiple: true },
      "qbo-ledger": { type: "string", multiple: true },
      venmo: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
      diagnose: { type: "boolean" },
    },
  });
  const source = values.source ?? "exports";
  if (
    !values.tz ||
    !["exports", "jobber-api"].includes(source) ||
    (source === "jobber-api" && (!values.from || !values.to))
  ) {
    console.error(
      "usage: ingest-r.ts --tz <IANA> [--timesheets data/private/r/x.xlsx ...] [--journal data/private/r/y.csv ...] [--qbo data/private/r/z.zip ...] [--expenses|--transactions|--invoices|--quotes|--jobs-one-off|--jobs-recurring data/private/r/<report>.csv ...] [--qbo-ledger data/private/r/<tda>.xlsx ...] [--venmo data/private/r/<statement>.csv ...] [--dry-run] [--diagnose]",
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
          jobberExpenses: values.expenses ?? [],
          transactions: values.transactions ?? [],
          invoices: values.invoices ?? [],
          quotes: values.quotes ?? [],
          jobsOneOff: values["jobs-one-off"] ?? [],
          jobsRecurring: values["jobs-recurring"] ?? [],
          qboLedger: values["qbo-ledger"] ?? [],
          venmo: values.venmo ?? [],
          dryRun: values["dry-run"],
          diagnose: values.diagnose
            ? (l: string) => console.error(`diagnose ${l}`)
            : undefined,
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
