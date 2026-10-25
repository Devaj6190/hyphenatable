import { expect, test } from "vitest";
import {
  entry,
  expense,
  input,
  job,
  valid,
  worker,
} from "./__fixtures__/build";
import { run } from "./CHK-21";

// Revenue 1,000.00 (job total); labor 8 h × 32.00 = 256.00; plus the job-cost expense.
const at = (expenseCents: number, over = {}) =>
  input([entry({ id: "te_1" })], {
    workers: [worker()],
    jobs: [job({ id: "job_01", ...over })],
    expenses: [expense({ id: "x_1", amountCents: expenseCents })],
  });

test("a margin below lowMarginPct flags the job to the owner", () => {
  const flags = valid(run(at(70000), []));
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    routeTo: "owner",
    subject: { jobId: "job_01" },
  });
  expect(flags[0].seen).toContain("4.4% margin");
});
test("a healthy margin or an unknown job total does not flag", () => {
  expect(run(at(21437), [])).toEqual([]);
  expect(run(at(70000, { totalCents: null }), [])).toEqual([]);
});
