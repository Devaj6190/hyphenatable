import { expect, test } from "vitest";
import { entry, input, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-09";

test("explicit incomplete onboarding with hours is flagged", () => {
  const w = worker();
  if (!w.gusto) throw Error("fixture");
  w.gusto.onboarded = false;
  expect(
    valid(run(input([entry({ id: "one" })], { workers: [w] }), [])),
  ).toHaveLength(1);
  expect(run(input([], { workers: [w] }), [])).toEqual([]);
  expect(
    run(input([entry({ id: "zero", durationSec: 0 })], { workers: [w] }), []),
  ).toEqual([]);
});
test("unknown or complete onboarding is not a proven failure", () => {
  for (const onboarded of [null, true]) {
    const w = worker();
    if (!w.gusto) throw Error("fixture");
    w.gusto.onboarded = onboarded;
    expect(run(input([entry({ id: "one" })], { workers: [w] }), [])).toEqual(
      [],
    );
  }
});
