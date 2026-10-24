// ingest-r on SYNTHETIC replicas of Company R's real CSV layouts (Jobber Timesheets CSV, Gusto sectioned journal).
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GUSTO_JOURNAL_SECTIONED_CSV,
  JOBBER_TIMESHEETS_CSV,
} from "./exports/__fixtures__/make-r-replicas.ts";
import { ingestR } from "./ingest-r.ts";

describe("ingest-r with the real-layout CSVs (replicas)", () => {
  it("anonymizes, keeps the Team Leader flag, and builds M4 paid gross per worker per period (regular apart from off-cycle)", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pp-rcsv-")), "r");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "Timesheets Fake Landscaping.csv"),
      JOBBER_TIMESHEETS_CSV,
    );
    await writeFile(
      join(dir, "Payroll Journal Fake Landscaping.csv"),
      GUSTO_JOURNAL_SECTIONED_CSV,
    );
    const c = await ingestR({
      privateDir: dir,
      timezone: "America/New_York",
      timesheets: [join(dir, "Timesheets Fake Landscaping.csv")],
      journals: [join(dir, "Payroll Journal Fake Landscaping.csv")],
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    expect(c).toMatchObject({
      workers: 4,
      timeEntries: 7,
      paidRows: 6,
      paidPeriods: 5,
      paidPeriodsWithOffCycle: 1,
      ownerDrawRows: 1,
      jobs: 2,
      clients: 2,
    });
    expect(c.syncRuns).toEqual([
      { object: "timeSheetEntries", pulled: 7, expected: 7, complete: true }, // drift, merged and unlisted accounts are notes
      { object: "payrollJournal", pulled: 6, expected: 6, complete: true },
    ]);

    const out = await readFile(c.outPath as string, "utf8");
    const b = JSON.parse(out);
    const avery = b.timeEntries[0].workerId;
    expect(
      b.workers.find((w: { id: string }) => w.id === avery)?.teamLeader,
    ).toBe(true);
    // an owner draw is kept but never counted as regular wage gross
    const sam = b.paid.find(
      (p: { payKind: string }) => p.payKind === "owner_draw",
    )?.workerId;
    expect(
      b.paidByPeriod.find((p: { workerId: string }) => p.workerId === sam),
    ).toMatchObject({ regularGrossCents: 0, ownerDrawCents: 200000 });
    // the same person in both files is one worker
    const averyPeriods = b.paidByPeriod.filter(
      (p: { workerId: string }) => p.workerId === avery,
    );
    expect(averyPeriods).toEqual([
      {
        workerId: avery,
        periodStart: "2026-08-29",
        periodEnd: "2026-09-11",
        regularGrossCents: 116250,
        offCycleGrossCents: 20000,
        otherGrossCents: 0,
        ownerDrawCents: 0,
      },
      {
        workerId: avery,
        periodStart: "2026-09-12",
        periodEnd: "2026-09-25",
        regularGrossCents: 100000,
        offCycleGrossCents: 0,
        otherGrossCents: 0,
        ownerDrawCents: 0,
      },
    ]);
    expect(
      b.paid.find(
        (p: { sectionKind: string }) => p.sectionKind === "off_cycle",
      ),
    ).toMatchObject({
      grossCents: 20000,
      earningsCents: { Commission: 15000 },
    });
    // free text gone: labels null, job client part never kept, no notes
    expect(
      b.timeEntries.every((e: { label: unknown }) => e.label === null),
    ).toBe(true);
    expect(b.jobs.map((j: { title: string }) => j.title)).toEqual([
      "Job J001",
      "Job J002",
    ]);
    expect(b.syncRuns.map((s: { method: string }) => s.method)).toEqual([
      expect.stringMatching(/^export jobber-timesheets-csv file:[0-9a-f]{10}$/),
      expect.stringMatching(
        /^export gusto-payroll-journal-sectioned file:[0-9a-f]{10}$/,
      ),
    ]);

    // nothing real survives: names, clients, labels, notes, addresses, file names, tax and net figures
    for (const s of [
      "Avery",
      "Reed",
      "Jordan",
      "Ellis",
      "Okafor",
      "Brookside",
      "Maple",
      "Off-Site",
      "hedge",
      "gate code",
      "Fake Street",
      "Fake Landscaping",
      // (a job role named "Team Leader" in the Gusto lines is a role, not a name: checked on workers below)
      "1234.56",
      "777.77",
      "Direct Deposit",
      "Quinlan",
    ]) {
      expect(out).not.toContain(s);
    }
    expect(
      b.workers.some((w: { displayName: string }) =>
        /team leader/i.test(w.displayName),
      ),
    ).toBe(false);
    expect(b.paid[0].jobLines.map((l: { job: string }) => l.job)).toEqual([
      "Landscaper",
      "Team Leader",
      "Team Leader",
      "Team Leader",
    ]);
    const tokens = (await readFile(join(dir, "real-tokens.txt"), "utf8"))
      .trim()
      .split("\n");
    expect(tokens).toEqual(
      expect.arrayContaining([
        "avery",
        "reed",
        "jordan",
        "ellis",
        "okafor",
        "brookside",
        "dental",
        "maple",
        "grove",
        "hoa",
      ]),
    );
    for (const t of tokens)
      expect(out.toLowerCase()).not.toMatch(new RegExp(`\\b${t}\\b`));
  });
});
