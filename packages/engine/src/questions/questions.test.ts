import { describe, expect, it } from "vitest";
import {
  buildQuestion,
  candidateJobs,
  fromModel,
  parseClock,
  readReply,
  readYesNo,
  redactNames,
  restatement,
  zonedToUtc,
} from "./questions";

const tz = "America/Los_Angeles";
const entry = {
  id: "te_14",
  startAt: "2026-10-08T15:00:00Z", // 8:00am PDT
  endAt: "2026-10-08T23:00:00Z",
  durationSec: 8 * 3600,
};
const facts = {
  timezone: tz,
  workerName: "Rowan Vale",
  entries: [entry],
  jobNumbers: [12, 15],
  expense: null,
};

describe("buildQuestion", () => {
  it("asks which job for an entry with none, with the two candidates", () => {
    const q = buildQuestion("CHK-01", facts);
    expect(q?.text).toBe(
      "Rowan, on Oct 8 your 8h entry has no job. Which job was it? 1 Job 12 2 Job 15 3 something else",
    );
    expect(q?.options).toEqual(["Job 12", "Job 15", "something else"]);
  });

  it("leaves the flag on the dashboard when it can't offer two jobs", () => {
    expect(buildQuestion("CHK-01", { ...facts, jobNumbers: [12] })).toBeNull();
  });

  it("names both overlapping spans in local time", () => {
    const second = {
      id: "te_15",
      startAt: "2026-10-08T22:00:00Z",
      endAt: "2026-10-09T01:00:00Z",
      durationSec: 3 * 3600,
    };
    const q = buildQuestion("CHK-04", { ...facts, entries: [entry, second] });
    expect(q?.options.slice(0, 2)).toEqual(["8:00am-4:00pm", "3:00pm-6:00pm"]);
  });

  it("has no text for checks that only the dashboard shows", () => {
    expect(buildQuestion("CHK-06", facts)).toBeNull();
  });
});

describe("candidateJobs", () => {
  it("prefers that day's assigned visits, then the worker's most-logged jobs", () => {
    const visits = [
      {
        jobId: "j9",
        startAt: "2026-10-08T16:00:00Z",
        assignedWorkerIds: ["w1"],
      },
      {
        jobId: "j8",
        startAt: "2026-10-08T16:00:00Z",
        assignedWorkerIds: ["w2"],
      },
    ];
    const entries = [
      { workerId: "w1", jobId: "j3", startAt: "2026-10-06T16:00:00Z" },
      { workerId: "w1", jobId: "j3", startAt: "2026-10-07T16:00:00Z" },
      { workerId: "w1", jobId: "j4", startAt: "2026-10-05T16:00:00Z" },
    ];
    expect(candidateJobs("w1", entry.startAt, tz, visits, entries)).toEqual([
      "j9",
      "j3",
    ]);
  });
});

describe("parseClock and zonedToUtc", () => {
  it("reads common ways of writing a time", () => {
    expect(parseClock("4:30pm")).toEqual({ h: 16, m: 30 });
    expect(parseClock("4 PM")).toEqual({ h: 16, m: 0 });
    expect(parseClock("16:30")).toEqual({ h: 16, m: 30 });
    expect(parseClock("12am")).toEqual({ h: 0, m: 0 });
    expect(parseClock("4")).toBeNull();
    expect(parseClock("around 4ish")).toBeNull();
  });

  it("turns a local wall-clock time into UTC across DST", () => {
    expect(zonedToUtc("2026-10-08", 16, 30, tz)).toBe(
      "2026-10-08T23:30:00.000Z",
    );
    expect(zonedToUtc("2026-12-08", 16, 30, tz)).toBe(
      "2026-12-09T00:30:00.000Z",
    );
  });
});

describe("readReply", () => {
  const ctx = {
    entryIds: ["te_14", "te_15"],
    startAt: entry.startAt,
    timezone: tz,
  };
  const opts = ["Job 12", "Job 15", "something else"];

  it("maps a number to its job", () => {
    expect(readReply("entryNoJob", opts, "2", ctx)).toMatchObject({
      kind: "change",
      optionIndex: 1,
      values: { jobNumber: 15 },
      confidence: 1,
    });
  });

  it("escalates 'something else' instead of guessing", () => {
    expect(readReply("entryNoJob", opts, "3", ctx).kind).toBe("escalate");
  });

  it("handles STOP before anything else", () => {
    expect(readReply("entryNoJob", opts, " stop ", ctx).kind).toBe("stop");
  });

  it("leaves free text ambiguous", () => {
    expect(readReply("entryNoJob", opts, "the second one", ctx)).toMatchObject({
      kind: "ambiguous",
      confidence: 0,
    });
  });

  it("reads an open timer's stop time on the start's local day", () => {
    expect(readReply("openTimer", [], "4:30pm", ctx).values).toEqual({
      endAt: "2026-10-08T23:30:00.000Z",
    });
    expect(readReply("openTimer", [], "7am", ctx).kind).toBe("ambiguous");
  });

  it("drops the other entry for an overlap pick", () => {
    const o = ["a", "b", "both, different jobs", "neither"];
    expect(readReply("overlap", o, "1", ctx).values).toEqual({
      dropEntryId: "te_15",
    });
    expect(readReply("overlap", o, "3", ctx).kind).toBe("confirm");
  });
});

describe("free-text helpers", () => {
  const ctx = {
    entryIds: ["te_14", "te_15"],
    startAt: entry.startAt,
    timezone: tz,
  };
  const opts = ["Job 12", "Job 15", "something else"];

  it("redacts every known name token before a model sees the reply", () => {
    expect(
      redactNames("Rowan said ask vale about it", ["Rowan Vale", "Ana Lin"]),
    ).toBe("[person] said ask [person] about it");
  });

  it("maps the model's option pick through code, keeping its confidence", () => {
    expect(
      fromModel(
        { kind: "change", optionIndex: 1, values: {}, confidence: 0.92 },
        "entryNoJob",
        opts,
        ctx,
      ),
    ).toMatchObject({
      kind: "change",
      values: { jobNumber: 15 },
      confidence: 0.92,
    });
  });

  it("reads a time the model found for an open timer", () => {
    expect(
      fromModel(
        {
          kind: "change",
          optionIndex: null,
          values: { time: "4:30pm" },
          confidence: 0.9,
        },
        "openTimer",
        [],
        ctx,
      ).values,
    ).toEqual({ endAt: "2026-10-08T23:30:00.000Z" });
  });

  it("never lets the model's own values through", () => {
    expect(
      fromModel(
        {
          kind: "change",
          optionIndex: null,
          values: { jobId: "j99" },
          confidence: 0.99,
        },
        "entryNoJob",
        opts,
        ctx,
      ).kind,
    ).toBe("ambiguous");
  });

  it("restates a low-confidence pick and reads yes/no", () => {
    const r = fromModel(
      { kind: "change", optionIndex: 1, values: {}, confidence: 0.6 },
      "entryNoJob",
      opts,
      ctx,
    );
    expect(restatement("entryNoJob", opts, r, tz)).toBe("it was Job 15");
    expect(readYesNo("Yes.")).toBe("yes");
    expect(readYesNo("2")).toBe("no");
    expect(readYesNo("maybe")).toBeNull();
  });
});
