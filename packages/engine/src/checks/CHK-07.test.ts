import { expect, test } from "vitest";
import { entry, input, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-07";

test("active hourly worker with no cycle entries is flagged", () => {
  const result = valid(
    run(
      input([entry({ id: "old", cycleId: "old" })], { workers: [worker()] }),
      [],
    ),
  );
  expect(result).toHaveLength(1);
  expect(result[0].routeTo).toBe("manager");
});
test("an entry, even zero duration, is present; salary, inactive and other-company workers are excluded", () => {
  expect(
    run(
      input([entry({ id: "zero", durationSec: 0 })], {
        workers: [
          worker(),
          worker({ id: "s", payType: "salary" }),
          worker({ id: "i", status: "inactive" }),
          worker({ id: "other", companyId: "co_b" }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
});
