import { describe, expect, it } from "vitest";
import { fixtures } from "../payroll/__tests__/fixtures";
import { payRate } from "../payroll/rates";
import {
  applyChange,
  changeFor,
  effectOf,
  type PayrollInput,
} from "./corrections";

const A = fixtures("a");
const cycle = A.cycles.find((c) => c.id === "a-c05");
if (!cycle) throw new Error("a-c05 missing");
const entries = A.entries.filter((e) => e.cycleId === "a-c05");
const input: PayrollInput = {
  company: A.company,
  cycle,
  workers: A.workers,
  entries,
  expenses: [],
  rules: A.rules,
  heldFlags: [],
};
// An hourly worker's payable entry on a job, and a different job to move it to.
const entry = entries.find((e) => {
  const w = A.workers.find((x) => x.id === e.workerId);
  const r = w && payRate(w, A.rules);
  return (
    e.jobId && e.payable && e.category !== "BREAK" && r?.ok && r.unit === "Hour"
  );
});
if (!entry?.jobId) throw new Error("no hourly job entry in a-c05");
const otherJob = A.jobs.find((j) => j.id !== entry.jobId);
if (!otherJob) throw new Error("no second job");

describe("changeFor", () => {
  const records = {
    entries,
    expenses: [],
    jobIdByNumber: new Map([[otherJob.jobNumber, otherJob.id]]),
  };
  const subject = { entryIds: [entry.id], expenseIds: [] };

  it("maps a picked job number to the entry's jobId", () => {
    expect(
      changeFor(
        "entryNoJob",
        {
          kind: "change",
          optionIndex: 0,
          values: { jobNumber: otherJob.jobNumber },
          confidence: 1,
        },
        subject,
        records,
      ),
    ).toEqual({
      table: "timeEntries",
      id: entry.id,
      field: "jobId",
      before: entry.jobId,
      after: otherJob.id,
    });
  });

  it("never guesses an unknown job number, and a confirm changes nothing", () => {
    const unknown = {
      kind: "change" as const,
      optionIndex: 0,
      values: { jobNumber: 99999 },
      confidence: 1,
    };
    expect(changeFor("entryNoJob", unknown, subject, records)).toBeNull();
    const confirm = {
      kind: "confirm" as const,
      optionIndex: 0,
      values: {},
      confidence: 1,
    };
    expect(changeFor("longShift", confirm, subject, records)).toBeNull();
  });
});

describe("effectOf", () => {
  it("moving hours between jobs changes no pay and costs the new job their labor", () => {
    const e = effectOf(input, {
      table: "timeEntries",
      id: entry.id,
      field: "jobId",
      before: entry.jobId,
      after: otherJob.id,
    });
    expect(e.payCents).toBe(0);
    expect(e.profitJobId).toBe(otherJob.id);
    expect(e.profitCents).toBeLessThan(0);
  });

  it("dropping an overlapping entry lowers pay and gives the job its labor back", () => {
    const e = effectOf(input, {
      table: "timeEntries",
      id: entry.id,
      field: "payable",
      before: true,
      after: false,
    });
    expect(e.payCents).toBeLessThan(0);
    expect(e.profitCents).toBeGreaterThan(0);
  });

  it("a new end time stops the timer and fixes the duration", () => {
    const endAt = new Date(Date.parse(entry.startAt) + 3600_000).toISOString();
    const out = applyChange(entries, [], {
      table: "timeEntries",
      id: entry.id,
      field: "endAt",
      before: entry.endAt,
      after: endAt,
    });
    const changed = out.entries.find((x) => x.id === entry.id);
    expect(changed).toMatchObject({ endAt, durationSec: 3600, ticking: false });
  });
});

describe("changeFor never proposes a change that changes nothing", () => {
  it("an overlap pick whose entry is already dropped is no change", () => {
    const dropped = entries.map((e) =>
      e.id === entry.id ? { ...e, payable: false } : e,
    );
    const r = changeFor(
      "overlap",
      {
        kind: "change",
        optionIndex: 1,
        values: { dropEntryId: entry.id },
        confidence: 1,
      },
      { entryIds: [entry.id], expenseIds: [] },
      { entries: dropped, expenses: [], jobIdByNumber: new Map() },
    );
    expect(r).toBeNull();
  });
});
