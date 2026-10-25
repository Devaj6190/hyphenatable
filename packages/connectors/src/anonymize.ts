// Company R anonymizer (A-09). Real names never leave the process: workers get deterministic fake
// names, clients become "Client C07", jobs are renumbered "Job J012"; notes, labels, addresses and free
// text are dropped. Ids are HMAC(salt, key) prefixes, so they carry nothing real. The salt and the
// pseudonym map live only in data/private/r/ (gitignored) and are never logged.
// Output is stamped namesAnonymized: true; ingest-r refuses anything else and also scans the output
// for every real token before writing.

import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type AnonLedgerLine,
  type AnonVenmo,
  anonymizeLedger,
  anonymizeVenmo,
  type VenmoSummary,
} from "./anonymize-money.ts";
import {
  type AnonInvoiceReport,
  type AnonJobberExpense,
  type AnonJobReport,
  type AnonQuoteReport,
  type AnonTransaction,
  anonymizeReports,
  type ReportInputs,
  reportNames,
  reportWorkerNames,
} from "./anonymize-reports.ts";
import type { PayrollJournalRow } from "./exports/gusto-payroll-journal-csv.ts";
import type { TimesheetRow } from "./exports/jobber-timesheets-xlsx.ts";
import type { LedgerLine } from "./exports/qbo-tda-xlsx.ts";
import type { QboExportRow } from "./exports/qbo-xlsx.ts";
import type { VenmoRow } from "./exports/venmo-csv.ts";
import type { JobberRecords, PullResult } from "./jobber/index.ts";
import type { Job, SyncRun } from "./types.ts";

const FIRST = [
  "Avery",
  "Quinn",
  "Rowan",
  "Sage",
  "Emery",
  "Finley",
  "Harper",
  "Indigo",
  "Jules",
  "Kai",
  "Lane",
  "Marlow",
  "Nova",
  "Oakley",
  "Peyton",
  "Remy",
  "Shiloh",
  "Tatum",
  "Wren",
  "Zion",
  "Blair",
  "Corin",
  "Dallas",
  "Ellis",
];
const LAST = [
  "Ashby",
  "Brightwater",
  "Calloway",
  "Dunmore",
  "Ellery",
  "Fairbanks",
  "Galloway",
  "Hollis",
  "Ivers",
  "Juniper",
  "Kestrel",
  "Lindqvist",
  "Marchetti",
  "Northcott",
  "Okafor",
  "Pemberton",
  "Quayle",
  "Rosales",
  "Stavros",
  "Thorne",
];
/** Business suffixes and filler: not identifying, so not scanned for (they would only cause false aborts). */
const STOP = new Set([
  "llc",
  "inc",
  "ltd",
  "corp",
  "company",
  "the",
  "and",
  "client",
  "job",
]);

/** Persisted mapping. Keys are normalized real strings: PRIVATE, data/private/r/pseudonyms.json only. */
export interface PseudonymMap {
  workers: Record<string, string>;
  clients: Record<string, string>;
  jobs: Record<string, { label: string; number: number }>;
  /** QBO payees that are not workers (added with the QBO export ingest; absent in older maps) */
  vendors?: Record<string, string>;
  /** Venmo counterparties that are not workers ("Party Pnn") */
  parties?: Record<string, string>;
  /** funding sources keyed by a salted hash of the label (the bank + last4 never stored): "bank:A" */
  funding?: Record<string, string>;
}

/** "Park, Riley", "riley  PARK" and "Riley Park" are one person: the key is the sorted bag of name words. */
export const nameKey = (real: string): string => words(real).sort().join(" ");

/** Lowercase ASCII words; apostrophes join ("O'Neil" -> "oneil"), every other non-letter splits. Used for keys and for the leak scan alike. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ'’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A job is keyed by its number when the text carries one ("Job #101 - …"), else by its normalized text. */
export const jobKey = (real: string): string => {
  const n = /#\s*(\d+)/.exec(real)?.[1] ?? /^\s*(\d+)\b/.exec(real)?.[1];
  return n ? `#${Number(n)}` : real.toLowerCase().replace(/\s+/g, " ").trim();
};

export async function loadOrCreateSalt(path: string): Promise<string> {
  try {
    const s = (await readFile(path, "utf8")).trim();
    if (s.length < 32) throw new Error(`salt at ${path} is too short`);
    return s;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    await mkdir(dirname(path), { recursive: true });
    const salt = randomBytes(32).toString("hex");
    await writeFile(path, salt, { mode: 0o600, flag: "wx" });
    await chmod(path, 0o600);
    return salt;
  }
}

export class Anonymizer {
  readonly map: PseudonymMap;
  /** Words of every real name seen this run: no pseudonym may contain one. */
  private readonly avoid = new Set<string>();

  /** Register real names up front so pseudonyms avoid all of their words, not only the current one's. */
  reserve(realNames: string[]): void {
    for (const n of realNames)
      for (const w of nameKey(n).split(" ")) if (w) this.avoid.add(w);
  }
  constructor(
    private readonly salt: string,
    map?: PseudonymMap,
  ) {
    if (salt.length < 32) throw new Error("salt too short");
    this.map = map ?? { workers: {}, clients: {}, jobs: {} };
  }

  private h(kind: string, key: string): string {
    return createHmac("sha256", this.salt)
      .update(`${kind}:${key}`)
      .digest("hex");
  }

  /** Opaque, stable id for a real entity: no real content, needs the salt to reproduce. */
  id(kind: "w" | "c" | "j", real: string): string {
    const key = kind === "j" ? jobKey(real) : nameKey(real);
    return `r:${kind}:${this.h(kind, key).slice(0, 12)}`;
  }

  workerName(real: string): string {
    const key = nameKey(real);
    if (!key) throw new Error("empty worker name");
    const realWords = this.realWords(key);
    const clashes = (fake: string) => words(fake).some((w) => realWords.has(w));
    const known = this.map.workers[key];
    // a stored pseudonym is kept unless a real name seen since shares a word with it
    if (known && !clashes(known)) return known;
    delete this.map.workers[key];
    const used = new Set(Object.values(this.map.workers));
    // deterministic re-roll: attempt n draws from HMAC(salt, key + n)
    for (let n = 0; n < FIRST.length * LAST.length * 4; n++) {
      const i = Number.parseInt(
        this.h("w", n === 0 ? key : `${key}#${n}`).slice(0, 8),
        16,
      );
      const first = FIRST[i % FIRST.length] as string;
      const last = LAST[Math.floor(i / FIRST.length) % LAST.length] as string;
      const fake = `${first} ${last}`;
      // never reuse a pseudonym, never echo a word of any real name
      if (!used.has(fake) && !clashes(fake)) {
        this.map.workers[key] = fake;
        return fake;
      }
    }
    throw new Error("pseudonym space exhausted");
  }

  /** Every word of every real name known (this run's reserved names and every name in the map) plus `key`. */
  private realWords(key: string): Set<string> {
    const out = new Set([...key.split(" "), ...this.avoid]);
    for (const k of [
      ...Object.keys(this.map.workers),
      ...Object.keys(this.map.clients),
      ...Object.keys(this.map.vendors ?? {}),
      ...Object.keys(this.map.parties ?? {}),
    ])
      for (const w of k.split(" ")) if (w) out.add(w);
    return out;
  }

  /** A payee that is not a known worker: "Vendor V07". Vendors can be sole traders (people), so never kept. */
  vendorName(real: string): string {
    const key = nameKey(real);
    if (!key) throw new Error("empty vendor name");
    this.map.vendors ??= {};
    this.map.vendors[key] ??=
      `Vendor V${String(Object.keys(this.map.vendors).length + 1).padStart(2, "0")}`;
    return this.map.vendors[key];
  }

  /** A Venmo counterparty that is not a worker: "Party P07" (people; never payroll). */
  partyName(real: string): string {
    const key = nameKey(real);
    if (!key) throw new Error("empty party name");
    this.map.parties ??= {};
    this.map.parties[key] ??=
      `Party P${String(Object.keys(this.map.parties).length + 1).padStart(2, "0")}`;
    return this.map.parties[key];
  }

  /**
   * A funding source / destination label ("Chase Checking *1234") -> a stable token ("bank:A"); the Venmo
   * balance is "venmo_balance". The map keys are salted hashes, so the label itself is never stored.
   */
  fundingToken(raw: string | null): string | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    if (/venmo\s*balance/i.test(s)) return "venmo_balance";
    const key = this.h("funding", s.toLowerCase().replace(/\s+/g, " ")).slice(
      0,
      16,
    );
    this.map.funding ??= {};
    const n = Object.keys(this.map.funding).length;
    this.map.funding[key] ??=
      `bank:${n < 26 ? String.fromCharCode(65 + n) : `Z${n}`}`;
    return this.map.funding[key];
  }

  /** Whether a name is a worker this map (or this run's reserved names) already knows. */
  isKnownWorker(real: string, runWorkerKeys: Set<string>): boolean {
    const key = nameKey(real);
    return key !== "" && (key in this.map.workers || runWorkerKeys.has(key));
  }

  clientName(real: string): string {
    const key = nameKey(real);
    if (!key) throw new Error("empty client name");
    this.map.clients[key] ??=
      `Client C${String(Object.keys(this.map.clients).length + 1).padStart(2, "0")}`;
    return this.map.clients[key];
  }

  job(real: string): { label: string; number: number } {
    const key = jobKey(real);
    if (!key) throw new Error("empty job");
    const n = Object.keys(this.map.jobs).length + 1;
    this.map.jobs[key] ??= {
      label: `Job J${String(n).padStart(3, "0")}`,
      number: n,
    };
    return this.map.jobs[key];
  }

  /** Strings that must never appear in output: name and client words (>= 3 letters, not filler). */
  /**
   * `chartWords`: words of the chart-of-accounts names kept in the output ("Landscape Supplies"). A vendor
   * word that is also an account word ("landscape") is not scanned for, or every such vendor would abort the
   * ingest; person and client words are always scanned.
   * `allow`: owner-approved words that are not names (data/private/r/token-allow.txt): never scanned for,
   * whatever list they come from. Nothing is added to it automatically.
   */
  realTokens(
    chartWords: Set<string> = new Set(),
    allow: Set<string> = new Set(),
  ): string[] {
    return [...this.tokenSources(chartWords, allow).keys()].sort();
  }

  /** realTokens with, for each token, the map sections it comes from (for --diagnose: never printed raw). */
  tokenSources(
    chartWords: Set<string> = new Set(),
    allow: Set<string> = new Set(),
  ): Map<string, Set<TokenSource>> {
    const out = new Map<string, Set<TokenSource>>();
    const add = (src: TokenSource, keys: string[], skip: Set<string>) => {
      for (const k of keys)
        for (const w of k.split(" "))
          if (w.length >= 3 && !STOP.has(w) && !skip.has(w) && !allow.has(w))
            out.set(w, (out.get(w) ?? new Set()).add(src));
    };
    add("workers", Object.keys(this.map.workers), new Set());
    add("clients", Object.keys(this.map.clients), new Set());
    add("vendors", Object.keys(this.map.vendors ?? {}), chartWords);
    // Venmo counterparties who are not workers: people, always scanned
    add("parties", Object.keys(this.map.parties ?? {}), new Set());
    return out;
  }
}

export type TokenSource = "workers" | "clients" | "vendors" | "parties";

/**
 * --diagnose leak report: for each hit, the JSON path (array indexes collapsed to []; "<key>" when the hit is
 * in an object key), the hit count, the token's index in the sorted scanned list, its sources and whether it
 * is a dictionary word. NEVER the token or the value.
 */
export function leakReport(
  payload: unknown,
  sources: Map<string, Set<TokenSource>>,
  dictionary: Set<string> = new Set(),
): string[] {
  const tokens = [...sources.keys()].sort();
  const index = new Map(tokens.map((t, i) => [t, i]));
  const hits = new Map<string, number>();
  const hit = (path: string, text: string) => {
    for (const w of new Set(words(text)))
      if (index.has(w)) {
        const k = `${path}\u0000${w}`;
        hits.set(k, (hits.get(k) ?? 0) + 1);
      }
  };
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string" || typeof v === "number") hit(path, String(v));
    else if (Array.isArray(v)) for (const x of v) walk(x, `${path}[]`);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        hit(`${path}.<key>`, k);
        walk(x, `${path}.${k}`);
      }
  };
  walk(payload, "$");
  return [...hits].map(([k, n]) => {
    const [path, w] = k.split("\u0000") as [string, string];
    return `leak: field ${path} count ${n} token #${index.get(w)} of ${tokens.length} from ${[...(sources.get(w) ?? [])].join("+")} dictionary-word ${dictionary.size ? (dictionary.has(w) ? "yes" : "no") : "unknown"}`;
  });
}

/** Every real token found in `output` (case-insensitive, whole words). Empty means clean. */
export function findRealTokens(output: string, tokens: string[]): string[] {
  const seen = new Set(words(output));
  return tokens.filter((t) => seen.has(t));
}

// ---- anonymized, normalized shapes (local; B's loader maps them into Convex) ----

export interface AnonWorker {
  id: string;
  displayName: string;
  /** the Jobber export named them with a " Team Leader" suffix */
  teamLeader?: boolean;
}
export interface AnonClient {
  id: string;
  name: string;
}
export interface AnonJob {
  id: string;
  jobNumber: number;
  title: string;
}
/** Section 6 TimeEntry fields an export can know; the rest are null, never defaulted. */
export interface AnonTimeEntry {
  id: string;
  companyId: string;
  cycleId: null;
  sourceId: string;
  workerId: string;
  jobId: string | null;
  visitId: null;
  startAt: string | null;
  endAt: string | null;
  durationSec: number;
  ticking: null;
  approved: boolean | null;
  approvedBy: null;
  payable: null;
  category: string | null;
  label: null;
  hasNote: boolean;
  date: string;
  clientRef: string | null;
}
/** M4 input: what was actually paid, gross only, per pseudonymous worker and period. */
export interface AnonPaid {
  workerId: string;
  periodStart: string | null;
  periodEnd: string | null;
  checkDate: string | null;
  grossCents: number;
  sourceId: string;
  /** sectioned journal: regular vs off-cycle payroll (absent for the flat journal) */
  sectionKind?: "regular" | "off_cycle" | "other";
  /** owner draws ("Owner’s draw" employee type) are kept but are not wages */
  payKind?: "wage" | "owner_draw";
  /** owner draws on this row (sectioned journal); grossCents excludes them */
  ownerDrawCents?: number;
  employeeType?: string | null;
  /** per pay-type amounts in cents (Regular, Overtime, Commission, ...); no taxes */
  earningsCents?: Record<string, number>;
  hours?: Record<string, number>;
  /** itemized lines with job and rate; the Gusto job label (a role, a job, sometimes a person's name) is a job id */
  jobLines?: {
    jobId: string | null;
    payType: string;
    hours: number | null;
    rateCents: number | null;
    amountCents: number;
  }[];
}

export interface AnonPaidPeriod {
  workerId: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** regular payroll sections (or the flat journal, which has no sections): what M4 compares to */
  regularGrossCents: number;
  /** off-cycle sections, reported separately (bonuses, corrections) */
  offCycleGrossCents: number;
  /** sections whose title is neither regular nor off-cycle */
  otherGrossCents: number;
  /** owner draws, any section: never part of the wage comparison */
  ownerDrawCents: number;
}

export function paidByPeriod(paid: AnonPaid[]): AnonPaidPeriod[] {
  const by = new Map<string, AnonPaidPeriod>();
  for (const p of paid) {
    const k = `${p.workerId}|${p.periodStart}|${p.periodEnd}`;
    const row = by.get(k) ?? {
      workerId: p.workerId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      regularGrossCents: 0,
      offCycleGrossCents: 0,
      otherGrossCents: 0,
      ownerDrawCents: 0,
    };
    const kind = p.sectionKind ?? "regular";
    // grossCents is wage gross; owner draws come in ownerDrawCents (older rows: a draw row carries it in grossCents)
    const legacyDraw =
      p.payKind === "owner_draw" && p.ownerDrawCents === undefined;
    row.ownerDrawCents += p.ownerDrawCents ?? (legacyDraw ? p.grossCents : 0);
    if (legacyDraw) {
      by.set(k, row);
      continue;
    }
    if (kind === "regular") row.regularGrossCents += p.grossCents;
    else if (kind === "off_cycle") row.offCycleGrossCents += p.grossCents;
    else row.otherGrossCents += p.grossCents;
    by.set(k, row);
  }
  return [...by.values()].sort((a, b) =>
    `${a.periodStart}${a.workerId}`.localeCompare(
      `${b.periodStart}${b.workerId}`,
    ),
  );
}

export interface AnonymizedBundle {
  namesAnonymized: true;
  companyId: string;
  workers: AnonWorker[];
  clients: AnonClient[];
  jobs: AnonJob[];
  timeEntries: AnonTimeEntry[];
  paid: AnonPaid[];
  /** M4 input: gross per pseudonymous worker per pay period, regular payrolls apart from off-cycle ones */
  paidByPeriod: AnonPaidPeriod[];
  expenses: AnonExpense[];
  jobberExpenses: AnonJobberExpense[];
  transactions: AnonTransaction[];
  invoices: AnonInvoiceReport[];
  quotes: AnonQuoteReport[];
  jobsReport: AnonJobReport[];
  ledger: AnonLedgerLine[];
  venmo: AnonVenmo[];
  venmoSummary: VenmoSummary;
}

/** Section 6 Expense from a QBO export line. Payee -> worker (reimbursement) or "Vendor Vnn"; memo dropped. */
export interface AnonExpense {
  id: string;
  companyId: string;
  source: "qbo";
  sourceId: string;
  date: string;
  amountCents: number;
  vendor: string | null;
  description: null;
  accountName: string | null;
  /** the job (r:j:…) when the QBO customer is "Client:Job", else the client (r:c:…) */
  customerRef: string | null;
  paymentType: string | null;
  kind: "unknown";
  matchedJobId: null;
  matchConfidence: null;
  /** set when the payee is a known worker */
  reimbursableToWorkerId: string | null;
  reimbursementStatus: null;
}

/** Lowercase words of names kept in output (account names), for Anonymizer.realTokens(chartWords). */
export const chartWordsOf = (names: (string | null)[]): Set<string> =>
  new Set(names.flatMap((n) => (n ? words(n) : [])));

/** `fileTag` identifies the source file without its name (file names can carry names): a content hash prefix. */
export function anonymizeExports(
  a: Anonymizer,
  companyId: string,
  input: ReportInputs & {
    timesheets: { fileTag: string; rows: TimesheetRow[] }[];
    journals: { fileTag: string; rows: PayrollJournalRow[] }[];
    qbo?: { fileTag: string; rows: QboExportRow[] }[];
    qboLedger?: { fileTag: string; rows: LedgerLine[] }[];
    venmo?: { fileTag: string; rows: VenmoRow[] }[];
  },
): AnonymizedBundle {
  const runWorkerNames = [
    ...input.timesheets.flatMap((f) => f.rows.map((r) => r.workerName)),
    ...input.journals.flatMap((f) => f.rows.map((r) => r.employeeName)),
    // people named as Jobber users in the reports are workers too
    ...reportWorkerNames(input),
  ];
  const runWorkerKeys = new Set(runWorkerNames.map(nameKey));
  a.reserve([
    ...runWorkerNames,
    ...input.timesheets.flatMap((f) => f.rows.map((r) => r.clientName ?? "")),
    ...reportNames(input),
    ...(input.qboLedger ?? []).flatMap((f) =>
      f.rows.map((r) => r.payeeName ?? ""),
    ),
    ...(input.venmo ?? []).flatMap((f) =>
      f.rows.map((r) => r.counterpartyName ?? ""),
    ),
    ...(input.qbo ?? []).flatMap((f) =>
      f.rows.flatMap((r) => [r.payeeName ?? "", r.customerName ?? ""]),
    ),
  ]);
  const workers = new Map<string, AnonWorker>();
  const jobs = new Map<string, AnonJob>();
  const workerReal = new Map<string, string>();
  const worker = (real: string) => {
    const id = a.id("w", real);
    if (!workers.has(id)) {
      workers.set(id, { id, displayName: a.workerName(real) });
      workerReal.set(id, real);
    }
    return id;
  };
  const teamLead = (id: string, flag: boolean | undefined) => {
    const w = workers.get(id);
    if (flag && w) w.teamLeader = true;
    return id;
  };
  const clients = new Map<string, AnonClient>();
  const client = (real: string) => {
    const id = a.id("c", real);
    if (!clients.has(id)) clients.set(id, { id, name: a.clientName(real) });
    return id;
  };
  const timeEntries: AnonTimeEntry[] = [];
  for (const f of input.timesheets) {
    for (const r of f.rows) {
      let jobId: string | null = null;
      if (r.jobText) {
        jobId = a.id("j", r.jobText);
        const j = a.job(r.jobText);
        if (!jobs.has(jobId))
          jobs.set(jobId, { id: jobId, jobNumber: j.number, title: j.label });
      }
      timeEntries.push({
        id: `export:te:${f.fileTag}:${r.rowNumber}`,
        companyId,
        cycleId: null,
        sourceId: `xlsx:${f.fileTag}#row${r.rowNumber}`,
        workerId: teamLead(worker(r.workerName), r.teamLeader),
        jobId,
        visitId: null,
        startAt: r.startAt,
        endAt: r.endAt,
        durationSec: r.durationSec,
        ticking: null,
        approved: r.approved,
        approvedBy: null,
        payable: null,
        category: r.category,
        label: null,
        hasNote: r.hasNote,
        date: r.date,
        clientRef: r.clientName ? client(r.clientName) : null,
      });
    }
  }
  const job = (real: string) => {
    const id = a.id("j", real);
    const j = a.job(real);
    if (!jobs.has(id))
      jobs.set(id, { id, jobNumber: j.number, title: j.label });
    return id;
  };
  const paid: AnonPaid[] = [];
  for (const f of input.journals) {
    for (const r of f.rows) {
      paid.push({
        workerId: worker(r.employeeName),
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        checkDate: r.checkDate,
        grossCents: r.grossCents,
        sourceId: `csv:${f.fileTag}#row${r.rowNumber}`,
        ...(r.sectionKind
          ? {
              sectionKind: r.sectionKind,
              payKind: r.payKind ?? "wage",
              employeeType: r.employeeType ?? null,
              earningsCents: r.earningsCents,
              hours: r.hours,
              // job labels can be a person's name: never kept, always a job id
              jobLines: (r.jobLines ?? []).map(({ job: label, ...l }) => ({
                jobId: label?.trim() ? job(label) : null,
                ...l,
              })),
              ownerDrawCents: r.ownerDrawCents ?? 0,
            }
          : {}),
      });
    }
  }
  const expenses: AnonExpense[] = [];
  for (const f of input.qbo ?? []) {
    // sheets are numbered by first appearance: workbook and sheet names can carry the company's name
    const sheetIndex = new Map<string, number>();
    for (const r of f.rows) {
      const sheetKey = `${r.workbook}\u0000${r.sheet}`;
      if (!sheetIndex.has(sheetKey))
        sheetIndex.set(sheetKey, sheetIndex.size + 1);
      const payee = r.payeeName;
      const payeeIsWorker =
        payee !== null && a.isKnownWorker(payee, runWorkerKeys);
      // QBO customers are "Client" or "Client:Job" (sub-customer); a job part is keyed like Jobber job numbers
      const parts = (r.customerName ?? "")
        .split(":")
        .map((s) => s.trim())
        .filter(Boolean);
      const clientPart = parts[0];
      const jobPart = parts.length > 1 ? parts.at(-1) : undefined;
      if (clientPart) client(clientPart);
      expenses.push({
        id: `export:qbo:${f.fileTag}:${sheetIndex.get(sheetKey)}:${r.rowNumber}`,
        companyId,
        source: "qbo",
        sourceId: `xlsx:${f.fileTag}#s${sheetIndex.get(sheetKey)}row${r.rowNumber}`,
        date: r.date,
        amountCents: r.amountCents,
        vendor: payee && !payeeIsWorker ? a.vendorName(payee) : null,
        description: null,
        accountName: r.accountName,
        customerRef: jobPart
          ? job(jobPart)
          : clientPart
            ? a.id("c", clientPart)
            : null,
        paymentType: r.txnType,
        kind: "unknown",
        matchedJobId: null,
        matchConfidence: null,
        reimbursableToWorkerId: payee && payeeIsWorker ? worker(payee) : null,
        reimbursementStatus: null,
      });
    }
  }
  // Jobber report exports: the same worker / client / job ids as everything above
  const reports = anonymizeReports(
    { worker, client, jobOf: (n) => job(`#${n}`) },
    input,
  );
  // QBO ledger and Venmo: a payee / counterparty is a worker only when it matches a known worker (full name;
  // or a single first name that exactly one known worker has); anyone else is a vendor / party
  // first name -> the distinct known workers who have it (by name key), with one raw spelling each
  const firstNames = new Map<string, Map<string, string>>();
  for (const n of runWorkerNames) {
    const f = n.trim().split(/\s+/)[0]?.toLowerCase();
    if (!f) continue;
    const people = firstNames.get(f) ?? new Map<string, string>();
    if (!people.has(nameKey(n))) people.set(nameKey(n), n);
    firstNames.set(f, people);
  }
  const knownWorker = (real: string): string | null => {
    if (a.isKnownWorker(real, runWorkerKeys)) return worker(real);
    const words = real.trim().split(/\s+/);
    const people =
      words.length === 1
        ? firstNames.get((words[0] ?? "").toLowerCase())
        : undefined;
    return people && people.size === 1
      ? worker([...people.values()][0] as string)
      : null;
  };
  const money = {
    knownWorker,
    vendorName: (n: string) => a.vendorName(n),
    partyName: (n: string) => a.partyName(n),
    fundingToken: (raw: string | null) => a.fundingToken(raw),
  };
  const ledger = anonymizeLedger(money, input.qboLedger ?? []);
  const { venmo, venmoSummary } = anonymizeVenmo(
    money,
    input.venmo ?? [],
    reports.jobberExpenses,
  );
  // names seen after a worker got its pseudonym (a client, vendor or party) can collide with it: re-check
  for (const [id, w] of workers) {
    const real = workerReal.get(id);
    if (real) w.displayName = a.workerName(real);
  }
  return {
    namesAnonymized: true,
    companyId,
    workers: [...workers.values()],
    clients: [...clients.values()],
    jobs: [...jobs.values()],
    timeEntries,
    paid,
    paidByPeriod: paidByPeriod(paid),
    expenses,
    ...reports,
    ledger,
    venmo,
    venmoSummary,
  };
}

// ---- Jobber API pull (Company R's real account) ----

/** pullCycle output with every name replaced and every free-text field nulled. Jobber ids are kept (traceability). */
export interface AnonymizedJobberPull {
  namesAnonymized: true;
  companyId: string;
  records: JobberRecords;
  syncRuns: SyncRun[];
}

/**
 * Names: worker displayName -> pseudonym (same key as the exports, so one person = one pseudonym).
 * Free text nulled: time-entry labels, job titles (-> "Job Jnnn", renumbered by job number), expense
 * descriptions and vendors. Notes never existed (hasNote only). Clients are Jobber ids already.
 */
export function anonymizeJobberPull(
  a: Anonymizer,
  companyId: string,
  pull: PullResult,
): AnonymizedJobberPull {
  const r = pull.records;
  a.reserve(r.workers.map((w) => w.displayName));
  const job = (j: Job) => a.job(`#${j.jobNumber}`);
  return {
    namesAnonymized: true,
    companyId,
    records: {
      workers: r.workers.map((w) => ({
        ...w,
        companyId,
        displayName: a.workerName(w.displayName),
      })),
      timeEntries: r.timeEntries.map((e) => ({ ...e, companyId, label: null })),
      jobs: r.jobs.map((j) => ({
        ...j,
        companyId,
        jobNumber: job(j).number,
        title: job(j).label,
      })),
      visits: r.visits.map((v) => ({ ...v, companyId })),
      quotes: r.quotes.map((q) => ({ ...q, companyId })),
      invoices: r.invoices.map((i) => ({ ...i, companyId })),
      payments: r.payments.map((p) => ({ ...p, companyId })),
      expenses: r.expenses.map((x) => ({
        ...x,
        companyId,
        description: null,
        vendor: null,
      })),
    },
    syncRuns: pull.syncRuns.map((s) => ({ ...s, companyId })),
  };
}
