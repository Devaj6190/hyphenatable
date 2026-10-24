import { describe, expect, test } from "vitest";
import type { Flag, Rule } from "../schemas";
import { entry, input, rule } from "./__fixtures__/build";
import { run as chk01 } from "./CHK-01";
import { run as chk03 } from "./CHK-03";
import { precedentFor } from "./precedent";

const longShift = (): Flag =>
  chk03(input([entry({ id: "te_1", durationSec: 13 * 3600 })]), [])[0];

/** The same CHK-03 situation in an earlier cycle, with a status. */
const past = (
  id: string,
  status: Flag["status"],
  over: Partial<Flag> = {},
): Flag => ({
  ...longShift(),
  id,
  cycleId: "cy_0",
  status,
  ...over,
});

const approved = (
  id: string,
  approvedAt: string | null,
  over: Partial<Rule> = {},
) =>
  rule({ id, ...over, provenance: { ...rule({ id }).provenance, approvedAt } });

const none = { ruleId: null, flagId: null, note: "no precedent" };

describe("precedentFor", () => {
  test("cites the most recently approved active rule of the check's type", () => {
    const rules = [
      approved("r_new", "2026-10-03T00:00:00Z", {
        params: { statement: "Shifts over 12 h are allowed on install days." },
      }),
      approved("r_old", "2026-09-01T00:00:00Z"),
      approved("r_never", null),
      approved("r_off", "2026-10-10T00:00:00Z", { status: "off" }),
      approved("r_other_co", "2026-10-10T00:00:00Z", { companyId: "co_b" }),
      approved("r_other_type", "2026-10-10T00:00:00Z", { type: "pay_rate" }),
    ];
    expect(precedentFor(longShift(), { rules, pastFlags: [] })).toEqual({
      ruleId: "r_new",
      flagId: null,
      note: "rule: Shifts over 12 h are allowed on install days.",
    });
  });

  test("falls back to the rule type when the rule has no statement", () => {
    const p = precedentFor(longShift(), {
      rules: [rule({ id: "r_1" })],
      pastFlags: [],
    });
    expect(p).toEqual({
      ruleId: "r_1",
      flagId: null,
      note: "rule: long_shift_threshold",
    });
  });

  test("a rule beats a past flag", () => {
    const p = precedentFor(longShift(), {
      rules: [rule({ id: "r_1" })],
      pastFlags: [past("f_old", "corrected")],
    });
    expect(p.ruleId).toBe("r_1");
  });

  test("cites the last corrected past flag for the same check and worker", () => {
    const pastFlags = [
      past("f_1", "corrected"),
      past("f_2", "corrected"),
      past("f_dismissed", "dismissed"),
      past("f_other_worker", "corrected", {
        subject: { ...longShift().subject, workerId: "w_02" },
      }),
      past("f_other_check", "corrected", { checkId: "CHK-02" }),
      past("f_other_co", "corrected", { companyId: "co_b" }),
    ];
    expect(precedentFor(longShift(), { rules: [], pastFlags })).toEqual({
      ruleId: null,
      flagId: "f_2",
      note: "same as flag f_2",
    });
  });

  test("never cites the flag itself", () => {
    const self = { ...longShift(), status: "corrected" as const };
    expect(precedentFor(longShift(), { rules: [], pastFlags: [self] })).toEqual(
      none,
    );
  });

  test("no precedent when nothing matches", () => {
    expect(precedentFor(longShift(), { rules: [], pastFlags: [] })).toEqual(
      none,
    );
  });

  test("a check with no rule types ignores rules", () => {
    const flag = chk01(
      input([entry({ id: "te_1", jobId: null, visitId: null })]),
      [],
    )[0];
    expect(
      precedentFor(flag, { rules: [rule({ id: "r_1" })], pastFlags: [] }),
    ).toEqual(none);
  });
});
