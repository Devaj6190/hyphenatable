import { describe, expect, it } from "vitest";
import {
  applyApprovals,
  parseApprovals,
  readJobberApprovals,
} from "../jobber-approvals.ts";

const TZ = "America/New_York";
const row = (o: Record<string, unknown> = {}) => ({
  entryId: null,
  userId: "u1",
  date: "2026-10-14",
  start: "07:00",
  end: "15:30",
  hours: 8.5,
  approved: true,
  ...o,
});

describe("parseApprovals", () => {
  it("converts local wall time to UTC and hours to seconds", () => {
    const r = parseApprovals(
      { reportTotalHours: 8.5, entries: [row()] },
      "2026-10-10",
      "2026-10-23",
      TZ,
    );
    expect(r.problems).toEqual([]);
    expect(r.facts[0]).toMatchObject({
      startAt: "2026-10-14T11:00:00.000Z",
      durationSec: 30600,
      approved: true,
    });
  });

  it("flags rows that do not add up to the page total, rows out of range, and a missing total", () => {
    expect(
      parseApprovals(
        { reportTotalHours: 9, entries: [row()] },
        "2026-10-10",
        "2026-10-23",
        TZ,
      ).problems,
    ).toEqual(["entry hours 8.50 != report total 9.00"]);
    expect(
      parseApprovals(
        { reportTotalHours: 8.5, entries: [row({ date: "2026-10-30" })] },
        "2026-10-10",
        "2026-10-23",
        TZ,
      ).problems[0],
    ).toMatch(/outside/);
    expect(
      parseApprovals(
        { reportTotalHours: null, entries: [row()] },
        "2026-10-10",
        "2026-10-23",
        TZ,
      ).problems,
    ).toEqual(["the page showed no total hours"]);
  });

  it("tolerates Jobber's 0.005 h per-row rounding", () => {
    const entries = [row({ hours: 1.33 }), row({ hours: 1.33, start: null })];
    expect(
      parseApprovals(
        { reportTotalHours: 2.67, entries },
        "2026-10-10",
        "2026-10-23",
        TZ,
      ).problems,
    ).toEqual([]);
  });
});

describe("applyApprovals", () => {
  const entry = (o: Record<string, unknown> = {}) => ({
    sourceId: "e1",
    workerId: "a-w03",
    startAt: "2026-10-14T11:00:00.000Z",
    durationSec: 30600,
    approved: null as boolean | null,
    ...o,
  });
  const fact = (o: Record<string, unknown> = {}) => ({
    entryId: null,
    jobberUserId: "u1",
    date: "2026-10-14",
    startAt: "2026-10-14T11:00:00.000Z",
    durationSec: 30600,
    approved: false,
    ...o,
  });
  const users = new Map([["u1", "a-w03"]]);

  it("fills unknown approval by worker + start minute", () => {
    const r = applyApprovals([entry()], [fact()], users);
    expect(r.filled).toEqual(["e1"]);
    expect(r.entries[0]?.approved).toBe(false);
  });

  it("never overwrites a known value; disagreements and hour mismatches are conflicts", () => {
    const r = applyApprovals(
      [entry({ approved: true }), entry({ sourceId: "e2", workerId: "x" })],
      [fact(), fact({ entryId: "e2", durationSec: 3600 })],
      users,
    );
    expect(r.filled).toEqual([]);
    expect(r.entries[0]?.approved).toBe(true);
    expect(r.conflicts.map((c) => c.reason)).toEqual([
      "approval differs",
      "hours differ",
    ]);
  });

  it("leaves unknown users and ambiguous matches unmatched", () => {
    const r = applyApprovals(
      [entry(), entry({ sourceId: "e2" })],
      [fact(), fact({ jobberUserId: "nobody" })],
      users,
    );
    expect(r.unmatched).toHaveLength(2);
    expect(r.filled).toEqual([]);
  });
});

describe("readJobberApprovals", () => {
  const fakeFetch = (final: Record<string, unknown>) =>
    (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const body =
        init?.method === "POST" && path.endsWith("/runs")
          ? { id: "run1", status: "queued" }
          : path.endsWith("/status")
            ? { status: final.status }
            : { error: null, totalCostUsd: "0.42", ...final };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
  const ctx = {
    apiKey: "k",
    profileId: "p",
    companyId: "a",
    from: "2026-10-10",
    to: "2026-10-23",
    timezone: TZ,
    pollMs: 0,
  };

  it("returns a complete browser SyncRun when the rows add up", async () => {
    const r = await readJobberApprovals({
      ...ctx,
      fetch: fakeFetch({
        status: "completed",
        output: { reportTotalHours: 8.5, entries: [row()] },
      }),
    });
    expect(r.syncRun).toMatchObject({
      source: "browser",
      object: "timesheetApprovals",
      pulled: 1,
      expected: 1,
      complete: true,
      error: null,
    });
    expect(r.syncRun.method).toContain("run1 $0.42");
  });

  it("a failed run or an HTTP error is an incomplete SyncRun, not a throw", async () => {
    const failed = await readJobberApprovals({
      ...ctx,
      fetch: fakeFetch({ status: "failed", error: "login wall" }),
    });
    expect(failed.syncRun).toMatchObject({
      complete: false,
      expected: null,
      error: "run failed: login wall",
    });
    const down = await readJobberApprovals({
      ...ctx,
      fetch: (async () =>
        new Response("nope", { status: 401 })) as unknown as typeof fetch,
    });
    expect(down.syncRun.complete).toBe(false);
    expect(down.syncRun.error).toMatch(/401/);
  });
});
