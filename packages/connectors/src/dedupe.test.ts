// Overlapping exports, on SYNTHETIC replicas (fake names).
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CrossFileDedupe, noteDuplicates } from "./dedupe.ts";
import { JOBBER_TIMESHEETS_CSV } from "./exports/__fixtures__/make-r-replicas.ts";
import { INVOICES_REPORT_CSV } from "./exports/__fixtures__/make-r-report-replicas.ts";
import { ingestR } from "./ingest-r.ts";

describe("CrossFileDedupe", () => {
  it("drops across files only, never within one; copies beyond an earlier file's count stay", () => {
    const d = new CrossFileDedupe<string>((s) => s);
    expect(d.take(["a", "a", "b"])).toEqual({
      rows: ["a", "a", "b"],
      dropped: 0,
    });
    expect(d.take(["a", "b", "b", "c"])).toEqual({
      rows: ["b", "c"],
      dropped: 2,
    });
    expect(d.take(["a", "a", "a", "b", "b"])).toEqual({
      rows: ["a"],
      dropped: 4,
    });
  });

  it("notes the drops without making the run incomplete", () => {
    const run = {
      id: "x",
      companyId: "r",
      cycleId: null,
      source: "export" as const,
      object: "timeSheetEntries",
      startedAt: "",
      finishedAt: "",
      pulled: 3,
      expected: 3,
      complete: true,
      method: "m",
      error: null,
    };
    expect(noteDuplicates(run, 0)).toBe(run);
    expect(noteDuplicates(run, 2)).toMatchObject({
      complete: true,
      error: "note: 2 duplicate entries across overlapping exports",
    });
  });
});

// a second Timesheets export overlapping the replica on Sep 2-4, plus Sep 5 (entered twice: a real flag)
const OVERLAP_TIMESHEETS_CSV = [
  "Totals",
  "",
  "Total Hours,12.50",
  "Jordan Ellis ,5.00",
  "Sam Okafor,5.50",
  "",
  "Name,Date,Start time,End time,Hours,Working on,Note,Client name",
  'Jordan Ellis ,"Sep 2, 2026", 1:00PM,6:00PM,5.00,Maple Grove HOA - Off-Site,"gate code fake",Maple Grove HOA',
  'Sam Okafor ,"Sep 2, 2026", 9:00AM, 9:00AM,0.0,Request for hedge quote,"",Maple Grove HOA',
  'Sam Okafor,"Sep 3, 2026", 8:00AM,11:30AM,3.50,Job #521 - Maple Grove HOA,"",Maple Grove HOA',
  'Sam Okafor ,"Sep 4, 2026", 8:00AM,10:00AM,2.00,Job #521 - Maple Grove HOA,"",Maple Grove HOA',
  'Sam Okafor,"Sep 5, 2026", 8:00AM,9:00AM,1.00,Job #521 - Maple Grove HOA,"",Maple Grove HOA',
  'Sam Okafor,"Sep 5, 2026", 8:00AM,9:00AM,1.00,Job #521 - Maple Grove HOA,"",Maple Grove HOA',
  "Report totals:,,,,12.50,,,",
].join("\n");

describe("ingest-r with overlapping exports (replicas)", () => {
  it("keeps one copy of each entry across files (the first file's), keeps in-file repeats, notes the drops", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pp-dedupe-")), "r");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "Timesheets A.csv"), JOBBER_TIMESHEETS_CSV);
    await writeFile(join(dir, "Timesheets B.csv"), OVERLAP_TIMESHEETS_CSV);
    await writeFile(join(dir, "Invoices A.csv"), INVOICES_REPORT_CSV);
    await writeFile(join(dir, "Invoices B.csv"), `${INVOICES_REPORT_CSV}\n`);
    const c = await ingestR({
      privateDir: dir,
      timezone: "America/New_York",
      timesheets: [
        join(dir, "Timesheets A.csv"),
        join(dir, "Timesheets B.csv"),
      ],
      journals: [],
      invoices: [join(dir, "Invoices A.csv"), join(dir, "Invoices B.csv")],
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    // 7 + 6 read; 4 overlap dropped from B; both Sep 5 rows stay. Invoices: B repeats both of A.
    expect(c).toMatchObject({
      timeEntries: 9,
      invoices: 2,
      duplicatesAcrossFiles: 6,
    });
    expect(c.syncRuns.every((s) => s.complete)).toBe(true);
    const b = JSON.parse(await readFile(c.outPath as string, "utf8"));
    const sources = b.timeEntries.map((e: { sourceId: string }) => e.sourceId);
    const tagA = (sources[0] as string).split("#")[0];
    // the overlapping entries keep the first file's sourceId
    expect(
      sources.slice(0, 7).every((s: string) => s.startsWith(`${tagA}#`)),
    ).toBe(true);
    expect(sources.slice(7).some((s: string) => s.startsWith(`${tagA}#`))).toBe(
      false,
    );
    // Sam on Sep 3: one entry, not two
    const hours = b.timeEntries.filter(
      (e: { date: string }) => e.date === "2026-09-03",
    );
    expect(hours).toHaveLength(1);
    expect(
      b.syncRuns.map((s: { error: string | null }) => s.error ?? ""),
    ).toEqual([
      expect.not.stringContaining("duplicate"),
      expect.stringContaining(
        "note: 4 duplicate entries across overlapping exports",
      ),
      expect.not.stringContaining("duplicate"),
      expect.stringContaining(
        "note: 2 duplicate entries across overlapping exports",
      ),
    ]);
  });
});
