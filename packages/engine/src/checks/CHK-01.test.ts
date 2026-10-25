import { describe, expect, test } from "vitest";
import { entry, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-01";

const noJob = { jobId: null, visitId: null };

describe("CHK-01 hours_no_job", () => {
  test("flags an entry with no job, no visit and a work category", () => {
    const flags = valid(run(input([entry({ id: "te_1", ...noJob })]), []));
    expect(flags).toEqual([
      {
        id: "CHK-01:cy_1:te_1",
        companyId: "co_a",
        cycleId: "cy_1",
        checkId: "CHK-01",
        status: "open",
        subject: {
          workerId: "w_01",
          jobId: null,
          entryIds: ["te_1"],
          expenseIds: [],
        },
        seen: "Entry te_1 for w_01 on 2026-10-07 (8.00 h) has no job or visit.",
        where: [{ system: "jobber", recordId: "jobber_te_1", url: null }],
        confidence: "certain",
        precedent: null,
        routeTo: "manager",
        affects: { workerId: "w_01", jobId: null, dollarsCents: null },
        questionId: null,
        correctionId: null,
      },
    ]);
  });

  test("an unknown category (real export) is not exempt", () => {
    const flags = run(
      input([entry({ id: "te_1", ...noJob, category: null })]),
      [],
    );
    expect(flags.map((f) => f.id)).toEqual(["CHK-01:cy_1:te_1"]);
  });

  test("one flag per entry", () => {
    const flags = run(
      input([entry({ id: "te_1", ...noJob }), entry({ id: "te_2", ...noJob })]),
      [],
    );
    expect(flags.map((f) => f.subject.entryIds)).toEqual([["te_1"], ["te_2"]]);
  });

  test.each([
    "BREAK",
    "OFFICE",
    "DRIVING",
    "break",
    "Office",
    " driving ",
  ])("skips category %j", (category) => {
    expect(run(input([entry({ id: "te_1", ...noJob, category })]), [])).toEqual(
      [],
    );
  });

  test.each([
    "SUPPLIES",
    "GENERAL",
    "CUSTOM",
    "BREAKS",
  ])("flags category %j", (category) => {
    expect(
      run(input([entry({ id: "te_1", ...noJob, category })]), []),
    ).toHaveLength(1);
  });

  test("skips an entry with a job or a visit", () => {
    const flags = run(
      input([
        entry({ id: "te_1", visitId: null }),
        entry({ id: "te_2", jobId: null }),
        entry({ id: "te_3" }),
      ]),
      [],
    );
    expect(flags).toEqual([]);
  });

  test("ignores entries of another cycle or company", () => {
    const flags = run(
      input([
        entry({ id: "te_1", ...noJob, cycleId: "cy_0" }),
        entry({ id: "te_2", ...noJob, companyId: "co_b" }),
      ]),
      [],
    );
    expect(flags).toEqual([]);
  });

  test("dates the entry in the company timezone", () => {
    // 02:00 UTC on the 8th is 19:00 PDT on the 7th.
    const [flag] = run(
      input([entry({ id: "te_1", ...noJob, startAt: "2026-10-08T02:00:00Z" })]),
      [],
    );
    expect(flag.seen).toContain("on 2026-10-07");
  });
});
