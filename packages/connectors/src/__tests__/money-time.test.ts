import { describe, expect, it } from "vitest";
import { toCents } from "../money.ts";
import { resolvePeriod, zonedMidnight } from "../time.ts";

describe("toCents", () => {
  it("converts decimal dollars exactly (no float drift)", () => {
    expect(toCents(31.15)).toBe(3115); // 31.15 * 100 = 3114.9999… in floats
    expect(toCents(214.37)).toBe(21437);
    expect(toCents(0.07)).toBe(7);
    expect(toCents(1.005)).toBe(101); // half-up on the decimal digits, not on the float
    expect(toCents(26)).toBe(2600);
    expect(toCents("1,234.5")).toBe(123450);
    expect(toCents("$19.99")).toBe(1999);
    expect(toCents("-5.5")).toBe(-550);
    expect(toCents("(12.34)")).toBe(-1234);
    expect(toCents(".5")).toBe(50);
    expect(toCents(1e-7)).toBe(0);
  });
  it("missing is null, malformed throws", () => {
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents("  ")).toBeNull();
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
  });
});

describe("periods", () => {
  it("date-only periods are inclusive local dates turned into UTC instants", () => {
    expect(resolvePeriod("2026-10-11", "2026-10-24", "America/Los_Angeles")).toEqual({
      startUtc: "2026-10-11T07:00:00.000Z",
      endUtc: "2026-10-25T07:00:00.000Z",
      startDate: "2026-10-11",
      endDate: "2026-10-24",
    });
  });
  it("handles a DST change inside the period", () => {
    // US DST ends 2026-11-01: PDT (-7) before, PST (-8) after
    const p = resolvePeriod("2026-10-25", "2026-11-07", "America/Los_Angeles");
    expect(p.startUtc).toBe("2026-10-25T07:00:00.000Z");
    expect(p.endUtc).toBe("2026-11-08T08:00:00.000Z");
    expect(new Date(zonedMidnight("2026-11-01", "America/Los_Angeles")).toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
  it("ISO instants pass through", () => {
    const p = resolvePeriod("2026-10-11T07:00:00Z", "2026-10-25T07:00:00Z", "America/Los_Angeles");
    expect([p.startUtc, p.endUtc, p.startDate, p.endDate]).toEqual(["2026-10-11T07:00:00.000Z", "2026-10-25T07:00:00.000Z", "2026-10-11", "2026-10-24"]);
  });
});
