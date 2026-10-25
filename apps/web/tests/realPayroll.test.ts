import { describe, expect, test } from "vitest";
import { companies, isRealPayroll, REAL_PAYROLL_NOTE } from "../lib/companies";

describe("real payroll is never filled", () => {
  test("Company R (real, anonymized) is real payroll; A and B are not", () => {
    expect(companies.r?.kind).toBe("real, anonymized");
    expect(isRealPayroll("r")).toBe(true);
    expect(isRealPayroll("a")).toBe(false);
    expect(isRealPayroll("b")).toBe(false);
    expect(isRealPayroll("unknown")).toBe(false);
  });

  test("every real company is covered, whatever its key", () => {
    for (const [id, c] of Object.entries(companies))
      expect(isRealPayroll(id)).toBe(c.kind === "real, anonymized");
  });

  test("the note says why, in plain words", () => {
    expect(REAL_PAYROLL_NOTE).toMatch(/never fills its Gusto draft/);
  });
});
