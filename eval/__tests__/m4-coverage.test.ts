// M4 coverage: only pay periods fully inside the timesheet export window are compared; per-period counts; the
// 2-dp entry-rounding split of "within $1". Synthetic data only.
import { describe, expect, test } from "vitest";
import {
  type AnonBundle,
  backtestR,
  coverageOf,
  exportWindow,
  OUTSIDE_WINDOW,
  type RSetup,
} from "../m4-r";
import { describeSummary } from "../m4-r-run";

const entry = (n: number, workerId: string, date: string, sec: number) => ({
  id: `te-${n}`,
  workerId,
  jobId: null,
  startAt: `${date}T15:00:00.000Z`,
  endAt: null,
  durationSec: sec,
  approved: true,
  payable: true,
  category: "GENERAL",
  date,
});
const days = (ds: string[]) => ds.map((d) => `2026-${d}`);
let n = 0;
const es = [
  // P2 (partly covered): the export starts Tue Aug 4
  ...days(["08-04", "08-05", "08-06", "08-07"]).map((d) =>
    entry(++n, "r:w:c1", d, 8 * 3600),
  ),
  // P3 (covered): two Mon–Fri weeks of 8 h
  ...days([
    "08-10",
    "08-11",
    "08-12",
    "08-13",
    "08-14",
    "08-17",
    "08-18",
    "08-19",
    "08-20",
    "08-21",
  ]).map((d) => entry(++n, "r:w:c1", d, 8 * 3600)),
  // P4 (covered): ten entries of 7.995 h (79.95 h, 159900¢); Jobber rounds each to 8.00 h, so Gusto paid 80.00 h
  ...days([
    "08-24",
    "08-25",
    "08-26",
    "08-27",
    "08-28",
    "08-31",
    "09-01",
    "09-02",
    "09-03",
    "09-04",
  ]).map((d) => entry(++n, "r:w:c1", d, 28782)),
  entry(++n, "r:w:c2", "2026-08-25", 8 * 3600),
];
const paid = (
  workerId: string,
  from: string,
  to: string,
  grossCents: number,
) => ({
  workerId,
  periodStart: from,
  periodEnd: to,
  grossCents,
  sourceId: `p-${workerId}-${from}`,
});
const P1 = ["2026-06-14", "2026-06-27"] as const;
const P2 = ["2026-07-26", "2026-08-08"] as const;
const P3 = ["2026-08-09", "2026-08-22"] as const;
const P4 = ["2026-08-23", "2026-09-05"] as const;
const bundle: AnonBundle = {
  namesAnonymized: true,
  companyId: "r",
  workers: ["c1", "c2", "c3"].map((s) => ({ id: `r:w:${s}`, displayName: s })),
  timeEntries: es,
  paid: [
    paid("r:w:c1", ...P1, 160000),
    paid("r:w:c1", ...P2, 160000),
    paid("r:w:c1", ...P3, 160000),
    paid("r:w:c1", ...P4, 160000), // 80.00 h × $20, 100¢ over the unrounded 79.95 h
    paid("r:w:c2", ...P4, 16050), // 50¢ more than 8 h × $20: not explainable by one entry's rounding (≤ 10¢)
    paid("r:w:c3", ...P3, 50000),
  ],
};
const setup: RSetup = {
  source: "owner_stated",
  timezone: "America/Los_Angeles",
  payFrequency: "biweekly",
  workers: [
    { id: "r:w:c1", payType: "hourly", rateCents: 2000, paymentUnit: "Hour" },
    { id: "r:w:c2", payType: "hourly", rateCents: 2000, paymentUnit: "Hour" },
  ],
  excluded: [{ id: "r:w:c3", reason: "no regular rate in the journal" }],
  rules: [
    {
      id: "ot",
      companyId: "r",
      type: "overtime_policy",
      params: {
        weeklyHours: 40,
        multiplier: 1.5,
        dailyHours: null,
        workweek: "Sunday-Saturday",
      },
      status: "active",
    },
  ],
};

describe("M4 coverage by the timesheet export window", () => {
  test("coverage of a period", () => {
    const w = {
      from: "2026-08-04",
      to: "2026-09-05",
      source: "given" as const,
    };
    expect(coverageOf(...P1, w)).toBe("none");
    expect(coverageOf(...P2, w)).toBe("partial");
    expect(coverageOf(...P3, w)).toBe("full");
    expect(coverageOf(...P4, w)).toBe("full");
  });
  test("only fully covered periods are compared; the rest are counted, with per-period stats and the rounding split", () => {
    const r = backtestR(bundle, setup, null, {
      from: "2026-08-04",
      to: "2026-09-05",
    });
    expect(r.coverage).toEqual({ full: 2, partial: 1, none: 1 });
    expect(r.window).toEqual({
      from: "2026-08-04",
      to: "2026-09-05",
      source: "given",
    });
    expect(r.pre).toMatchObject({
      compared: 3,
      exact: 1,
      within100: 3,
      withinRounding: 1, // c1 in P4: 100¢ ≤ 0.005 h × 10 entries × 2000¢
      maxDiffCents: 100,
      unmatched: 0,
      separate: { [OUTSIDE_WINDOW]: 2, "no regular rate in the journal": 1 },
    });
    expect(r.pre.perPeriod).toEqual([
      {
        period: `${P1[0]}..${P1[1]}`,
        coverage: "none",
        compared: 0,
        exact: 0,
        within100: 0,
        withinRounding: 0,
        maxDiffCents: 0,
      },
      {
        period: `${P2[0]}..${P2[1]}`,
        coverage: "partial",
        compared: 0,
        exact: 0,
        within100: 0,
        withinRounding: 0,
        maxDiffCents: 0,
      },
      {
        period: `${P3[0]}..${P3[1]}`,
        coverage: "full",
        compared: 1,
        exact: 1,
        within100: 1,
        withinRounding: 0,
        maxDiffCents: 0,
      },
      {
        period: `${P4[0]}..${P4[1]}`,
        coverage: "full",
        compared: 2,
        exact: 0,
        within100: 2,
        withinRounding: 1,
        maxDiffCents: 100,
      },
    ]);
  });
  test("without --from/--to the window is the min and max entry date (a trailing Saturday off makes P4 partial)", () => {
    expect(exportWindow(bundle.timeEntries)).toEqual({
      from: "2026-08-04",
      to: "2026-09-04",
      source: "entries",
    });
    const r = backtestR(bundle, setup, null);
    expect(r.coverage).toEqual({ full: 1, partial: 2, none: 1 });
  });
  test("the printed summary is counts only, per period", () => {
    const r = backtestR(bundle, setup, null, {
      from: "2026-08-04",
      to: "2026-09-05",
    });
    const text = describeSummary({
      status: "measured",
      measuredAt: "2026-10-25T00:00:00.000Z",
      rulesSource: "owner_stated",
      periods: r.periods.length,
      window: r.window,
      coverage: r.coverage,
      notes: r.notes,
      pre: r.pre,
      post: r.post,
    }).join("\n");
    expect(text).toContain("2 fully covered, 1 partly, 1 not covered");
    expect(text).toContain(
      "1 of 3 exact, 3 within $1 (1 explained by 2-dp entry rounding)",
    );
    expect(text).toContain(`2 not compared (${OUTSIDE_WINDOW})`);
    expect(text).toContain(
      `  ${P4[0]}..${P4[1]}: 0 of 2 exact, 2 within $1 (1 rounding), max diff 100¢`,
    );
    expect(text).not.toContain("r:w:");
  });
});
