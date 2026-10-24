// M2 and M4 for Company R, on synthetic anonymized samples only (eval/fixtures). Never reads data/private/r.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { REPO, readJson } from "../lib/io";
import { m2, m2FromGrades } from "../m2-rules";
import {
  AnonBundle,
  backtestR,
  localMidnight,
  M4Summary,
  RCorrections,
  RSetup,
} from "../m4-r";
import { insidePrivate, runM4R } from "../m4-r-run";

const SAMPLE = join(import.meta.dirname, "../fixtures/r-sample");
const bundle = AnonBundle.parse(
  readJson(join(SAMPLE, "out/r-exports-sample.json")),
);
const setup = RSetup.parse(readJson(join(SAMPLE, "m4-rules.json")));
const corrections = RCorrections.parse(
  readJson(join(SAMPLE, "corrections.json")),
);

describe("M2 rule grading (counts only)", () => {
  test("the example file gives counts and nothing else", () => {
    expect(
      m2(join(import.meta.dirname, "../fixtures/rule-grading.example.json")),
    ).toEqual({
      status: "measured",
      total: 4,
      match: 2,
      differ: 1,
      notLearned: 1,
    });
  });
  test("rule or runbook text cannot pass through", () => {
    const ok = { ruleId: "r-rule-1", runbookId: "RB-1", verdict: "match" };
    expect(() =>
      m2FromGrades([{ ...ok, ruleText: "pay overtime after 40 h" }]),
    ).toThrow();
    expect(() =>
      m2FromGrades([{ ...ok, runbookId: "Pay OT after forty hours" }]),
    ).toThrow();
    expect(() => m2FromGrades([{ ...ok, ruleId: null }])).toThrow(
      /null exactly when not_learned/,
    );
  });
  test("pending when the private file does not exist", () => {
    expect(m2(join(SAMPLE, "no-such-file.json")).status).toBe("pending");
  });
});

describe("M4 Company R backtest on a synthetic sample", () => {
  test("pre-correction: the duplicate entry inflates one worker; post-correction: all exact", () => {
    const r = backtestR(bundle, setup, corrections);
    expect(r.periods).toEqual(["2026-09-13..2026-09-26"]);
    // s0001: 45 h + 32 h → 72 regular + 5 OT at $25 = 198750¢ (paid 198750); s0003 salary 5200000/26 = 200000¢.
    // s0002: 48 h in week 2 with the duplicate → 8 h OT, 184000¢ vs paid 160000¢.
    expect(r.pre).toEqual({
      compared: 3,
      exact: 2,
      within100: 2,
      maxDiffCents: 24000,
      unmatched: 0,
      separate: {},
    });
    expect(r.post).toEqual({
      compared: 3,
      exact: 3,
      within100: 3,
      maxDiffCents: 0,
      unmatched: 0,
      separate: {},
    });
    const t = r.trails.pre.find((x) => x.workerId === "r:w:s0002");
    expect(t?.diffCents).toBe(24000);
    expect(t?.explain.join("\n")).toContain("Overtime 8.00 h");
    expect(r.notes).toEqual([
      "payable is unknown in the export; entries counted as worked",
      "some entries have no start time; placed at local noon of their date (never trimmed)",
    ]);
  });
  test("without corrections there is no post pass; without an overtime rule hourly workers are excluded", () => {
    expect(backtestR(bundle, setup, null).post).toBeNull();
    const r = backtestR(bundle, { ...setup, rules: [] }, null);
    expect(r.pre.unmatched).toBe(2);
    expect(r.notes[0]).toContain("no active overtime_policy");
  });
  test("local midnight in the company timezone", () => {
    expect(
      new Date(
        localMidnight("2026-09-13", "America/Los_Angeles"),
      ).toISOString(),
    ).toBe("2026-09-13T07:00:00.000Z");
    expect(
      new Date(localMidnight("2026-11-02", "America/New_York")).toISOString(),
    ).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("M4 runner: data/private/ only", () => {
  mkdirSync(join(REPO, "data/private"), { recursive: true });
  const tmp = mkdtempSync(join(REPO, "data/private/", "_m4-selftest-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  test("refuses any directory outside data/private/", () => {
    expect(insidePrivate(SAMPLE)).toBe(false);
    expect(insidePrivate(join(REPO, "data/private"))).toBe(false);
    expect(() =>
      runM4R(
        SAMPLE,
        join(SAMPLE, "m4-rules.json"),
        join(SAMPLE, "corrections.json"),
        new Date(),
      ),
    ).toThrow(/data\/private/);
  });
  test("writes trails and a counts-only summary under the private dir", () => {
    cpSync(SAMPLE, tmp, { recursive: true });
    const s = runM4R(
      tmp,
      join(tmp, "m4-rules.json"),
      join(tmp, "corrections.json"),
      new Date("2026-10-24T12:00:00.000Z"),
    );
    expect(M4Summary.parse(s).post?.exact).toBe(3);
    const files = readdirSync(join(tmp, "m4")).sort();
    expect(files).toEqual([
      "summary.json",
      "trails-2026-10-24T12-00-00-000Z.json",
    ]);
    expect(
      Object.keys(
        readJson<Record<string, unknown>>(join(tmp, "m4/summary.json")),
      ).sort(),
    ).toEqual(
      [
        "measuredAt",
        "notes",
        "periods",
        "post",
        "pre",
        "rulesSource",
        "status",
      ].sort(),
    );
    expect(existsSync(join(SAMPLE, "m4"))).toBe(false);
  });
});
