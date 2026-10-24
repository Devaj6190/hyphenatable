import { describe, expect, it } from "vitest";
import type { RawTimeSheetEntry } from "../queries.ts";
import { pullCycle } from "../index.ts";
import { fakeJobberFetch, fixtures, memoryTokenStore } from "./fakeJobber.ts";

const tokens = () => memoryTokenStore({ accessToken: null, accessTokenExpiresAt: null, refreshToken: "fake-refresh-0" });
const auth = (fetchImpl: typeof fetch) => ({ clientId: "cid", clientSecret: "csecret", tokenStore: tokens(), fetchImpl, sleepImpl: async () => {} });
const PERIOD = ["2026-10-11", "2026-10-24"] as const;
const opts = { timezone: "America/Los_Angeles", cycleId: "a-c05", now: () => new Date("2026-10-24T12:00:00Z"), objects: false };

describe("pullCycle (recorded fixtures)", () => {
  it("pulls users and entries across pages; every SyncRun complete", async () => {
    const { fetch, calls } = fakeJobberFetch(fixtures());
    const r = await pullCycle(auth(fetch), "a", ...PERIOD, opts);
    expect(r.records.workers).toHaveLength(4);
    expect(r.records.timeEntries).toHaveLength(5);
    expect(r.records.timeEntries.every((e) => e.cycleId === "a-c05" && e.companyId === "a" && e.sourceId)).toBe(true);
    expect(r.syncRuns.map((s) => [s.object, s.pulled, s.expected, s.complete, s.error])).toEqual([
      ["users", 4, 4, true, null],
      ["timeSheetEntries", 5, 5, true, null],
    ]);
    expect(r.syncRuns.every((s) => s.source === "jobber" && s.cycleId === "a-c05" && s.finishedAt)).toBe(true);

    // the startAt filter is the pay period in the company timezone, in UTC (PDT = UTC-7)
    const te = calls.graphql.filter((c) => c.operation === "PayrollPilotTimeSheetEntries");
    expect(te).toHaveLength(2);
    expect(te[0]?.variables).toMatchObject({ startAfter: "2026-10-11T07:00:00.000Z", startBefore: "2026-10-25T07:00:00.000Z", first: 50, after: null });
    expect(te[1]?.variables.after).toBe("Mw");
    // byDay asked per user for the same dates
    const bd = calls.graphql.filter((c) => c.operation === "PayrollPilotUserTimeSheetsByDay");
    // Jobber caps timeSheetsByDay at 7 days: 14-day period = two windows per user
    expect(bd.map((c) => [c.variables.startDate, c.variables.endDate]).slice(0, 2)).toEqual([["2026-10-11", "2026-10-17"], ["2026-10-18", "2026-10-24"]]);
    expect(bd).toHaveLength(8);
    // headers on every request
    expect(calls.graphql.every((c) => c.version === "2026-09-25" && c.auth === "Bearer fake-access-1")).toBe(true);
  });

  it("a deliberately deleted entry makes the time-entry run incomplete with the difference", async () => {
    const fx = fixtures();
    const page2 = fx.entries.pages.Mw.data.timeSheetEntries;
    page2.nodes = page2.nodes.slice(0, 1) as typeof page2.nodes; // drop Sam's entry from the list only
    const { fetch } = fakeJobberFetch(fx);
    const r = await pullCycle(auth(fetch), "a", ...PERIOD, opts);
    const run = r.syncRuns.find((s) => s.object === "timeSheetEntries");
    expect(run?.complete).toBe(false);
    expect(run?.pulled).toBe(4);
    expect(run?.expected).toBe(5);
    expect(run?.error).toContain("pulled 4, totalCount 5 (diff -1)");
    expect(run?.error).toContain("Z2lkOi8vSm9iYmVyL1VzZXIvMTAwNA== pulled 0 vs timeSheetsByDay 1");
  });

  it("a per-user byDay disagreement alone makes the run incomplete", async () => {
    const fx = fixtures();
    const days = (fx.entries.byDay as Record<string, { date: string; totalDuration: number; entries: { totalCount: number } }[]>)["Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw=="];
    days?.push({ date: "2026-10-16", totalDuration: 3600, entries: { totalCount: 1 } });
    const { fetch } = fakeJobberFetch(fx);
    const r = await pullCycle(auth(fetch), "a", ...PERIOD, opts);
    const run = r.syncRuns.find((s) => s.object === "timeSheetEntries");
    expect(run?.complete).toBe(false);
    expect(run?.error).toContain("timeSheetsByDay sum 6 (diff -1)");
  });

  it("NOT_INVITED workers are active, pulled as normal records and covered by the per-user check", async () => {
    const fx = fixtures();
    const jordan = fx.users.ACTIVATED.data.users.nodes[2];
    if (jordan) jordan.status = "NOT_INVITED"; // added in Manage Team without a login invite
    const { fetch } = fakeJobberFetch(fx);
    const r = await pullCycle(auth(fetch), "a", ...PERIOD, opts);
    const users = r.syncRuns.find((s) => s.object === "users");
    expect(users?.complete).toBe(true);
    expect(users).toMatchObject({ pulled: 4, expected: 4, error: null });
    const w = r.records.workers.find((x) => x.jobber?.userId === "Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==");
    expect(w).toMatchObject({ status: "active", jobber: { status: "NOT_INVITED" } });
    expect(r.records.workers.filter((x) => x.status === "inactive").map((x) => x.jobber?.status)).toEqual(["DEACTIVATED"]);
    // their entries are checked against their own timeSheetsByDay totals
    expect(r.syncRuns.find((s) => s.object === "timeSheetEntries")?.complete).toBe(true);
    expect(r.records.timeEntries.filter((e) => e.workerId === w?.id)).toHaveLength(2);
  });

  it("records a failed object as an incomplete SyncRun instead of throwing", async () => {
    const fx = fixtures();
    (fx.entries.pages as Record<string, unknown>).Mw = undefined; // page 2 errors
    const { fetch } = fakeJobberFetch(fx);
    const r = await pullCycle(auth(fetch), "a", ...PERIOD, opts);
    const run = r.syncRuns.find((s) => s.object === "timeSheetEntries");
    expect(run?.complete).toBe(false);
    expect(run?.expected).toBeNull();
    expect(run?.error).toContain("bad cursor");
    expect(r.records.timeEntries).toHaveLength(0);
  });

  it("never emits note text or SyncRun errors with names", async () => {
    const fx = fixtures();
    fx.entries.pages.Mw.data.timeSheetEntries.nodes = [] as RawTimeSheetEntry[] as typeof fx.entries.pages.Mw.data.timeSheetEntries.nodes;
    const { fetch } = fakeJobberFetch(fx);
    const r = await pullCycle(auth(fetch), "a", ...PERIOD, opts);
    expect(JSON.stringify(r)).not.toContain("fake note text");
    for (const name of ["Avery", "Jordan", "Sam", "Morgan"]) expect(JSON.stringify(r.syncRuns)).not.toContain(name);
  });
});
