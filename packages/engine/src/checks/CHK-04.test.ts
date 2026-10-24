import { describe, expect, test } from "vitest";
import { entry, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-04";
import { run as chk05 } from "./CHK-05";

const T0 = Date.parse("2026-10-07T15:00:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();

/** An entry from T0 + startSec to T0 + endSec. */
const span = (
  id: string,
  startSec: number,
  endSec: number,
  workerId = "w_01",
) =>
  entry({
    id,
    workerId,
    startAt: at(startSec),
    endAt: at(endSec),
    durationSec: endSec - startSec,
  });

const pairs = (flags: ReturnType<typeof run>) =>
  valid(flags).map((f) => f.subject.entryIds);

describe("CHK-04 overlap", () => {
  test("flags two overlapping entries as one pair", () => {
    const flags = valid(
      run(
        input([span("te_1", 0, 4 * 3600), span("te_2", 3 * 3600, 6 * 3600)]),
        [],
      ),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      id: "CHK-04:cy_1:te_1,te_2",
      checkId: "CHK-04",
      routeTo: "manager",
      confidence: "certain",
      subject: {
        workerId: "w_01",
        jobId: "job_01",
        entryIds: ["te_1", "te_2"],
      },
      where: [
        { system: "jobber", recordId: "jobber_te_1", url: null },
        { system: "jobber", recordId: "jobber_te_2", url: null },
      ],
      seen: "Entries te_1 and te_2 for w_01 on 2026-10-07 overlap by 60 min.",
    });
  });

  test("touching intervals do not overlap", () => {
    expect(
      run(input([span("te_1", 0, 3600), span("te_2", 3600, 7200)]), []),
    ).toEqual([]);
  });

  test("exactly 60 s of overlap is tolerated", () => {
    expect(
      run(input([span("te_1", 0, 3600), span("te_2", 3540, 7200)]), []),
    ).toEqual([]);
  });

  test("61 s of overlap is flagged", () => {
    const flags = run(
      input([span("te_1", 0, 3600), span("te_2", 3539, 7200)]),
      [],
    );
    expect(pairs(flags)).toEqual([["te_1", "te_2"]]);
  });

  test("an entry inside another is flagged", () => {
    const flags = run(
      input([span("te_1", 0, 8 * 3600), span("te_2", 3600, 7200)]),
      [],
    );
    expect(pairs(flags)).toEqual([["te_1", "te_2"]]);
  });

  test("three mutually overlapping entries give three pairs, each once", () => {
    const flags = run(
      input([
        span("te_3", 0, 3 * 3600),
        span("te_1", 600, 3 * 3600),
        span("te_2", 1200, 3 * 3600),
      ]),
      [],
    );
    expect(pairs(flags)).toEqual([
      ["te_1", "te_2"],
      ["te_1", "te_3"],
      ["te_2", "te_3"],
    ]);
  });

  test("a chain flags only the pairs that intersect", () => {
    // te_1 overlaps te_2, te_2 overlaps te_3, te_1 and te_3 do not meet.
    const flags = run(
      input([
        span("te_1", 0, 2 * 3600),
        span("te_2", 3600, 4 * 3600),
        span("te_3", 3 * 3600, 5 * 3600),
      ]),
      [],
    );
    expect(pairs(flags)).toEqual([
      ["te_1", "te_2"],
      ["te_2", "te_3"],
    ]);
  });

  test("different workers never overlap", () => {
    const flags = run(
      input([
        span("te_1", 0, 4 * 3600, "w_01"),
        span("te_2", 0, 4 * 3600, "w_02"),
      ]),
      [],
    );
    expect(flags).toEqual([]);
  });

  test("an entry never pairs with itself, even if listed twice", () => {
    const e = span("te_1", 0, 4 * 3600);
    expect(run(input([e, e]), [])).toEqual([]);
  });

  test("an entry with no end runs for its duration", () => {
    const open = entry({
      id: "te_1",
      startAt: at(0),
      endAt: null,
      durationSec: 2 * 3600,
      ticking: true,
    });
    expect(pairs(run(input([open, span("te_2", 3600, 3 * 3600)]), []))).toEqual(
      [["te_1", "te_2"]],
    );
    expect(run(input([open, span("te_2", 2 * 3600, 3 * 3600)]), [])).toEqual(
      [],
    );
  });

  test("an exact duplicate pair is CHK-05's, not an overlap", () => {
    const dup = [span("te_1", 0, 4 * 3600), span("te_2", 0, 4 * 3600)];
    expect(run(input(dup), [])).toEqual([]);
    expect(chk05(input(dup), []).map((f) => f.subject.entryIds)).toEqual([
      ["te_1", "te_2"],
    ]);
  });

  test("a duplicate pair still overlaps a third entry", () => {
    const es = [
      span("te_1", 0, 4 * 3600),
      span("te_2", 0, 4 * 3600),
      span("te_3", 3600, 2 * 3600),
    ];
    expect(pairs(run(input(es), []))).toEqual([
      ["te_1", "te_3"],
      ["te_2", "te_3"],
    ]);
  });

  test("a same-start pair with different durations is an overlap", () => {
    const flags = run(
      input([span("te_1", 0, 4 * 3600), span("te_2", 0, 3 * 3600)]),
      [],
    );
    expect(pairs(flags)).toEqual([["te_1", "te_2"]]);
  });

  test("a same-start, same-duration pair on different jobs is an overlap", () => {
    const other = { ...span("te_2", 0, 4 * 3600), jobId: "job_02" };
    expect(pairs(run(input([span("te_1", 0, 4 * 3600), other]), []))).toEqual([
      ["te_1", "te_2"],
    ]);
  });

  test("ignores entries of another cycle", () => {
    const other = { ...span("te_2", 0, 4 * 3600), cycleId: "cy_0" };
    expect(run(input([span("te_1", 0, 4 * 3600), other]), [])).toEqual([]);
  });

  test("output does not depend on input order", () => {
    const es = [
      span("te_1", 0, 3 * 3600),
      span("te_2", 600, 3 * 3600),
      span("te_3", 1200, 3 * 3600),
    ];
    expect(run(input([...es].reverse()), [])).toEqual(run(input(es), []));
  });
});
