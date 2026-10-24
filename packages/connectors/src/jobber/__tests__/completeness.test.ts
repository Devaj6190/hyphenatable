import { describe, expect, it } from "vitest";
import { connectionCompleteness, timeEntryCompleteness } from "../completeness.ts";

const U1 = "user-1";
const U2 = "user-2";

describe("connectionCompleteness", () => {
  it("is complete when nodes.length equals totalCount", () => {
    expect(connectionCompleteness("users", 4, 4)).toEqual({ pulled: 4, expected: 4, complete: true, error: null });
  });
  it("is incomplete with the difference when one is missing", () => {
    const r = connectionCompleteness("timeSheetEntries", 39, 40);
    expect(r.complete).toBe(false);
    expect(r.error).toBe("timeSheetEntries: pulled 39, totalCount 40 (diff -1)");
  });
  it("is incomplete when totalCount moved between pages", () => {
    expect(connectionCompleteness("x", 3, 3, true).complete).toBe(false);
  });
});

describe("timeEntryCompleteness", () => {
  it("is complete when totalCount and the per-user timeSheetsByDay totals both agree", () => {
    const r = timeEntryCompleteness({ entryUserIds: [U1, U1, U2], totalCount: 3, byDayCountPerUser: new Map([[U1, 2], [U2, 1]]) });
    expect(r).toEqual({ pulled: 3, expected: 3, complete: true, error: null });
  });

  it("flags a mismatch against timeSheetsByDay even when totalCount agrees (entry hidden from the list)", () => {
    const r = timeEntryCompleteness({ entryUserIds: [U1, U2], totalCount: 2, byDayCountPerUser: new Map([[U1, 2], [U2, 1]]) });
    expect(r.complete).toBe(false);
    expect(r.error).toContain("timeSheetsByDay sum 3 (diff -1)");
    expect(r.error).toContain("user-1 pulled 1 vs timeSheetsByDay 2");
    expect(r.error).not.toContain("user-2 pulled");
  });

  it("flags entries for a user the users pull did not return", () => {
    const r = timeEntryCompleteness({ entryUserIds: [U1, "ghost"], totalCount: 2, byDayCountPerUser: new Map([[U1, 1]]) });
    expect(r.complete).toBe(false);
    expect(r.error).toContain("ghost pulled 1, no timeSheetsByDay total");
  });

  it("counts entries without a user against totalCount only", () => {
    const r = timeEntryCompleteness({ entryUserIds: [U1, null], totalCount: 2, byDayCountPerUser: new Map([[U1, 1]]) });
    expect(r.complete).toBe(true);
  });
});
