import { describe, expect, test } from "vitest";
import { entry, input, valid } from "./__fixtures__/build";
import { checks, runAll } from "./index";

/** One cycle with one planted error per check, plus a clean entry. */
const planted = () =>
  input([
    entry({ id: "te_01", jobId: null, visitId: null }), // CHK-01
    entry({ id: "te_02", workerId: "w_02", endAt: null, ticking: true }), // CHK-02
    entry({ id: "te_03", workerId: "w_03", durationSec: 13 * 3600 }), // CHK-03
    entry({
      id: "te_04a",
      workerId: "w_04",
      startAt: "2026-10-08T15:00:00Z",
      endAt: "2026-10-08T19:00:00Z",
      durationSec: 4 * 3600,
    }), // CHK-04
    entry({
      id: "te_04b",
      workerId: "w_04",
      startAt: "2026-10-08T18:00:00Z",
      endAt: "2026-10-08T22:00:00Z",
      durationSec: 4 * 3600,
    }),
    entry({
      id: "te_05",
      workerId: "w_05",
      durationSec: 0,
      endAt: "2026-10-07T15:00:00Z",
    }), // CHK-05
    entry({ id: "te_06", workerId: "w_06", approved: false, approvedBy: null }), // CHK-06
    entry({ id: "te_ok", workerId: "w_07" }),
  ]);

describe("checks registry", () => {
  test("covers time, worker and incomplete-sync checks once each, in order", () => {
    expect(checks.map((c) => c.id)).toEqual([
      "CHK-01",
      "CHK-02",
      "CHK-03",
      "CHK-04",
      "CHK-05",
      "CHK-06",
      "CHK-07",
      "CHK-08",
      "CHK-09",
      "CHK-10",
      "CHK-11",
      "CHK-12",
      "CHK-23",
    ]);
  });

  test("runAll catches each planted error and nothing on the clean entry", () => {
    const flags = valid(runAll(planted()));
    expect(flags.map((f) => f.id)).toEqual([
      "CHK-01:cy_1:te_01",
      "CHK-02:cy_1:te_02",
      "CHK-03:cy_1:te_03",
      "CHK-04:cy_1:te_04a,te_04b",
      "CHK-05:cy_1:te_05",
      "CHK-06:cy_1:te_06",
    ]);
    expect(flags.some((f) => f.subject.entryIds.includes("te_ok"))).toBe(false);
  });

  test("re-running is idempotent and independent of input order", () => {
    const a = planted();
    const b = { ...a, timeEntries: [...a.timeEntries].reverse() };
    expect(runAll(a)).toEqual(runAll(a));
    expect(runAll(b)).toEqual(runAll(a));
  });

  test("flag ids are unique", () => {
    const ids = runAll(planted()).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a clean cycle yields no flags", () => {
    expect(runAll(input([entry({ id: "te_1" })]))).toEqual([]);
  });
});
