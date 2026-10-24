import { describe, expect, test } from "vitest";
import { DEFER, firstPass, ORDER, remap } from "../convex/lib/ingest";

const ids = new Map([
  ["a", "C_company"],
  ["a-w05", "C_w05"],
  ["a-te-0121", "C_te121"],
  ["a-fl-1", "C_fl1"],
]);

describe("remap", () => {
  test("rewrites references by key", () => {
    expect(
      remap(
        {
          companyId: "a",
          workerId: "a-w05",
          entryIds: ["a-te-0121"],
          approvedBy: "a-w05",
        },
        ids,
      ),
    ).toEqual({
      companyId: "C_company",
      workerId: "C_w05",
      entryIds: ["C_te121"],
      approvedBy: "C_w05",
    });
  });

  test("never rewrites free text, source ids or check ids that equal a fixture id", () => {
    const row = {
      sourceId: "a-te-0121",
      recordId: "a-te-0121",
      category: "a",
      label: "a",
      seen: "a-w05",
      where: [{ system: "jobber", recordId: "a-te-0121", url: null }],
    };
    expect(remap(row, ids)).toEqual(row);
  });

  test("rewrites the nested references that do not end in Id", () => {
    expect(
      remap(
        {
          target: { table: "timeEntries", id: "a-te-0121", field: "jobId" },
          provenance: {
            evidence: ["a-te-0121", "not-an-id"],
            flagId: "a-fl-1",
          },
          refs: { entry: "a-te-0121" },
          params: { workerId: "a-w05", weeklyHours: 40 },
        },
        ids,
      ),
    ).toEqual({
      target: { table: "timeEntries", id: "C_te121", field: "jobId" },
      provenance: { evidence: ["C_te121", "not-an-id"], flagId: "C_fl1" },
      refs: { entry: "C_te121" },
      params: { workerId: "C_w05", weeklyHours: 40 },
    });
  });

  test("leaves unknown ids alone (Convex validation then rejects a dangling v.id)", () => {
    expect(remap({ workerId: "a-w99" }, ids)).toEqual({ workerId: "a-w99" });
  });
});

describe("firstPass", () => {
  test("drops id and empties deferred paths, keeping missing parents missing", () => {
    expect(
      firstPass("flags", {
        id: "a-fl-1",
        questionId: "q",
        correctionId: null,
        precedent: { ruleId: null, flagId: "a-fl-0", note: "same" },
        seen: "x",
      }),
    ).toEqual({
      questionId: null,
      correctionId: null,
      precedent: { ruleId: null, flagId: null, note: "same" },
      seen: "x",
    });
    expect(firstPass("flags", { id: "f", precedent: null })).toEqual({
      precedent: null,
    });
    expect(firstPass("lessons", { id: "l", relatedLessonIds: ["x"] })).toEqual({
      relatedLessonIds: [],
    });
  });

  test("every deferred table is ingested", () => {
    for (const table of Object.keys(DEFER)) expect(ORDER).toContain(table);
  });
});
