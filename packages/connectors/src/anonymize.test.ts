// A-09 tests on SYNTHETIC input only: the committed export samples (fake names) play the "real" files.
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  Anonymizer,
  findRealTokens,
  jobKey,
  loadOrCreateSalt,
  nameKey,
  type PseudonymMap,
} from "./anonymize.ts";
import {
  buildTimesheetsXlsx,
  SAMPLE_ROWS,
} from "./exports/__fixtures__/make-samples.ts";
import { assertSafeToWrite, ingestR } from "./ingest-r.ts";

const sample = (n: string) =>
  fileURLToPath(new URL(`./exports/__fixtures__/${n}`, import.meta.url));
const SALT = "0".repeat(64);
const now = () => new Date("2026-10-24T12:00:00Z");

async function privateDirWithSamples() {
  const dir = join(await mkdtemp(join(tmpdir(), "pp-r-")), "r");
  await mkdir(dir, { recursive: true });
  await copyFile(
    sample("jobber-timesheets.sample.xlsx"),
    join(dir, "Timesheets Avery Reed.xlsx"),
  ); // a file name with a name in it
  await copyFile(
    sample("gusto-payroll-journal.sample.csv"),
    join(dir, "journal.csv"),
  );
  return dir;
}
const run = (dir: string, extra: Partial<Parameters<typeof ingestR>[0]> = {}) =>
  ingestR({
    privateDir: dir,
    timezone: "America/Los_Angeles",
    timesheets: [join(dir, "Timesheets Avery Reed.xlsx")],
    journals: [join(dir, "journal.csv")],
    now,
    ...extra,
  });

describe("Anonymizer", () => {
  it("keys one person the same across name formats; jobs by number", () => {
    expect(nameKey("Park, Riley")).toBe(nameKey("riley  PARK"));
    expect(nameKey("Sam O'Neil, Jr.")).toBe("jr oneil sam");
    expect(jobKey("Job #101 - Spring cleanup")).toBe(jobKey("#101"));
  });

  it("is deterministic for a salt and never reuses a pseudonym or echoes a real word", () => {
    const a = new Anonymizer(SALT);
    const b = new Anonymizer(SALT);
    a.reserve(["Avery Reed", "Jordan Ellis"]);
    b.reserve(["Avery Reed", "Jordan Ellis"]);
    const fa = a.workerName("Avery Reed");
    expect(b.workerName("Avery Reed")).toBe(fa);
    expect(fa).not.toMatch(/avery|reed|jordan|ellis/i);
    expect(a.workerName("Jordan Ellis")).not.toBe(fa);
    expect(a.workerName("Reed, Avery")).toBe(fa);
    expect(new Anonymizer("1".repeat(64)).id("w", "Avery Reed")).not.toBe(
      a.id("w", "Avery Reed"),
    );
    expect(a.clientName("Brookside Dental")).toBe("Client C01");
    expect(a.job("Job #101 - Spring cleanup")).toEqual({
      label: "Job J001",
      number: 1,
    });
  });

  it("finds real tokens across punctuation and case", () => {
    expect(findRealTokens('{"n":"O\'NEIL"}', ["oneil"])).toEqual(["oneil"]);
    expect(findRealTokens('{"n":"Parkside"}', ["park"])).toEqual([]);
  });

  it("salt is created once, 0600, and reused", async () => {
    const p = join(await mkdtemp(join(tmpdir(), "pp-salt-")), "r", "salt");
    const s1 = await loadOrCreateSalt(p);
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    if (process.platform !== "win32")
      expect((await stat(p)).mode & 0o777).toBe(0o600);
    expect(await loadOrCreateSalt(p)).toBe(s1);
  });
});

describe("ingest-r on synthetic 'real' exports", () => {
  it("writes anonymized JSON under out/ with no token from the pseudonym-map keys anywhere", async () => {
    const dir = await privateDirWithSamples();
    const counts = await run(dir);
    expect(counts).toMatchObject({
      workers: 5,
      clients: 2,
      jobs: 2,
      timeEntries: 4,
      paidRows: 3,
    });
    expect(counts.syncRuns.every((s) => s.complete)).toBe(true);
    expect(counts.outPath?.startsWith(join(dir, "out"))).toBe(true);

    const out = await readFile(counts.outPath as string, "utf8");
    const map = JSON.parse(
      await readFile(join(dir, "pseudonyms.json"), "utf8"),
    ) as PseudonymMap;
    const keyTokens = [...Object.keys(map.workers), ...Object.keys(map.clients)]
      .flatMap((k) => k.split(" "))
      .filter((t) => t.length >= 3);
    expect(keyTokens).toEqual(
      expect.arrayContaining([
        "avery",
        "reed",
        "jordan",
        "ellis",
        "riley",
        "park",
        "casey",
        "moore",
        "oneil",
        "brookside",
        "dental",
        "maple",
        "grove",
        "hoa",
      ]),
    );
    for (const t of keyTokens)
      expect(out.toLowerCase().replace(/'/g, "")).not.toMatch(
        new RegExp(`\\b${t}\\b`),
      );
    // job titles and the file name are gone too
    expect(out).not.toMatch(/Spring cleanup|Total care|Timesheets Avery/);
    const bundle = JSON.parse(out);
    expect(bundle.namesAnonymized).toBe(true);
    expect(bundle.timeEntries[0]).toMatchObject({
      durationSec: 30600,
      label: null,
      hasNote: false,
      approved: true,
    });
    expect(
      bundle.paid.map((p: { grossCents: number }) => p.grossCents),
    ).toEqual([234500, 250000, 31850]);
    // private files are 0600; the token list exists for the repo-wide grep
    if (process.platform !== "win32")
      for (const f of ["salt", "pseudonyms.json", "real-tokens.txt"])
        expect((await stat(join(dir, f))).mode & 0o777).toBe(0o600);
    expect(
      (await readFile(join(dir, "real-tokens.txt"), "utf8")).split("\n"),
    ).toContain("reed");
  });

  it("the same worker in the timesheet and the journal gets one id (the M4 join)", async () => {
    const dir = await privateDirWithSamples();
    const rows = [
      ...SAMPLE_ROWS,
      [
        "2026-10-16",
        "Riley Park",
        null,
        null,
        "General",
        null,
        null,
        2,
        "Yes",
        null,
      ],
    ];
    await writeFile(
      join(dir, "Timesheets Avery Reed.xlsx"),
      Buffer.from(await buildTimesheetsXlsx(rows, null)),
    );
    const bundle = JSON.parse(
      await readFile((await run(dir)).outPath as string, "utf8"),
    );
    const riley = bundle.paid[0].workerId;
    expect(bundle.timeEntries.at(-1).workerId).toBe(riley);
  });

  it("is stable across runs (map and salt reused)", async () => {
    const dir = await privateDirWithSamples();
    const first = JSON.parse(
      await readFile((await run(dir)).outPath as string, "utf8"),
    );
    const second = JSON.parse(
      await readFile(
        (await run(dir, { now: () => new Date("2026-10-24T13:00:00Z") }))
          .outPath as string,
        "utf8",
      ),
    );
    expect(second.workers).toEqual(first.workers);
  });

  it("dry run writes no output and no map", async () => {
    const dir = await privateDirWithSamples();
    const c = await run(dir, { dryRun: true });
    expect(c.outPath).toBeNull();
    expect((await readdir(dir)).sort()).toEqual([
      "Timesheets Avery Reed.xlsx",
      "journal.csv",
      "salt",
    ]);
  });

  it("refuses inputs outside the private dir", async () => {
    const dir = await privateDirWithSamples();
    await expect(
      run(dir, { timesheets: [sample("jobber-timesheets.sample.xlsx")] }),
    ).rejects.toThrow(/inside the private dir/);
  });

  it("refuses to write un-anonymized reader output or anything holding a real token", () => {
    expect(() =>
      assertSafeToWrite(
        { rows: [{ workerName: "Avery Reed" }], namesAnonymized: false },
        ["avery"],
      ),
    ).toThrow(/not anonymized/);
    expect(() =>
      assertSafeToWrite({ namesAnonymized: true, note: "paid Avery" }, [
        "avery",
        "reed",
      ]),
    ).toThrow(/found 1 real token/);
    expect(() =>
      assertSafeToWrite({ namesAnonymized: true, note: "paid Avery" }, [
        "avery",
      ]),
    ).not.toThrow(/Avery/);
    expect(
      assertSafeToWrite({ namesAnonymized: true, n: "Quinn Ashby" }, ["avery"]),
    ).toContain("Quinn Ashby");
  });
});
