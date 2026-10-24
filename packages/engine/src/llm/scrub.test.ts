import { describe, expect, test } from "vitest";
import {
  assertNoMoney,
  downgradeMatch,
  isStop,
  ScrubError,
  scrub,
} from "./scrub";

const flagFacts = {
  flagId: "flag_03",
  checkId: "CHK-07",
  cycleId: "cyc_2026_10_b",
  period: { start: "2026-10-12", end: "2026-10-25" },
  worker: {
    id: "w_07",
    jobTitle: "Lead installer",
    payType: "hourly",
    rateCents: 3200,
  },
  entry: {
    id: "te_14",
    clockIn: "2026-10-14T15:02:00.000Z",
    clockOut: "2026-10-15T01:30:00Z",
    hours: 10.47,
    jobId: null,
  },
  candidates: [
    {
      jobId: "job_12",
      score: 0.71,
      quoteStatus: "approved",
      amountCents: 1_250_000,
    },
    { jobId: "job_15", score: 0.64, quoteStatus: "sent", amountCents: 98_000 },
  ],
  expense: { id: "exp_3", category: "materials", amountCents: 41_299 },
  gustoEmployeeUuid: "550e8400-e29b-41d4-a716-446655440000",
  hasNote: true,
  sourceIds: ["jobber:Z2lkOi8vSm9iYmVyL0pvYi8xMjM=", "qbo:147"],
};

describe("scrub", () => {
  test("passes a realistic flag-facts object", () => {
    expect(() => scrub(flagFacts)).not.toThrow();
  });

  test("does not scan values under id keys (Convex ids can hold digit runs)", () => {
    const convexId = "jd7f2k1234567890qx8m0v3c9w5z2n4b"; // 32 chars, 10-digit run
    expect(() =>
      scrub({
        workerId: convexId,
        entryIds: [convexId, "te_14"],
        id: convexId,
        conversationKey: convexId,
        nested: {
          sourceId: convexId,
          recordId: convexId,
          providerId: convexId,
        },
      }),
    ).not.toThrow();
  });

  test("still checks keys under id keys", () => {
    expect(() => scrub({ workerId: { displayName: "x" } })).toThrow(
      /forbidden key/,
    );
  });

  test("still scans values under non-id keys", () => {
    expect(() => scrub({ text: "call 415-555-0123" })).toThrow(/phone-like/);
    expect(() => scrub({ paid: "4155550123" })).toThrow(/phone-like/);
  });

  test("throws on displayName", () => {
    expect(() => scrub({ worker: { id: "w_07", displayName: "x" } })).toThrow(
      ScrubError,
    );
  });

  test("throws on a nested contactRef and reports the path", () => {
    try {
      scrub({
        workers: [{ id: "w_01" }, { id: "w_02", meta: { contactRef: "c_9" } }],
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ScrubError);
      expect((e as ScrubError).path).toBe("workers.1.meta.contactRef");
    }
  });

  test.each([
    "name",
    "firstName",
    "accountName",
    "USERNAME",
  ])("throws on key %s", (key) => {
    expect(() => scrub({ [key]: "x" })).toThrow(/forbidden key/);
  });

  test.each(["note", "notes", "Notes"])("throws on key %s", (key) => {
    expect(() => scrub({ entry: { [key]: "" } })).toThrow(/forbidden key/);
  });

  test.each([
    "415-555-0123",
    "(415) 555-0123",
    "415.555.0123",
    "4155550123",
    "+1 415 555 0123",
    "+44 20 7946 0958",
  ])("throws on a phone string inside an array: %s", (phone) => {
    expect(() => scrub({ replies: ["ok", `call me ${phone}`] })).toThrow(
      /phone-like/,
    );
  });

  test("throws on an SSN", () => {
    expect(() => scrub({ w: { tax: "123-45-6789" } })).toThrow(/SSN-like/);
  });

  test.each([
    "021000021",
    "routing 026009593 acct 4400",
  ])("throws on bank-like digits: %s", (s) => {
    expect(() => scrub({ s })).toThrow(ScrubError);
  });

  test("does not echo the offending value in the error", () => {
    expect(() => scrub({ t: "123-45-6789" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("6789") }),
    );
  });

  test("allows primitives, nulls and empty containers", () => {
    expect(() =>
      scrub([1, 2.5, true, null, undefined, {}, [], "te_14"]),
    ).not.toThrow();
  });
});

describe("assertNoMoney", () => {
  test.each([
    "Your pay is $412",
    "That is $ 40",
    "about 300 dollars",
    "1200USD total",
    "12 usd",
  ])("fails on %s", (t) => {
    expect(() => assertNoMoney(t)).toThrow();
  });

  test.each([
    "Was te_14 for job_12 or job_15? Reply 1 or 2.",
    "You logged 10.5 hours on 2026-10-14. Is that right?",
    "Reply $ to opt out", // a bare dollar sign without a digit is not an amount
  ])("passes %s", (t) => {
    expect(() => assertNoMoney(t)).not.toThrow();
  });
});

describe("isStop", () => {
  test.each(["STOP", "stop", "  Stop \n"])("true for %j", (s) => {
    expect(isStop(s)).toBe(true);
  });
  test.each([
    "stop it",
    "don't stop",
    "STOP.",
    "",
    "2",
  ])("false for %j", (s) => {
    expect(isStop(s)).toBe(false);
  });
});

describe("downgradeMatch", () => {
  const base = { jobId: "job_12", reason: "same address and day" };

  test("match below 0.85 becomes ask", () => {
    expect(
      downgradeMatch({ ...base, kind: "match", confidence: 0.84 }),
    ).toEqual({
      ...base,
      kind: "ask",
      confidence: 0.84,
    });
  });

  test("match at 0.85 stays a match", () => {
    expect(
      downgradeMatch({ ...base, kind: "match", confidence: 0.85 }).kind,
    ).toBe("match");
  });

  test("match with no job id becomes ask", () => {
    expect(
      downgradeMatch({ ...base, jobId: null, kind: "match", confidence: 0.99 })
        .kind,
    ).toBe("ask");
  });

  test("no_match and ask are untouched", () => {
    const d = { ...base, kind: "no_match" as const, confidence: 0.1 };
    expect(downgradeMatch(d)).toBe(d);
  });
});
