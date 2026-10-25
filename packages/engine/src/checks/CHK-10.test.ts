import { expect, test } from "vitest";
import { input, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-10";

test("known hourly rates differing by one cent flag without exposing amounts", () => {
  const w = worker();
  if (!w.jobber) throw Error("fixture");
  w.jobber.labourRateCents = 3201;
  const flags = valid(run(input([], { workers: [w] }), []));
  expect(flags).toHaveLength(1);
  expect(flags[0].seen).not.toMatch(/3201|3200|\$/);
  expect(flags[0].affects.dollarsCents).toBeNull();
});
test("equal, missing and non-hourly rates are not a proven mismatch", () => {
  const w = worker();
  if (!w.jobber) throw Error("fixture");
  w.jobber.labourRateCents = null;
  expect(
    run(
      input([], {
        workers: [
          worker(),
          w,
          worker({ id: "s", payType: "salary" }),
          worker({ id: "g", gusto: null }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
});
