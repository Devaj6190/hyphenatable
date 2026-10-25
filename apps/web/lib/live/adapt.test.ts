import { describe, expect, test } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Question } from "@/lib/types";
import {
  currentCycleId,
  infoOf,
  recipientLabel,
  toCorrection,
  toFlag,
} from "./adapt";

const flagDoc = (over: Record<string, unknown> = {}) =>
  ({
    _id: "flagId1",
    _creationTime: 1,
    companyId: "co1",
    cycleId: "cy1",
    checkId: "CHK-01",
    status: "open",
    subject: { workerId: "w1", jobId: null, entryIds: ["e1"], expenseIds: [] },
    seen: "Entry has no job.",
    where: [{ system: "jobber", recordId: "t_14", url: null }],
    confidence: "certain",
    precedent: null,
    routeTo: "manager",
    affects: { workerId: "w1", jobId: null, dollarsCents: 19200 },
    questionId: "q1",
    correctionId: null,
    ...over,
  }) as unknown as Doc<"flags">;

describe("toFlag", () => {
  test("keeps the Convex row id and the route's company key, and names the source system", () => {
    const f = toFlag(flagDoc(), "a");
    expect(f.id).toBe("flagId1");
    expect(f.companyId).toBe("a");
    expect(f.where[0].system).toBe("Jobber");
    expect(
      toFlag(
        flagDoc({ where: [{ system: "qbo", recordId: "x", url: null }] }),
        "a",
      ).where[0].system,
    ).toBe("QuickBooks");
  });

  test("passes pay through unchanged: redaction is Convex's job, so a manager's null stays null", () => {
    expect(toFlag(flagDoc(), "a").affects.dollarsCents).toBe(19200);
    const redacted = flagDoc({
      affects: { workerId: "w1", jobId: null, dollarsCents: null },
    });
    expect(toFlag(redacted, "a").affects.dollarsCents).toBeNull();
  });
});

describe("toCorrection", () => {
  const base = {
    _id: "co1",
    _creationTime: 1,
    companyId: "c",
    cycleId: "cy",
    flagId: "f",
    target: { table: "timeEntries", id: "e1", field: "jobId" },
    before: null,
    after: { job: "j7" },
    status: "approved",
    source: "reply",
    approvedBy: null,
    approvedAt: null,
  };
  test("a manager's null pay and profit effects stay null", () => {
    const c = toCorrection(
      { ...base, effectPayCents: null, effectProfitCents: null } as never,
      "a",
    );
    expect(c.effectPayCents).toBeNull();
    expect(c.effectProfitCents).toBeNull();
  });
  test("owner effects pass through, and before/after become text or numbers", () => {
    const c = toCorrection(
      { ...base, effectPayCents: 0, effectProfitCents: -19200 } as never,
      "a",
    );
    expect(c.effectProfitCents).toBe(-19200);
    expect(c.before).toBeNull();
    expect(c.after).toBe('{"job":"j7"}');
  });
});

describe("who a question goes to, in words", () => {
  const q = (toRole: Question["toRole"], toWorkerId = "w9") =>
    ({ toRole, toWorkerId }) as Question;
  test("a first name when the roster knows it, else the role", () => {
    expect(recipientLabel(q("employee"), { w9: "Casey Lindqvist" })).toBe(
      "Casey",
    );
    expect(recipientLabel(q("manager"), {})).toBe("the manager");
    expect(recipientLabel(q("owner"), {})).toBe("you");
    expect(recipientLabel(null, {})).toBe("the right person");
  });
  test("a live flag's info has no reply text, because Convex has no query for it", () => {
    expect(infoOf(q("manager"), {}).reply).toBeNull();
  });
});

describe("which cycle the screens show", () => {
  const cycles = [{ _id: "cy3" }, { _id: "cy2" }, { _id: "cy1" }] as Pick<
    Doc<"cycles">,
    "_id"
  >[];
  test("the newest cycle that has flags", () => {
    expect(currentCycleId(cycles, [{ cycleId: "cy2" }] as never)).toBe("cy2");
    expect(
      currentCycleId(cycles, [{ cycleId: "cy2" }, { cycleId: "cy3" }] as never),
    ).toBe("cy3");
  });
  test("the newest cycle when there are no flags; null when there are no cycles", () => {
    expect(currentCycleId(cycles, [])).toBe("cy3");
    expect(currentCycleId([], [])).toBeNull();
  });
});
