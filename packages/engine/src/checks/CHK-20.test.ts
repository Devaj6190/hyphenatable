import { expect, test } from "vitest";
import { input, job, quote, rule, valid } from "./__fixtures__/build";
import { run } from "./CHK-20";

const quoter = rule({
  id: "r_q",
  type: "in_person_quoter",
  params: { titleKeyword: "Landscape LIGHTING", workerId: "w_05" },
  confidence: 0.75,
});
const jobs = [
  job({ id: "job_01", title: "Landscape lighting install - Quail Rd" }),
];

test("a quote by someone other than the in-person quoter flags at the rule's confidence", () => {
  const flags = valid(
    run(
      input([], { jobs, rules: [quoter], quotes: [quote({ id: "q_1" })] }),
      [],
    ),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    confidence: 0.75,
    routeTo: "owner",
    subject: { workerId: "w_01", jobId: "job_01" },
    precedent: { ruleId: "r_q" },
  });
});
test("the rule's worker, another kind of job, a quote sent outside the cycle, or no rule do not flag", () => {
  const q = (over = {}) => [quote({ id: "q_1", ...over })];
  expect(
    run(
      input([], {
        jobs,
        rules: [quoter],
        quotes: q({ salespersonWorkerId: "w_05" }),
      }),
      [],
    ),
  ).toEqual([]);
  expect(
    run(
      input([], {
        jobs: [job({ id: "job_01" })],
        rules: [quoter],
        quotes: q(),
      }),
      [],
    ),
  ).toEqual([]);
  expect(
    run(
      input([], {
        jobs,
        rules: [quoter],
        quotes: q({ sentAt: "2026-09-20T17:00:00Z" }),
      }),
      [],
    ),
  ).toEqual([]);
  expect(run(input([], { jobs, quotes: q() }), [])).toEqual([]);
});
