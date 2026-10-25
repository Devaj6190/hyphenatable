import { describe, expect, test } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Question } from "@/lib/types";
import {
  currentCycleId,
  headerCycle,
  infoOf,
  newestCycle,
  pageHasLiveCycle,
  recipientLabel,
  toAuditEvent,
  toCorrection,
  toFlag,
  toRule,
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

const cycleDoc = (id: string, number: number) =>
  ({
    _id: id,
    _creationTime: 1,
    companyId: "co1",
    number,
    periodStart: `2026-10-0${number}T04:00:00.000Z`,
    periodEnd: `2026-10-1${number}T03:59:59.999Z`,
    cutoffAt: "2026-10-20T00:00:00.000Z",
    stage: "asking",
    gustoPayrollId: null,
    gustoOffCyclePayrollId: null,
    questionsAsked: 0,
  }) as unknown as Doc<"cycles">;

describe("which cycle the header names", () => {
  const fixture = {
    number: 5,
    periodStart: "2026-10-10T04:00:00.000Z",
    periodEnd: "2026-10-24T03:59:59.999Z",
  };

  test("the highest-numbered cycle, whatever order Convex returns", () => {
    expect(newestCycle([cycleDoc("c1", 1), cycleDoc("c2", 2)])?.id).toBe("c2");
    expect(newestCycle([])).toBeNull();
  });

  test("live data names Convex's cycle, not the fixture's", () => {
    const live = newestCycle([cycleDoc("c1", 1)]);
    expect(headerCycle(fixture, { status: "ready", cycle: live })?.number).toBe(
      1,
    );
    expect(headerCycle(fixture, { status: "ready", cycle: null })).toBeNull();
  });

  test("no number while loading; the fixture's when live is off or the read failed", () => {
    expect(headerCycle(fixture, { status: "loading" })).toBeNull();
    expect(headerCycle(fixture, { status: "off" })?.number).toBe(5);
    expect(headerCycle(fixture, { status: "failed" })?.number).toBe(5);
  });
});

describe("pageHasLiveCycle", () => {
  test("flag detail reads Convex, so the header names the live cycle there", () => {
    expect(pageHasLiveCycle("/c/a/flags/k57abc123")).toBe(true);
    expect(pageHasLiveCycle("/c/a/flags/a-fl-04/")).toBe(true);
  });

  test("home, the manager inbox and every other page keep the fixture's cycle, matching their own heading", () => {
    for (const path of [
      "/c/a",
      "/c/a/manager",
      "/c/a/workbook",
      "/c/a/audit",
      "/c/a/flags",
      "/c/a/flags/a-fl-04/edit",
    ])
      expect(pageHasLiveCycle(path)).toBe(false);
  });
});

describe("pageHasLiveCycle for a company with no fixtures", () => {
  test("Company R has no fixture cycle, so every one of its pages names the live cycle", () => {
    for (const path of ["/c/r", "/c/r/manager", "/c/r/workbook", "/c/r/audit"])
      expect(pageHasLiveCycle(path, false)).toBe(true);
  });
});

describe("toAuditEvent and toRule", () => {
  test("rename the Convex id and key the row to the dashboard's company, nothing else", () => {
    const event = toAuditEvent(
      {
        _id: "ev1",
        _creationTime: 0,
        companyId: "co1",
        cycleId: null,
        at: "2026-10-24T10:00:00.000Z",
        actor: { kind: "agent", id: "auditor", agent: "auditor" },
        type: "check.flagged",
        summary: "Flagged an overlap",
        refs: { flagId: "fl1" },
        data: null,
      } as unknown as Doc<"auditEvents">,
      "r",
    );
    expect(event).toMatchObject({ id: "ev1", companyId: "r", data: null });
    const rule = toRule(
      {
        _id: "ru1",
        _creationTime: 0,
        companyId: "co1",
        type: "long_shift_threshold",
        params: { hours: 11 },
        status: "active",
        source: "history",
        provenance: {
          lessonId: null,
          flagId: null,
          answeredBy: null,
          approvedBy: null,
          approvedAt: null,
          evidence: [],
        },
        backtest: null,
        confidence: 1,
      } as unknown as Doc<"rules">,
      "r",
    );
    expect(rule).toMatchObject({
      id: "ru1",
      companyId: "r",
      params: { hours: 11 },
    });
  });
});
