import { expect, test } from "vitest";
import { input, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-11";

test("Venmo worker with null rate is flagged", () => {
  expect(
    valid(
      run(
        input([], { workers: [worker({ payType: "contractor_venmo" })] }),
        [],
      ),
    ),
  ).toHaveLength(1);
});
test("recorded zero is not missing, and other pay types are ignored", () => {
  expect(
    run(
      input([], {
        workers: [
          worker({ payType: "contractor_venmo", venmoRateCents: 0 }),
          worker({ id: "hourly" }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
});
