import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  canSee,
  redactCorrection,
  redactFlag,
  type Viewer,
} from "../convex/lib/viewer";

const w = (s: string) => s as Id<"workers">;
const owner: Viewer = { role: "owner", workerId: w("owner") };
const manager: Viewer = {
  role: "manager",
  workerId: w("mgr"),
  crew: new Set(["mgr", "crew1"]),
};

const flag = (
  routeTo: "owner" | "manager" | "none",
  workerId: string | null,
  dollarsCents: number | null = 9600,
) => ({
  routeTo,
  subject: {
    workerId: workerId === null ? null : w(workerId),
    jobId: null,
    entryIds: [],
    expenseIds: [],
  },
  affects: {
    workerId: workerId === null ? null : w(workerId),
    jobId: null,
    dollarsCents,
  },
});

describe("canSee", () => {
  test("the owner sees every flag", () => {
    for (const f of [
      flag("owner", "crew1"),
      flag("manager", "other"),
      flag("none", null),
    ])
      expect(canSee(owner, f)).toBe(true);
  });

  test("a manager sees manager-routed flags about their crew and job flags with no worker", () => {
    expect(canSee(manager, flag("manager", "crew1"))).toBe(true);
    expect(canSee(manager, flag("manager", "mgr"))).toBe(true);
    expect(canSee(manager, flag("manager", null))).toBe(true);
  });

  test("a manager never sees another crew, owner-routed (money/policy) or unrouted flags", () => {
    expect(canSee(manager, flag("manager", "other"))).toBe(false);
    expect(canSee(manager, flag("owner", "crew1"))).toBe(false);
    expect(canSee(manager, flag("none", "crew1"))).toBe(false);
  });
});

describe("redaction", () => {
  test("a manager gets the flag without the pay it affects", () => {
    const f = flag("manager", "crew1");
    expect(redactFlag(manager, f).affects.dollarsCents).toBeNull();
    expect(redactFlag(manager, f).subject).toEqual(f.subject);
    expect(redactFlag(owner, f).affects.dollarsCents).toBe(9600);
  });

  const correction = (field: string) => ({
    target: { table: "timeEntries", id: "te", field },
    before: 2400,
    after: 2600,
    effectPayCents: 1600,
    effectProfitCents: -1600,
  });

  test("a manager gets corrections without pay or profit effects", () => {
    const c = redactCorrection(manager, correction("jobId"));
    expect(c.effectPayCents).toBeNull();
    expect(c.effectProfitCents).toBeNull();
    expect(c.after).toBe(2600); // a job or hours fact stays visible
  });

  test("before/after are hidden when the corrected field is itself money or a rate", () => {
    for (const field of [
      "rateCents",
      "venmoRateCents",
      "labourRateCents",
      "amountCents",
    ]) {
      const c = redactCorrection(manager, correction(field));
      expect([c.before, c.after]).toEqual([null, null]);
    }
  });

  test("the owner gets the correction unchanged", () => {
    expect(redactCorrection(owner, correction("rateCents"))).toEqual(
      correction("rateCents"),
    );
  });
});
