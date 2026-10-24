import { expect, test } from "vitest";
import { input, syncRun, valid } from "./__fixtures__/build";
import { run } from "./CHK-23";

test("dropped record flags the source object and retains pulled versus expected", () => {
  const r = syncRun();
  const flags = valid(run(input([], { syncRuns: [r, r] }), []));
  expect(flags).toHaveLength(1);
  expect(flags[0].seen).toContain("pulled 9, expected 10");
  expect(flags[0].where[0].recordId).toBe(r.id);
  expect(flags[0].routeTo).toBe("owner");
});
test("unknown expected count is not zero", () => {
  expect(
    run(input([], { syncRuns: [syncRun({ expected: null })] }), [])[0].seen,
  ).toContain("expected unknown");
});
test("complete, other-company and other-cycle runs are ignored", () => {
  expect(
    run(
      input([], {
        syncRuns: [
          syncRun({ complete: true }),
          syncRun({ companyId: "co_b" }),
          syncRun({ cycleId: "other" }),
        ],
      }),
      [],
    ),
  ).toEqual([]);
});
