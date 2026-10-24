import { describe, expect, test } from "vitest";
import { entry, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-05";

const zero = { durationSec: 0, endAt: "2026-10-07T15:00:00Z" };
const ids = (flags: ReturnType<typeof run>) =>
  valid(flags).map((f) => f.subject.entryIds);

describe("CHK-05 zero_or_duplicate", () => {
  test("flags a zero-length entry", () => {
    const flags = valid(run(input([entry({ id: "te_1", ...zero })]), []));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      id: "CHK-05:cy_1:te_1",
      routeTo: "manager",
      seen: "Entry te_1 for w_01 on 2026-10-07 has a duration of 0 h.",
    });
  });

  test("flags a duplicate group once with every id", () => {
    const flags = valid(
      run(
        input([
          entry({ id: "te_2" }),
          entry({ id: "te_1" }),
          entry({ id: "te_3" }),
        ]),
        [],
      ),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      id: "CHK-05:cy_1:te_1,te_2,te_3",
      subject: {
        workerId: "w_01",
        jobId: "job_01",
        entryIds: ["te_1", "te_2", "te_3"],
      },
      seen: "Entries te_1, te_2, te_3 for w_01 on 2026-10-07 have the same job, start and duration (8.00 h each).",
    });
  });

  test("zero-length duplicates are one group flag, not per-entry noise", () => {
    const flags = run(
      input([entry({ id: "te_1", ...zero }), entry({ id: "te_2", ...zero })]),
      [],
    );
    expect(ids(flags)).toEqual([["te_1", "te_2"]]);
  });

  test("same start written two ways is the same start", () => {
    const flags = run(
      input([
        entry({ id: "te_1", startAt: "2026-10-07T15:00:00Z" }),
        entry({ id: "te_2", startAt: "2026-10-07T15:00:00.000Z" }),
      ]),
      [],
    );
    expect(ids(flags)).toEqual([["te_1", "te_2"]]);
  });

  test("two entries with no job and the same start and duration are duplicates", () => {
    const flags = run(
      input([
        entry({ id: "te_1", jobId: null }),
        entry({ id: "te_2", jobId: null }),
      ]),
      [],
    );
    expect(ids(flags)).toEqual([["te_1", "te_2"]]);
  });

  test.each([
    ["worker", { workerId: "w_02" }],
    ["job", { jobId: "job_02" }],
    ["start", { startAt: "2026-10-07T15:00:01Z" }],
    ["duration", { durationSec: 8 * 3600 - 1 }],
  ])("a different %s is not a duplicate", (_, over) => {
    const flags = run(
      input([entry({ id: "te_1" }), entry({ id: "te_2", ...over })]),
      [],
    );
    expect(flags).toEqual([]);
  });

  test("a ticking entry at 0 s is a just-started timer, not a zero entry", () => {
    const started = { durationSec: 0, endAt: null, ticking: true };
    expect(run(input([entry({ id: "te_1", ...started })]), [])).toEqual([]);
  });

  test("a normal entry is not flagged", () => {
    expect(run(input([entry({ id: "te_1" })]), [])).toEqual([]);
  });

  test("the same record listed twice is not its own duplicate", () => {
    const e = entry({ id: "te_1" });
    expect(run(input([e, e]), [])).toEqual([]);
  });

  test("ignores entries of another cycle", () => {
    const flags = run(
      input([entry({ id: "te_1" }), entry({ id: "te_2", cycleId: "cy_0" })]),
      [],
    );
    expect(flags).toEqual([]);
  });
});
