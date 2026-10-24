import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate, loadConfig, serialize } from "../generate";
import { must } from "../lib/must";
import { validateDir } from "../validate";

// Update this only when a config or generator change is intended; then regenerate data/fixtures/a.
const EXPECTED_SHA256_A =
  "c11e775539cbe243a6270000ce016fa2862ef9679bc7e8b15e1efba0762151da";

const hashAll = (files: Record<string, string>) => {
  const h = createHash("sha256");
  for (const f of Object.keys(files).sort()) h.update(`${f}\n${files[f]}`);
  return h.digest("hex");
};

type Row = {
  id: string;
  checkId: string;
  subject: {
    workerId: string | null;
    jobId: string | null;
    entryIds: string[];
    expenseIds: string[];
  };
};
type Entry = {
  id: string;
  cycleId: string;
  workerId: string;
  startAt: string;
  durationSec: number;
  approved: boolean;
  ticking: boolean;
  jobId: string | null;
};

describe("seed generator, company a", () => {
  const files = serialize(generate(loadConfig("a")));
  const json = <T>(f: string) => JSON.parse(files[f]) as T;

  test("deterministic: two runs are byte-identical and match the pinned hash", () => {
    const again = serialize(generate(loadConfig("a")));
    expect(hashAll(again)).toBe(hashAll(files));
    expect(hashAll(files)).toBe(EXPECTED_SHA256_A);
  });

  test("committed data/fixtures/a is the generator output", () => {
    const dir = join(import.meta.dir, "..", "..", "data", "fixtures", "a");
    for (const [f, text] of Object.entries(files))
      expect(readFileSync(join(dir, f), "utf8")).toBe(text);
  });

  test("output validates against the section 6 mirror", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-a-"));
    for (const [f, text] of Object.entries(files))
      writeFileSync(join(dir, f), text);
    expect(validateDir(dir)).toEqual([]);
  });

  test("answer key covers every check CHK-01..CHK-22 and every subject id exists", () => {
    const key = json<Row[]>("answer-key.json");
    for (let i = 1; i <= 22; i++)
      expect(
        key.some((r) => r.checkId === `CHK-${String(i).padStart(2, "0")}`),
      ).toBe(true);
    expect(new Set(key.map((r) => r.id)).size).toBe(key.length);
  });

  test("ids from fixtures v1 (#1) are stable", () => {
    const entries = json<Entry[]>("timeEntries.json");
    for (let n = 101; n <= 140; n++)
      expect(
        entries.some((e) => e.id === `a-te-0${n}` && e.cycleId === "a-c05"),
      ).toBe(true);
    const ak = json<Row[]>("answer-key.json");
    expect(ak.slice(0, 8).map((r) => r.checkId)).toEqual([
      "CHK-01",
      "CHK-02",
      "CHK-03",
      "CHK-04",
      "CHK-05",
      "CHK-10",
      "CHK-11",
      "CHK-14",
    ]);
    expect(must(ak.find((r) => r.id === "a-ak-04")).subject.entryIds).toEqual([
      "a-te-0111",
      "a-te-0113",
    ]);
  });

  test("past cycles are clean: approved, no open timers, no long or zero shifts, no overlaps, job costs matched", () => {
    const entries = json<Entry[]>("timeEntries.json").filter(
      (e) => e.cycleId !== "a-c05",
    );
    expect(entries.length).toBeGreaterThan(200);
    for (const e of entries) {
      expect(e.approved && !e.ticking && e.jobId !== null).toBe(true);
      expect(e.durationSec > 0 && e.durationSec <= 11 * 3600).toBe(true);
    }
    const byWorker = new Map<string, Entry[]>();
    for (const e of entries)
      byWorker.set(e.workerId, [...(byWorker.get(e.workerId) ?? []), e]);
    for (const list of byWorker.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
      for (let i = 1; i < list.length; i++) {
        expect(
          Date.parse(list[i].startAt) >=
            Date.parse(list[i - 1].startAt) + list[i - 1].durationSec * 1000,
        ).toBe(true);
      }
    }
    const ex = json<
      { date: string; kind: string; matchedJobId: string | null }[]
    >("expenses.json").filter((x) => x.date < "2026-10-11");
    expect(ex.filter((x) => x.kind === "job_cost" && !x.matchedJobId)).toEqual(
      [],
    );
  });

  test("unknowns stay null, never zero", () => {
    const w =
      json<
        {
          id: string;
          venmoRateCents: number | null;
          jobber: { labourRateCents: number | null };
        }[]
      >("workers.json");
    expect(must(w.find((x) => x.id === "a-w10")).venmoRateCents).toBeNull();
    expect(
      must(w.find((x) => x.id === "a-w12")).jobber.labourRateCents,
    ).toBeNull();
  });
});
