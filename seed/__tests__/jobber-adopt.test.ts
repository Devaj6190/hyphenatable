import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ADOPT_IDS,
  type JobberEntry,
  matchEntries,
} from "../lib/jobber-adopt";
import type { IdMap } from "../lib/jobber-mutations";
import { must } from "../lib/must";
import { loadFixtures } from "../push-jobber";

const { fx } = loadFixtures("a");
const e = (id: string) => must(fx.timeEntries.find((x) => x.id === id));
const map: IdMap = {
  users: { "a-w03": "U3", "a-w05": "U5" },
  jobs: { "a-j02": "J2", "a-j04": "J4" },
};
const entry = (
  id: string,
  user: string,
  job: string | null,
  startAt: string,
  ticking = false,
): JobberEntry => ({
  id,
  user: { id: user },
  job: job ? { id: job } : null,
  startAt,
  ticking,
});

describe("--adopt-entries matching", () => {
  test("the checklist entries are the CHK-04 pair for a-w03 on a-j02 and the CHK-02 timer for a-w05", () => {
    expect(DEFAULT_ADOPT_IDS).toEqual(["a-te-0111", "a-te-0113", "a-te-0140"]);
    expect([
      e("a-te-0111").workerId,
      e("a-te-0111").jobId,
      e("a-te-0111").startAt,
    ]).toEqual(["a-w03", "a-j02", "2026-10-14T11:00:00.000Z"]);
    expect([
      e("a-te-0113").workerId,
      e("a-te-0113").jobId,
      e("a-te-0113").startAt,
    ]).toEqual(["a-w03", "a-j02", "2026-10-14T16:00:00.000Z"]);
    expect([
      e("a-te-0140").workerId,
      e("a-te-0140").jobId,
      e("a-te-0140").ticking,
    ]).toEqual(["a-w05", "a-j02", true]);
  });

  test("matches by user + job + start (to the minute) and a ticking timer by user + job", () => {
    const jobber = [
      entry("X1", "U3", "J2", "2026-10-14T11:00:00Z"),
      entry("X2", "U3", "J2", "2026-10-14T16:00:30Z"),
      entry("X3", "U5", "J2", "2026-10-24T13:00:00Z", true),
      entry("X4", "U3", "J4", "2026-10-14T11:00:00Z"), // other job: ignored
    ];
    const r = matchEntries(fx.timeEntries, jobber, map, DEFAULT_ADOPT_IDS);
    expect(r.adopted).toEqual({
      "a-te-0111": { jobberId: "X1", matchedBy: "user+job+startAt" },
      "a-te-0113": { jobberId: "X2", matchedBy: "user+job+startAt" },
      "a-te-0140": { jobberId: "X3", matchedBy: "user+job+ticking" },
    });
  });

  test("not found and ambiguous write nothing; nothing is guessed", () => {
    const jobber = [
      entry("Y1", "U3", "J2", "2026-10-14T11:00:00Z"),
      entry("Y2", "U3", "J2", "2026-10-14T11:00:20Z"),
      entry("Y3", "U3", "J2", "2026-10-14T16:05:00Z"),
    ];
    const r = matchEntries(fx.timeEntries, jobber, map, [
      "a-te-0111",
      "a-te-0113",
    ]);
    expect(r.adopted).toEqual({});
    expect(r.ambiguous["a-te-0111"].sort()).toEqual(["Y1", "Y2"]);
    expect(r.notFound).toEqual(["a-te-0113"]);
  });

  test("rerunning adopt keeps the same mapping; a Jobber id mapped to another entry is not reused", () => {
    const jobber = [entry("X1", "U3", "J2", "2026-10-14T11:00:00Z")];
    expect(
      matchEntries(
        fx.timeEntries,
        jobber,
        { ...map, entries: { "a-te-0111": "X1" } },
        ["a-te-0111"],
      ).adopted["a-te-0111"].jobberId,
    ).toBe("X1");
    expect(
      matchEntries(
        fx.timeEntries,
        jobber,
        { ...map, entries: { "a-te-0999": "X1" } },
        ["a-te-0111"],
      ).notFound,
    ).toEqual(["a-te-0111"]);
  });

  test("refuses without the user or job mapping", () => {
    expect(() => matchEntries(fx.timeEntries, [], {}, ["a-te-0111"])).toThrow(
      "no Jobber user",
    );
  });
});
