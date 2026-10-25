import { describe, expect, test } from "vitest";
import { company, entry, input, valid } from "./__fixtures__/build";
import { run } from "./CHK-03";

const lasting = (id: string, durationSec: number) =>
  entry({ id, durationSec, endAt: null });

describe("CHK-03 long_shift", () => {
  test("flags an entry one second over the limit", () => {
    const flags = valid(run(input([lasting("te_1", 12 * 3600 + 1)]), []));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      id: "CHK-03:cy_1:te_1",
      routeTo: "manager",
      seen: "Entry te_1 for w_01 on 2026-10-07 is 12.00 h, over the 12 h limit.",
    });
  });

  test("skips an entry exactly at the limit", () => {
    expect(run(input([lasting("te_1", 12 * 3600)]), [])).toEqual([]);
  });

  test("uses the company's own limit", () => {
    const settings = { ...company().settings, longShiftHours: 10 };
    const flags = run(
      input([lasting("te_1", 11 * 3600), lasting("te_2", 9 * 3600)], {
        company: company({ settings }),
      }),
      [],
    );
    expect(flags.map((f) => f.subject.entryIds)).toEqual([["te_1"]]);
    expect(flags[0].seen).toContain("11.00 h, over the 10 h limit");
  });
});
