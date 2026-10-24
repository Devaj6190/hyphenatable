import { describe, expect, it } from "vitest";
import entries from "../__fixtures__/timeSheetEntries.json";
import users from "../__fixtures__/users.json";
import { normalizeTimeSheetEntry, normalizeUser, toUtcIso } from "../normalize.ts";
import type { RawTimeSheetEntry, RawUser } from "../queries.ts";

const page1 = entries.pages.null.data.timeSheetEntries.nodes as RawTimeSheetEntry[];
const page2 = entries.pages.Mw.data.timeSheetEntries.nodes as RawTimeSheetEntry[];
const [e1, e2, e3] = page1 as [RawTimeSheetEntry, RawTimeSheetEntry, RawTimeSheetEntry];
const [e4] = page2 as [RawTimeSheetEntry];

describe("normalizeTimeSheetEntry", () => {
  it("maps a job entry to the section 6 TimeEntry, ids traced, times in UTC", () => {
    expect(normalizeTimeSheetEntry(e1, "a", "a-c05")).toEqual({
      id: "jobber:Z2lkOi8vSm9iYmVyL1RpbWVTaGVldEVudHJ5LzUwMDE=",
      companyId: "a",
      cycleId: "a-c05",
      sourceId: "Z2lkOi8vSm9iYmVyL1RpbWVTaGVldEVudHJ5LzUwMDE=",
      workerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMg==",
      jobId: "jobber:Z2lkOi8vSm9iYmVyL0pvYi8yMDAx",
      visitId: null,
      startAt: "2026-10-12T15:00:00.000Z",
      endAt: "2026-10-12T23:30:00.000Z",
      durationSec: 30600,
      ticking: false,
      approved: true,
      approvedBy: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMQ==",
      payable: true,
      category: "GENERAL",
      label: null,
      hasNote: false,
    });
  });

  it("takes visit and job from targetItem when job is null", () => {
    const t = normalizeTimeSheetEntry(e2, "a", null);
    expect(t.visitId).toBe("jobber:Z2lkOi8vSm9iYmVyL1Zpc2l0LzMwMDE=");
    expect(t.jobId).toBe("jobber:Z2lkOi8vSm9iYmVyL0pvYi8yMDAy");
  });

  it("sets hasNote from the note and never copies the note text", () => {
    const t = normalizeTimeSheetEntry(e2, "a", null);
    expect(t.hasNote).toBe(true);
    expect(JSON.stringify(t)).not.toContain("fake note text");
    expect(Object.keys(t)).not.toContain("note");
    // whitespace-only is not a note
    expect(normalizeTimeSheetEntry(e3, "a", null).hasNote).toBe(false);
  });

  it("keeps a no-job entry's label and category, with no job or visit invented", () => {
    const t = normalizeTimeSheetEntry(e3, "a", null);
    expect([t.jobId, t.visitId, t.label, t.category, t.approved, t.approvedBy]).toEqual([null, null, "Shop cleanup", "CUSTOM", false, null]);
  });

  it("keeps an open timer open: ticking true, endAt null", () => {
    const t = normalizeTimeSheetEntry(e4, "a", null);
    expect([t.ticking, t.endAt, t.durationSec]).toEqual([true, null, 7200]);
  });

  it("leaves workerId null when Jobber has no user", () => {
    expect(normalizeTimeSheetEntry({ ...e1, user: null }, "a", null).workerId).toBeNull();
  });

  it("rejects an unparseable timestamp instead of guessing", () => {
    expect(() => toUtcIso("not a date")).toThrow();
  });
});

describe("normalizeUser", () => {
  const [owner, avery, jordan] = users.ACTIVATED.data.users.nodes as [RawUser, RawUser, RawUser];
  const [sam] = users.DEACTIVATED.data.users.nodes as [RawUser];

  it("maps status, owner role, and labour rate to cents without float drift", () => {
    expect(normalizeUser(jordan, "a")).toEqual({
      id: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==",
      companyId: "a",
      displayName: "Jordan Ellis",
      role: null,
      payType: null,
      status: "active",
      managerId: null,
      contactRef: null,
      jobber: { userId: "Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==", labourRateCents: 3115, status: "ACTIVATED" },
      gusto: null,
      venmoRateCents: null,
    });
    expect(normalizeUser(avery, "a").jobber?.labourRateCents).toBe(2850);
    expect(normalizeUser(owner, "a").role).toBe("owner");
    expect(normalizeUser(sam, "a").status).toBe("inactive");
  });

  it("keeps a missing labour rate as null, never 0", () => {
    expect(normalizeUser(owner, "a").jobber?.labourRateCents).toBeNull();
  });
});
