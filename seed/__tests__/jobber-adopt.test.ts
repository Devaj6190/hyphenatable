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
  users: {
    "a-w01": "U1",
    "a-w02": "U2",
    "a-w03": "U3",
    "a-w04": "U4",
    "a-w05": "U5",
    "a-w07": "U7",
  },
  jobs: { "a-j01": "J1", "a-j02": "J2", "a-j04": "J4", "a-j05": "J5" },
};
/** A Jobber entry shaped like the fixture entry (same user/job/start/duration), with overrides. */
const like = (
  ourId: string,
  id: string,
  over: Partial<JobberEntry> = {},
): JobberEntry => {
  const f = e(ourId);
  return {
    id,
    user: { id: must(map.users?.[f.workerId as string]) },
    job: f.jobId ? { id: must(map.jobs?.[f.jobId as string]) } : null,
    startAt: f.startAt as string,
    ticking: f.ticking as boolean,
    finalDuration: f.ticking ? 0 : (f.durationSec as number),
    timeSheetCategory: "GENERAL",
    createdAt: "2026-10-24T09:00:00Z",
    ...over,
  };
};

describe("--adopt-entries matching", () => {
  test("default set: the checklist's planted entries", () => {
    expect(DEFAULT_ADOPT_IDS).toEqual([
      "a-te-0111",
      "a-te-0113",
      "a-te-0140",
      "a-te-0121",
      "a-te-0130",
      "a-te-0137",
      "a-te-0106",
      "a-te-0146",
      "a-te-0183",
      "a-te-0184",
      "a-te-0185",
    ]);
  });

  test("adopts every default entry when each exists once (no job, 13 h, zero minutes, unapproved, timer)", () => {
    const jobber = DEFAULT_ADOPT_IDS.filter((id) => id !== "a-te-0146").map(
      (id, i) =>
        like(id, `X${i}`, {
          createdAt: `2026-10-24T09:${String(i).padStart(2, "0")}:00Z`,
        }),
    );
    jobber.push(
      like("a-te-0146", "XDUP", { createdAt: "2026-10-24T10:00:00Z" }),
    );
    const r = matchEntries(fx.timeEntries, jobber, map, DEFAULT_ADOPT_IDS);
    expect(r.notFound).toEqual([]);
    expect(r.ambiguous).toEqual({});
    expect(Object.keys(r.adopted).sort()).toEqual(
      [...DEFAULT_ADOPT_IDS].sort(),
    );
    expect(r.adopted["a-te-0121"].matchedBy).toBe(
      "user+no-job+startAt+duration",
    );
    expect(r.adopted["a-te-0140"].matchedBy).toBe("user+job+ticking");
  });

  test("the CHK-05 duplicate pair gets two distinct Jobber ids, in order of creation", () => {
    const jobber = [
      like("a-te-0106", "LATER", { createdAt: "2026-10-24T09:05:00Z" }),
      like("a-te-0106", "FIRST", { createdAt: "2026-10-24T09:01:00Z" }),
    ];
    const r = matchEntries(fx.timeEntries, jobber, map, [
      "a-te-0146",
      "a-te-0106",
    ]);
    expect(r.adopted["a-te-0106"].jobberId).toBe("FIRST");
    expect(r.adopted["a-te-0146"].jobberId).toBe("LATER");
    expect(r.adopted["a-te-0106"].matchedBy).toContain("creationOrder");
  });

  test("only one copy of the duplicate entered: both reported not found, nothing written", () => {
    const r = matchEntries(fx.timeEntries, [like("a-te-0106", "ONLY")], map, [
      "a-te-0106",
      "a-te-0146",
    ]);
    expect(r.adopted).toEqual({});
    expect(r.notFound.sort()).toEqual(["a-te-0106", "a-te-0146"]);
  });

  test("duration and category are checked; a different duration or a non-GENERAL no-job entry does not match", () => {
    expect(
      matchEntries(
        fx.timeEntries,
        [like("a-te-0137", "Z", { finalDuration: 900 })],
        map,
        ["a-te-0137"],
      ).notFound,
    ).toEqual(["a-te-0137"]);
    expect(
      matchEntries(fx.timeEntries, [like("a-te-0137", "Z")], map, ["a-te-0137"])
        .adopted["a-te-0137"].jobberId,
    ).toBe("Z");
    expect(
      matchEntries(
        fx.timeEntries,
        [like("a-te-0121", "N", { timeSheetCategory: "DRIVING" })],
        map,
        ["a-te-0121"],
      ).notFound,
    ).toEqual(["a-te-0121"]);
  });

  test("ambiguous writes nothing; reruns keep mappings; ids mapped elsewhere are not reused", () => {
    const two = [
      like("a-te-0111", "Y1"),
      like("a-te-0111", "Y2", {
        startAt: new Date(
          Date.parse(e("a-te-0111").startAt as string) + 20_000,
        ).toISOString(),
      }),
    ];
    expect(
      matchEntries(fx.timeEntries, two, map, ["a-te-0111"]).ambiguous[
        "a-te-0111"
      ].sort(),
    ).toEqual(["Y1", "Y2"]);
    expect(
      matchEntries(
        fx.timeEntries,
        [like("a-te-0111", "X1")],
        { ...map, entries: { "a-te-0111": "X1" } },
        ["a-te-0111"],
      ).adopted["a-te-0111"].jobberId,
    ).toBe("X1");
    expect(
      matchEntries(
        fx.timeEntries,
        [like("a-te-0111", "X1")],
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
