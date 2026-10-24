import { expect, test } from "vitest";
import { entry, input, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-12";

test.each([
  "salary",
  "contractor_venmo",
  "commission",
] as const)("%s with hours is only a workbook note", (payType) => {
  const flags = valid(
    run(input([entry({ id: "one" })], { workers: [worker({ payType })] }), []),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0].routeTo).toBe("none");
});
test("hourly or no hours produces no note", () => {
  expect(
    run(input([entry({ id: "one" })], { workers: [worker()] }), []),
  ).toEqual([]);
  expect(
    run(input([], { workers: [worker({ payType: "salary" })] }), []),
  ).toEqual([]);
});
