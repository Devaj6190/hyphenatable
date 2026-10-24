import { describe, expect, test } from "vitest";
import { entry, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-06";

const unapproved = { approved: false, approvedBy: null };

describe("CHK-06 unapproved_at_cutoff", () => {
  test("one flag per worker listing all unapproved entries, routed to the owner", () => {
    const flags = valid(
      run(
        input([
          entry({ id: "te_3", ...unapproved, jobId: "job_02" }),
          entry({ id: "te_1", ...unapproved }),
          entry({ id: "te_2" }),
          entry({ id: "te_4", ...unapproved, workerId: "w_02" }),
        ]),
        [],
      ),
    );
    expect(flags).toHaveLength(2);
    expect(flags[0]).toMatchObject({
      id: "CHK-06:cy_1:te_1,te_3",
      routeTo: "owner",
      subject: { workerId: "w_01", jobId: null, entryIds: ["te_1", "te_3"] },
      affects: { workerId: "w_01", jobId: null, dollarsCents: null },
      seen: "2 entries for w_01 not approved at cutoff: te_1, te_3.",
    });
    expect(flags[1]).toMatchObject({
      id: "CHK-06:cy_1:te_4",
      subject: { workerId: "w_02", jobId: "job_01", entryIds: ["te_4"] },
      seen: "1 entry for w_02 not approved at cutoff: te_4.",
    });
  });

  test("approved entries are not flagged", () => {
    expect(
      run(input([entry({ id: "te_1" }), entry({ id: "te_2" })]), []),
    ).toEqual([]);
  });

  test("ignores entries of another cycle", () => {
    const flags = run(
      input([entry({ id: "te_1", ...unapproved, cycleId: "cy_0" })]),
      [],
    );
    expect(flags).toEqual([]);
  });
});
