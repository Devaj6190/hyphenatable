// m4-rules-build and the Monday workweek, on synthetic private-style inputs only (eval/fixtures/r-build: every
// name is invented). Never reads data/private/r.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { REPO, readJson } from "../lib/io";
import { AnonBundle, backtestR, MULTI_RATE, RSetup } from "../m4-r";
import {
  assertNoNames,
  buildRules,
  nameKey,
  OwnerFacts,
  Pseudonyms,
  runBuild,
} from "../m4-rules-build";

const DIR = join(import.meta.dirname, "../fixtures/r-build");
const facts = OwnerFacts.parse(readJson(join(DIR, "owner-facts.json")));
const pseudonyms = Pseudonyms.parse(readJson(join(DIR, "pseudonyms.json")));
const bundle = AnonBundle.parse(readJson(join(DIR, "out/r-build-sample.json")));

describe("m4-rules-build", () => {
  const { setup, counts } = buildRules(facts, pseudonyms, bundle);
  test("names resolve by first-name word; ambiguous (two Sams) and missing (Zed) are unresolved, never guessed", () => {
    expect(nameKey("Riley  PARK")).toBe("park riley");
    expect(counts).toEqual({
      workers: 9,
      hourly: 5,
      multiRate: 1,
      salaried: 1,
      venmo: 2,
      excludedOther: 0,
      namesResolved: 6,
      namesUnresolved: 2,
      stage2Recipients: 1,
    });
    expect(setup.stage2RecipientIds).toEqual(["r:w:t009"]);
  });
  test("rates from the journal; several Regular rates → multiRate; Venmo excluded as paid outside Gusto", () => {
    const w = new Map(setup.workers.map((x) => [x.id, x]));
    expect(w.get("r:w:t001")).toEqual({
      id: "r:w:t001",
      payType: "hourly",
      rateCents: 2500,
      paymentUnit: "Hour",
    });
    // a Commission pay type never sets the hourly rate
    expect(w.get("r:w:t009")?.rateCents).toBe(2200);
    expect(w.get("r:w:t007")).toMatchObject({
      multiRate: true,
      rates: [2000, 2500],
      rateCents: null,
    });
    expect(w.get("r:w:t008")).toMatchObject({
      payType: "salary",
      rateCents: 250000,
      paymentUnit: "Paycheck",
    });
    // moved from Venmo to Gusto: hourly, not Venmo
    expect(w.get("r:w:t006")).toMatchObject({
      payType: "hourly",
      rateCents: 2100,
    });
    expect(setup.excluded).toEqual([
      { id: "r:w:t004", reason: "paid outside Gusto" },
      { id: "r:w:t005", reason: "paid outside Gusto" },
    ]);
  });
  test("a Monday workweek becomes the overtime rule; the setup validates for m4-r", () => {
    expect(setup.rules[0].params).toMatchObject({
      workweek: "Monday-Sunday",
      weeklyHours: 40,
      multiplier: 1.5,
    });
    expect(setup.rules[1]).toMatchObject({
      type: "long_shift_threshold",
      params: { hours: 8 },
    });
    expect(RSetup.safeParse(setup).success).toBe(true);
  });
  test("the output holds ids only; the leak check refuses a real-name word", () => {
    const json = JSON.stringify(setup);
    expect(() => assertNoNames(json, facts, pseudonyms)).not.toThrow();
    for (const word of [
      "talia",
      "ortiz",
      "kepler",
      "wren",
      "jory",
      "pell",
      "nico",
      "ada",
      "finch",
      "zed",
    ])
      expect(json.toLowerCase()).not.toContain(word);
    expect(() => assertNoNames(`${json} "Talia"`, facts, pseudonyms)).toThrow(
      /real-name word/,
    );
  });
});

describe("runBuild writes only inside data/private/", () => {
  mkdirSync(join(REPO, "data/private"), { recursive: true });
  const tmp = mkdtempSync(join(REPO, "data/private/", "_m4-build-selftest-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  test("refuses the fixtures folder; writes m4-rules.json in a private dir", () => {
    expect(() => runBuild(DIR)).toThrow(/data\/private/);
    cpSync(DIR, tmp, { recursive: true });
    expect(runBuild(tmp).hourly).toBe(5);
    expect(
      RSetup.parse(JSON.parse(readFileSync(join(tmp, "m4-rules.json"), "utf8")))
        .workers,
    ).toHaveLength(9);
  });
});

describe("m4-r: Monday workweek, Stage 2 pay left out, separate reasons", () => {
  // Period Mon 2026-09-14 .. Sun 2026-09-27. Mon–Thu 9 h (36 h) + Sun 2026-09-20 8 h.
  // Monday workweek: 44 h in week 1 → 40 + 4 OT at $20 = 80000 + 12000 = 92000¢.
  // Sunday workweek: 36 h and 8 h in two weeks → no OT, 88000¢.
  const day = (d: string, h: number, n: number) => ({
    id: `te-${n}`,
    workerId: "r:w:m1",
    jobId: null,
    startAt: `2026-09-${d}T15:00:00.000Z`,
    endAt: null,
    durationSec: h * 3600,
    approved: true,
    payable: true,
    category: "GENERAL",
    date: `2026-09-${d}`,
  });
  const b: AnonBundle = {
    namesAnonymized: true,
    companyId: "r",
    workers: [
      { id: "r:w:m1", displayName: "x" },
      { id: "r:w:m2", displayName: "y" },
      { id: "r:w:m3", displayName: "z" },
    ],
    timeEntries: [
      day("14", 9, 1),
      day("15", 9, 2),
      day("16", 9, 3),
      day("17", 9, 4),
      day("20", 8, 5),
      { ...day("15", 8, 6), workerId: "r:w:m2" },
    ],
    paid: [
      {
        workerId: "r:w:m1",
        periodStart: "2026-09-14",
        periodEnd: "2026-09-27",
        grossCents: 97000,
        sourceId: "p1",
        sectionKind: "regular",
        payKind: "wage",
        earningsCents: {
          "Regular Hours": 80000,
          Overtime: 12000,
          Commission: 5000,
        },
        hours: { "Regular Hours": 40, Overtime: 4 },
      },
      {
        workerId: "r:w:m1",
        periodStart: "2026-09-14",
        periodEnd: "2026-09-27",
        grossCents: 30000,
        sourceId: "p2",
        sectionKind: "off_cycle",
        payKind: "wage",
      },
      {
        workerId: "r:w:m2",
        periodStart: "2026-09-14",
        periodEnd: "2026-09-27",
        grossCents: 16000,
        sourceId: "p3",
        sectionKind: "regular",
        payKind: "wage",
      },
    ],
  };
  const setup = (workweek: string): RSetup => ({
    source: "owner_stated",
    timezone: "America/Los_Angeles",
    payFrequency: "biweekly",
    workers: [
      { id: "r:w:m1", payType: "hourly", rateCents: 2000, paymentUnit: "Hour" },
      {
        id: "r:w:m2",
        payType: "hourly",
        rateCents: null,
        paymentUnit: "Hour",
        multiRate: true,
        rates: [1800, 2200],
      },
      {
        id: "r:w:m3",
        payType: "contractor_venmo",
        rateCents: null,
        paymentUnit: null,
      },
    ],
    excluded: [{ id: "r:w:m3", reason: "paid outside Gusto" }],
    rules: [
      {
        id: "ot",
        companyId: "r",
        type: "overtime_policy",
        params: {
          weeklyHours: 40,
          multiplier: 1.5,
          dailyHours: null,
          workweek,
        },
        status: "active",
      },
    ],
  });
  test("Monday-Sunday matches the paid Stage 1 wages exactly; Sunday-Saturday would not", () => {
    const mon = backtestR(b, setup("Monday-Sunday"), null);
    expect(mon.pre).toMatchObject({
      compared: 1,
      exact: 1,
      separate: { [MULTI_RATE]: 1 },
    });
    const sun = backtestR(b, setup("Sunday-Saturday"), null);
    expect(sun.pre).toMatchObject({
      compared: 1,
      exact: 0,
      maxDiffCents: 4000,
    });
    expect(mon.notes.join("\n")).toContain("Stage 2 pay types");
  });
});
