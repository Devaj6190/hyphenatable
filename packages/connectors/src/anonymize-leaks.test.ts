// Leak fixes found by the Company R dry run, on SYNTHETIC input (fake names only).
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Anonymizer, anonymizeExports, nameKey } from "./anonymize.ts";
import type { PayrollJournalRow } from "./exports/gusto-payroll-journal-csv.ts";
import type { TimesheetRow } from "./exports/jobber-timesheets-xlsx.ts";
import { loadTokenAllow } from "./ingest-r.ts";

const SALT = "1".repeat(64);

const timesheet = (workerName: string, jobText: string): TimesheetRow => ({
  rowNumber: 2,
  workerName,
  date: "2026-09-21",
  startAt: "2026-09-21T12:00:00.000Z",
  endAt: "2026-09-21T14:00:00.000Z",
  durationSec: 7200,
  jobText,
  clientName: null,
  category: null,
  approved: true,
  hasNote: false,
});

const journal = (
  employeeName: string,
  jobs: (string | null)[],
): PayrollJournalRow => ({
  rowNumber: 5,
  employeeName,
  periodStart: "2026-09-14",
  periodEnd: "2026-09-27",
  checkDate: "2026-10-02",
  grossCents: 30000,
  netCents: null,
  earningsCents: { Regular: 30000 },
  hours: { Regular: 12 },
  sectionKind: "regular",
  payKind: "wage",
  jobLines: jobs.map((job) => ({
    job,
    payType: "Regular",
    hours: 4,
    rateCents: 2500,
    amountCents: 10000,
  })),
});

describe("Gusto journal job labels", () => {
  it("become job ids (the Jobber id when the label carries the job number); a person-named label never survives", () => {
    const a = new Anonymizer(SALT);
    const b = anonymizeExports(a, "r", {
      timesheets: [
        {
          fileTag: "t",
          rows: [timesheet("Avery Reed", "Job #527 - Brookside Dental")],
        },
      ],
      journals: [
        {
          fileTag: "j",
          rows: [
            journal("Avery Reed", ["Pat Quinlan", "#527", "Landscaper", null]),
          ],
        },
      ],
    });
    const lines = b.paid[0]?.jobLines ?? [];
    expect(lines.map((l) => l.jobId?.startsWith("r:j:") ?? null)).toEqual([
      true,
      true,
      true,
      null,
    ]);
    expect(lines[1]?.jobId).toBe(b.timeEntries[0]?.jobId);
    expect(lines[0]?.jobId).not.toBe(lines[2]?.jobId);
    expect(b.jobs.map((j) => j.id)).toEqual(
      expect.arrayContaining(lines.flatMap((l) => (l.jobId ? [l.jobId] : []))),
    );
    const out = JSON.stringify(b);
    for (const s of ["Quinlan", "Pat", "Landscaper", "Brookside", '"job"'])
      expect(out).not.toContain(s);
  });
});

describe("worker pseudonyms", () => {
  it("re-roll, deterministically, when a word of the pseudonym is a word of a real name", () => {
    const fresh = new Anonymizer(SALT);
    const first = fresh.workerName("Avery Reed");
    const firstWord = (first.split(" ")[0] as string).toLowerCase();
    // a stored map (an earlier run) gave Avery that pseudonym; a client sharing its first name shows up later
    const map = () => ({
      workers: { [nameKey("Avery Reed")]: first },
      clients: { [nameKey(`${firstWord} Fake Dental`)]: "Client C01" },
      jobs: {},
    });
    const a1 = new Anonymizer(SALT, map());
    const rerolled = a1.workerName("Avery Reed");
    expect(rerolled).not.toBe(first);
    expect(rerolled.toLowerCase().split(" ")).not.toContain(firstWord);
    expect(new Anonymizer(SALT, map()).workerName("Avery Reed")).toBe(rerolled);
    // and the bundle carries the re-rolled name, even when the clashing client is first seen this run
    const a2 = new Anonymizer(SALT, {
      workers: { [nameKey("Avery Reed")]: first },
      clients: {},
      jobs: {},
    });
    const b = anonymizeExports(a2, "r", {
      timesheets: [{ fileTag: "t", rows: [timesheet("Avery Reed", "#1")] }],
      journals: [],
      jobberExpenses: [],
      invoices: [
        {
          fileTag: "i",
          rows: [
            {
              rowNumber: 2,
              money: {},
              dates: {},
              jobs: {},
              keep: {},
              names: { client: `${firstWord} Fake Dental` },
              present: {},
              category: null,
            },
          ],
        },
      ],
    });
    const name = b.workers[0]?.displayName ?? "";
    expect(name.toLowerCase().split(" ")).not.toContain(firstWord);
    const tokens = a2.realTokens();
    expect(tokens).toContain(firstWord);
  });
});

describe("token-allow.txt", () => {
  it("is read case-insensitively with comments; allowed words are not scanned for", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pp-allow-")), "r");
    await mkdir(dir, { recursive: true });
    expect(await loadTokenAllow(dir)).toEqual(new Set());
    await writeFile(
      join(dir, "token-allow.txt"),
      "Owner\n  pay # approved\n\n# note\n",
    );
    const allow = await loadTokenAllow(dir);
    expect(allow).toEqual(new Set(["owner", "pay"]));
    const a = new Anonymizer(SALT, {
      workers: { [nameKey("Avery Reed")]: "Casey Ashby" },
      clients: { [nameKey("Owner Pay Dental")]: "Client C01" },
      jobs: {},
    });
    expect(a.realTokens()).toEqual(
      expect.arrayContaining(["owner", "pay", "dental"]),
    );
    const t = a.realTokens(new Set(["dental"]), allow);
    expect(t).not.toContain("owner");
    expect(t).not.toContain("pay");
    // a client word in the chart of accounts is still scanned unless the owner allowed it
    expect(t).toContain("dental");
  });
});
