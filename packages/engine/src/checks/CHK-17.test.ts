import { expect, test } from "vitest";
import { expense, input, rule, valid } from "./__fixtures__/build";
import { run } from "./CHK-17";

const materials = rule({
  id: "r_mat",
  type: "expense_account_kind",
  params: { accountName: "Materials", kind: "job_cost" },
});

test("an account with no expense_account_kind rule flags to the owner", () => {
  const flags = valid(
    run(
      input([], {
        rules: [materials],
        expenses: [
          expense({ id: "fuel", accountName: "Fuel", kind: "unknown" }),
        ],
      }),
      [],
    ),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({ routeTo: "owner", confidence: "certain" });
});
test("a ruled account (any case), a null account and a proposed-only rule's account behave", () => {
  expect(
    run(
      input([], {
        rules: [materials],
        expenses: [
          expense({ id: "a", accountName: " materials " }),
          expense({ id: "b", source: "jobber", accountName: null }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
  expect(
    run(
      input([], {
        rules: [{ ...materials, status: "proposed" }],
        expenses: [expense({ id: "a" })],
      }),
      [],
    ),
  ).toHaveLength(1);
});
