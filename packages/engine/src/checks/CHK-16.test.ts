import { expect, test } from "vitest";
import { expense, input, job, rule, valid } from "./__fixtures__/build";
import { run } from "./CHK-16";

const link = rule({
  id: "r_link",
  type: "disposal_parent_link",
  params: { titlePrefix: "Disposal run - " },
  confidence: 0.8,
});
const jobs = [
  job({ id: "wall", title: "Retaining wall rebuild - Foxglove Ct" }),
  job({ id: "dump", title: "Disposal run - Foxglove Ct", totalCents: null }),
];

test("a disposal sub-job with no parent flags with its expenses, the rule and a possible parent", () => {
  const flags = valid(
    run(
      input([], {
        jobs,
        rules: [link],
        expenses: [
          expense({ id: "fee", matchedJobId: "dump", amountCents: 14250 }),
        ],
      }),
      [],
    ),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    confidence: 0.8,
    routeTo: "manager",
    subject: { jobId: "dump", expenseIds: ["fee"] },
    precedent: { ruleId: "r_link" },
    affects: { dollarsCents: 14250 },
  });
  expect(flags[0].seen).toContain("possible parent wall");
});
test("no active rule, a linked sub-job, or one outside the cycle does not flag", () => {
  expect(run(input([], { jobs }), [])).toEqual([]);
  expect(
    run(input([], { jobs, rules: [{ ...link, status: "proposed" }] }), []),
  ).toEqual([]);
  const linked = jobs.map((j) =>
    j.id === "dump" ? { ...j, parentJobId: "wall" } : j,
  );
  expect(run(input([], { jobs: linked, rules: [link] }), [])).toEqual([]);
  const old = jobs.map((j) => ({ ...j, startAt: "2026-09-01T15:00:00Z" }));
  expect(run(input([], { jobs: old, rules: [link] }), [])).toEqual([]);
});
