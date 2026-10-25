import { expect, test } from "vitest";
import { expense, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-15";

test("a QuickBooks purchase and a Jobber expense alike (±1¢, ±1 day) flag at 0.9", () => {
  const flags = valid(
    run(
      input([], {
        expenses: [
          expense({ id: "q" }),
          expense({
            id: "j",
            source: "jobber",
            vendor: null,
            accountName: null,
            amountCents: 21438,
            date: "2026-10-08T18:00:00Z",
          }),
        ],
      }),
      [],
    ),
  );
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({
    confidence: 0.9,
    routeTo: "owner",
    subject: { jobId: "job_01", expenseIds: ["j", "q"] },
  });
});
test("identical records are certain; same source needs the same vendor", () => {
  const [flag] = run(
    input([], { expenses: [expense({ id: "a" }), expense({ id: "b" })] }),
    [],
  );
  expect(flag.confidence).toBe("certain");
  expect(
    run(
      input([], {
        expenses: [expense({ id: "a" }), expense({ id: "b", vendor: "Other" })],
      }),
      [],
    ),
  ).toEqual([]);
});
test("2¢ apart, 2 days apart or an unknown amount is not a double", () => {
  const j = { source: "jobber" as const, vendor: null };
  for (const over of [
    { amountCents: 21439 },
    { date: "2026-10-09" },
    { amountCents: null },
  ])
    expect(
      run(
        input([], {
          expenses: [expense({ id: "a" }), expense({ id: "b", ...j, ...over })],
        }),
        [],
      ),
    ).toEqual([]);
});
