import { expect, test } from "vitest";
import { expense, input, rule, valid } from "./__fixtures__/build";
import { run } from "./CHK-14";

test("job-cost expense with no job flags; a low-score match flags with its score", () => {
  const flags = valid(
    run(
      input([], {
        expenses: [
          expense({ id: "x_1", matchedJobId: null, matchConfidence: null }),
          expense({ id: "x_2", matchConfidence: 0.7 }),
        ],
      }),
      [],
    ),
  );
  expect(flags.map((f) => [f.subject.expenseIds, f.confidence])).toEqual([
    [["x_1"], "certain"],
    [["x_2"], 0.7],
  ]);
  expect(flags[0].affects.dollarsCents).toBe(21437);
});
test("a vendor hint for the expense's vendor is cited as precedent, never applied", () => {
  const hint = rule({
    id: "r_hint",
    type: "vendor_job_hint",
    params: { vendor: " cedar creek supply", jobId: "job_01" },
  });
  const [flag] = run(
    input([], {
      expenses: [expense({ id: "x_1", matchedJobId: null })],
      rules: [hint],
    }),
    [],
  );
  expect(flag.precedent?.ruleId).toBe("r_hint");
  expect(flag.subject.jobId).toBeNull();
});
test("matched, overhead, other-company and out-of-cycle expenses do not flag", () => {
  expect(
    run(
      input([], {
        expenses: [
          expense({ id: "a" }),
          expense({ id: "b", matchConfidence: 0.85 }),
          expense({ id: "c", kind: "overhead", matchedJobId: null }),
          expense({ id: "d", companyId: "co_b", matchedJobId: null }),
          expense({ id: "e", date: "2026-10-12", matchedJobId: null }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
});
