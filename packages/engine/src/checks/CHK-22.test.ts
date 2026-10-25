import { expect, test } from "vitest";
import { entry, input, rule, valid, worker } from "./__fixtures__/build";
import { pastGross, run } from "./CHK-22";

// 8 h at 32.00/h = 25,600¢ in the draft.
const ot = rule({
  id: "r_ot",
  type: "overtime_policy",
  params: { weeklyHours: 40, multiplier: 1.5, dailyHours: null },
});
const at = (
  history: number[],
  entries = [entry({ id: "te_1" })],
  rules = [ot],
) =>
  input(entries, {
    workers: [worker()],
    rules,
    pastCycles: { gross: { w_01: history } },
  });

test("draft gross more than grossChangePct off the last-3-cycle mean flags to the owner", () => {
  const flags = valid(run(at([1, 10000, 10000, 10000]), [ot]));
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    routeTo: "owner",
    subject: { workerId: "w_01" },
  });
  expect(flags[0].seen).toContain("156% above the mean of their last 3 cycles");
  expect(flags[0].seen).not.toMatch(/25600|10000|\$/);
  // No hours at all: the draft pays 0, 100% below.
  expect(run(at([25600, 25600, 25600], []), [ot])[0].seen).toContain(
    "100% below",
  );
});
test("exactly 25%, no history, a zero history, or no overtime policy do not flag", () => {
  expect(run(at([20480, 20480, 20480]), [ot])).toEqual([]);
  expect(run(at([]), [ot])).toEqual([]);
  expect(run(at([0, 0, 0]), [ot])).toEqual([]);
  expect(run(at([10000, 10000, 10000], undefined, []), [])).toEqual([]);
});
test("pastGross: last 3 known cycles, oldest first; a missing worker row is 0; off-cycle and empty cycles skipped", () => {
  const cycles = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `c${n}`,
    companyId: "co_a",
    number: n,
  }));
  const row = (
    cycleId: string,
    workerId: string,
    grossCents: number,
    paidVia = "gusto_regular",
  ) => ({
    companyId: "co_a",
    cycleId,
    workerId,
    paidVia: paidVia as "gusto_regular",
    grossCents,
  });
  expect(
    pastGross({ companyId: "co_a", number: 6 }, cycles, [
      row("c1", "a", 100),
      row("c2", "a", 200),
      row("c3", "a", 300),
      row("c3", "a", 5, "gusto_off_cycle"),
      row("c3", "b", 50, "venmo"),
      row("c5", "a", 500),
      row("c6", "a", 600),
      row("c5", "a", 1, "gusto_off_cycle"),
      { ...row("c5", "a", 9), companyId: "co_b" },
    ]),
  ).toEqual({ a: [200, 300, 500], b: [0, 50, 0] });
});
