import { describe, expect, test } from "vitest";
import { entry, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-02";

const open = { endAt: null, ticking: true, durationSec: 3 * 3600 };

describe("CHK-02 open_timer", () => {
  test("flags a ticking entry", () => {
    const flags = valid(run(input([entry({ id: "te_1", ...open })]), []));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      id: "CHK-02:cy_1:te_1",
      checkId: "CHK-02",
      routeTo: "manager",
      subject: { workerId: "w_01", jobId: "job_01", entryIds: ["te_1"] },
      seen: "Entry te_1 for w_01 started on 2026-10-07 is still running at cutoff (3.00 h so far).",
    });
  });

  test("skips a stopped entry", () => {
    expect(run(input([entry({ id: "te_1" })]), [])).toEqual([]);
  });

  test("one flag per ticking entry, other cycles ignored", () => {
    const flags = run(
      input([
        entry({ id: "te_1", ...open }),
        entry({ id: "te_2", ...open, workerId: "w_02" }),
        entry({ id: "te_3", ...open, cycleId: "cy_0" }),
      ]),
      [],
    );
    expect(flags.map((f) => f.id)).toEqual([
      "CHK-02:cy_1:te_1",
      "CHK-02:cy_1:te_2",
    ]);
  });
});
