// Company R anonymizer (A-09). Real names never leave the process: workers get deterministic fake
// names, clients become "Client C07", jobs are renumbered "Job J012"; notes, labels, addresses and free
// text are dropped. Ids are HMAC(salt, key) prefixes, so they carry nothing real. The salt and the
// pseudonym map live only in data/private/r/ (gitignored) and are never logged.
// Output is stamped namesAnonymized: true; ingest-r refuses anything else and also scans the output
// for every real token before writing.

import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PayrollJournalRow } from "./exports/gusto-payroll-journal-csv.ts";
import type { TimesheetRow } from "./exports/jobber-timesheets-xlsx.ts";

const FIRST = ["Avery", "Quinn", "Rowan", "Sage", "Emery", "Finley", "Harper", "Indigo", "Jules", "Kai", "Lane", "Marlow", "Nova", "Oakley", "Peyton", "Remy", "Shiloh", "Tatum", "Wren", "Zion", "Blair", "Corin", "Dallas", "Ellis"];
const LAST = ["Ashby", "Brightwater", "Calloway", "Dunmore", "Ellery", "Fairbanks", "Galloway", "Hollis", "Ivers", "Juniper", "Kestrel", "Lindqvist", "Marchetti", "Northcott", "Okafor", "Pemberton", "Quayle", "Rosales", "Stavros", "Thorne"];
/** Business suffixes and filler: not identifying, so not scanned for (they would only cause false aborts). */
const STOP = new Set(["llc", "inc", "ltd", "corp", "company", "the", "and", "client", "job"]);

/** Persisted mapping. Keys are normalized real strings: PRIVATE, data/private/r/pseudonyms.json only. */
export interface PseudonymMap {
  workers: Record<string, string>;
  clients: Record<string, string>;
  jobs: Record<string, { label: string; number: number }>;
}

/** "Park, Riley", "riley  PARK" and "Riley Park" are one person: the key is the sorted bag of name words. */
export const nameKey = (real: string): string => words(real).sort().join(" ");

/** Lowercase ASCII words; apostrophes join ("O'Neil" -> "oneil"), every other non-letter splits. Used for keys and for the leak scan alike. */
function words(s: string): string[] {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ'’`]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
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
    for (const n of realNames) for (const w of nameKey(n).split(" ")) if (w) this.avoid.add(w);
  }
  constructor(private readonly salt: string, map?: PseudonymMap) {
    if (salt.length < 32) throw new Error("salt too short");
    this.map = map ?? { workers: {}, clients: {}, jobs: {} };
  }

  private h(kind: string, key: string): string {
    return createHmac("sha256", this.salt).update(`${kind}:${key}`).digest("hex");
  }

  /** Opaque, stable id for a real entity: no real content, needs the salt to reproduce. */
  id(kind: "w" | "c" | "j", real: string): string {
    const key = kind === "j" ? jobKey(real) : nameKey(real);
    return `r:${kind}:${this.h(kind, key).slice(0, 12)}`;
  }

  workerName(real: string): string {
    const key = nameKey(real);
    if (!key) throw new Error("empty worker name");
    const known = this.map.workers[key];
    if (known) return known;
    const used = new Set(Object.values(this.map.workers));
    const realWords = new Set([...key.split(" "), ...this.avoid]);
    let i = Number.parseInt(this.h("w", key).slice(0, 8), 16);
    for (let tries = 0; tries < FIRST.length * LAST.length; tries++, i++) {
      const first = FIRST[i % FIRST.length] as string;
      const last = LAST[Math.floor(i / FIRST.length) % LAST.length] as string;
      const fake = `${first} ${last}`;
      // never reuse a pseudonym, never echo a word of the real name
      if (!used.has(fake) && !realWords.has(first.toLowerCase()) && !realWords.has(last.toLowerCase())) {
        this.map.workers[key] = fake;
        return fake;
      }
    }
    throw new Error("pseudonym space exhausted");
  }

  clientName(real: string): string {
    const key = nameKey(real);
    if (!key) throw new Error("empty client name");
    this.map.clients[key] ??= `Client C${String(Object.keys(this.map.clients).length + 1).padStart(2, "0")}`;
    return this.map.clients[key];
  }

  job(real: string): { label: string; number: number } {
    const key = jobKey(real);
    if (!key) throw new Error("empty job");
    const n = Object.keys(this.map.jobs).length + 1;
    this.map.jobs[key] ??= { label: `Job J${String(n).padStart(3, "0")}`, number: n };
    return this.map.jobs[key];
  }

  /** Strings that must never appear in output: name and client words (>= 3 letters, not filler). */
  realTokens(): string[] {
    const words = new Set<string>();
    for (const k of [...Object.keys(this.map.workers), ...Object.keys(this.map.clients)]) {
      for (const w of k.split(" ")) if (w.length >= 3 && !STOP.has(w)) words.add(w);
    }
    return [...words].sort();
  }
}

/** Every real token found in `output` (case-insensitive, whole words). Empty means clean. */
export function findRealTokens(output: string, tokens: string[]): string[] {
  const seen = new Set(words(output));
  return tokens.filter((t) => seen.has(t));
}

// ---- anonymized, normalized shapes (local; B's loader maps them into Convex) ----

export interface AnonWorker { id: string; displayName: string }
export interface AnonClient { id: string; name: string }
export interface AnonJob { id: string; jobNumber: number; title: string }
/** Section 6 TimeEntry fields an export can know; the rest are null, never defaulted. */
export interface AnonTimeEntry {
  id: string; companyId: string; cycleId: null; sourceId: string; workerId: string; jobId: string | null; visitId: null;
  startAt: string | null; endAt: string | null; durationSec: number; ticking: null; approved: boolean | null; approvedBy: null;
  payable: null; category: string | null; label: null; hasNote: boolean; date: string; clientRef: string | null;
}
/** M4 input: what was actually paid, gross only, per pseudonymous worker and period. */
export interface AnonPaid { workerId: string; periodStart: string | null; periodEnd: string | null; checkDate: string | null; grossCents: number; sourceId: string }

export interface AnonymizedBundle {
  namesAnonymized: true;
  companyId: string;
  workers: AnonWorker[];
  clients: AnonClient[];
  jobs: AnonJob[];
  timeEntries: AnonTimeEntry[];
  paid: AnonPaid[];
}

/** `fileTag` identifies the source file without its name (file names can carry names): a content hash prefix. */
export function anonymizeExports(
  a: Anonymizer,
  companyId: string,
  input: { timesheets: { fileTag: string; rows: TimesheetRow[] }[]; journals: { fileTag: string; rows: PayrollJournalRow[] }[] },
): AnonymizedBundle {
  a.reserve([...input.timesheets.flatMap((f) => f.rows.flatMap((r) => [r.workerName, r.clientName ?? ""])), ...input.journals.flatMap((f) => f.rows.map((r) => r.employeeName))]);
  const workers = new Map<string, AnonWorker>();
  const jobs = new Map<string, AnonJob>();
  const worker = (real: string) => {
    const id = a.id("w", real);
    if (!workers.has(id)) workers.set(id, { id, displayName: a.workerName(real) });
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
        if (!jobs.has(jobId)) jobs.set(jobId, { id: jobId, jobNumber: j.number, title: j.label });
      }
      timeEntries.push({
        id: `export:te:${f.fileTag}:${r.rowNumber}`, companyId, cycleId: null, sourceId: `xlsx:${f.fileTag}#row${r.rowNumber}`,
        workerId: worker(r.workerName), jobId, visitId: null, startAt: r.startAt, endAt: r.endAt, durationSec: r.durationSec,
        ticking: null, approved: r.approved, approvedBy: null, payable: null, category: r.category, label: null, hasNote: r.hasNote,
        date: r.date, clientRef: r.clientName ? client(r.clientName) : null,
      });
    }
  }
  const paid: AnonPaid[] = [];
  for (const f of input.journals) {
    for (const r of f.rows) {
      paid.push({ workerId: worker(r.employeeName), periodStart: r.periodStart, periodEnd: r.periodEnd, checkDate: r.checkDate, grossCents: r.grossCents, sourceId: `csv:${f.fileTag}#row${r.rowNumber}` });
    }
  }
  return { namesAnonymized: true, companyId, workers: [...workers.values()], clients: [...clients.values()], jobs: [...jobs.values()], timeEntries, paid };
}
