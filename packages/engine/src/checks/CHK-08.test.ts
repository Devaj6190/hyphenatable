import { expect, test } from "vitest";
import { entry, input, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-08";

test("inactive worker with a current entry is flagged once", () => {
  const w = worker({ status: "inactive" });
  expect(
    valid(
      run(
        input([entry({ id: "one" }), entry({ id: "two" })], {
          workers: [w, w],
        }),
        [],
      ),
    ),
  ).toHaveLength(1);
});
test("does not infer active Gusto employment from a mapping or use another cycle", () => {
  expect(
    run(
      input([entry({ id: "old", cycleId: "old" })], {
        workers: [worker({ status: "inactive" })],
      }),
      [],
    ),
  ).toEqual([]);
  expect(
    run(input([entry({ id: "one" })], { workers: [worker()] }), []),
  ).toEqual([]);
});
