import { expect, test } from "vitest";
import { input, invoice, payment, quote, valid } from "./__fixtures__/build";
import { run } from "./CHK-19";

const records = {
  invoices: [invoice({ id: "inv_1" })],
  quotes: [quote({ id: "q_1" })],
};

test("a quote payment recorded as the invoice's final payment flags with what is still owed", () => {
  const flags = valid(
    run(
      input([], {
        ...records,
        payments: [payment({ id: "p_1", quoteId: "q_1", amountCents: 40000 })],
      }),
      [],
    ),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    routeTo: "owner",
    subject: { jobId: "job_01" },
    affects: { dollarsCents: 60000 },
  });
});
test("a plain final, a deposit, an unknown adjustment and an out-of-cycle payment do not flag", () => {
  expect(
    run(
      input([], {
        ...records,
        payments: [
          payment({ id: "a" }),
          payment({
            id: "b",
            quoteId: "q_1",
            invoiceId: null,
            kind: "deposit",
          }),
          payment({ id: "c", quoteId: "q_1", kind: "unknown" }),
          payment({ id: "d", quoteId: "q_1", entryDate: "2026-10-12" }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
});
