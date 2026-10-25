import { expect, test } from "vitest";
import { entry, input, job, rule, valid, worker } from "./__fixtures__/build";
import { run } from "./CHK-18";

const payRate = (cost: number) =>
  rule({
    id: "r_pay",
    type: "pay_rate",
    params: {
      workerId: "w_01",
      rateCents: 3200,
      paymentUnit: "Hour",
      costRateCentsPerHour: cost,
    },
  });
const at = (cost: number, rules = [payRate(cost)]) =>
  input([entry({ id: "te_1" })], {
    workers: [worker()],
    jobs: [job({ id: "job_01" })],
    rules,
  });

test("Jobber's labour rate differing from the pay_rate rule's cost rate flags, with the profit gap", () => {
  const flags = valid(run(at(3500), []));
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    routeTo: "owner",
    subject: { workerId: "w_01" },
    precedent: { ruleId: "r_pay" },
    affects: { dollarsCents: 8 * 300 },
  });
  expect(flags[0].seen).not.toMatch(/3500|3200|\$/);
});
test("equal rates, no active rule, or no job labor do not flag", () => {
  expect(run(at(3200), [])).toEqual([]);
  expect(run(at(3500, []), [])).toEqual([]);
  expect(run(at(3500, [{ ...payRate(3500), status: "proposed" }]), [])).toEqual(
    [],
  );
  expect(
    run(
      input([entry({ id: "te_1", jobId: null, visitId: null })], {
        workers: [worker()],
        rules: [payRate(3500)],
      }),
      [],
    ),
  ).toEqual([]);
});
