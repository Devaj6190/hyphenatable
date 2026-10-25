import { expect, test } from "vitest";
import { entry, input, job, valid, visit } from "./__fixtures__/build";
import { run } from "./CHK-13";

test("completed visit with no entries on its job flags the job, citing the crew's entries that day", () => {
  const flags = valid(
    run(
      input([entry({ id: "te_1", jobId: "job_02", visitId: null })], {
        jobs: [job({ id: "job_01" }), job({ id: "job_02" })],
        visits: [visit({ id: "v_1" })],
      }),
      [],
    ),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0].subject).toMatchObject({
    jobId: "job_01",
    entryIds: ["te_1"],
  });
  expect(flags[0].routeTo).toBe("manager");
});
test("an entry on the job or its visit, an incomplete visit, or a visit outside the cycle does not flag", () => {
  const visits = [visit({ id: "v_1" })];
  expect(
    run(input([entry({ id: "a", visitId: null })], { visits }), []),
  ).toEqual([]);
  expect(
    run(
      input([entry({ id: "b", jobId: null, visitId: "v_1" })], { visits }),
      [],
    ),
  ).toEqual([]);
  expect(
    run(input([], { visits: [visit({ id: "v_2", isComplete: false })] }), []),
  ).toEqual([]);
  expect(
    run(
      input([], {
        visits: [visit({ id: "v_3", startAt: "2026-10-14T15:00:00Z" })],
      }),
      [],
    ),
  ).toEqual([]);
});
