import { describe, expect, test } from "vitest";
import type { z } from "zod";
import { sample } from "./__fixtures__/sample";
import * as s from "./schemas";

const RECORDS: Record<keyof typeof sample, z.ZodType> = {
  companies: s.Company,
  workers: s.Worker,
  cycles: s.Cycle,
  syncRuns: s.SyncRun,
  timeEntries: s.TimeEntry,
  jobs: s.Job,
  visits: s.Visit,
  quotes: s.Quote,
  invoices: s.Invoice,
  payments: s.Payment,
  expenses: s.Expense,
  flags: s.Flag,
  questions: s.Question,
  messages: s.Message,
  interpretations: s.Interpretation,
  corrections: s.Correction,
  rules: s.Rule,
  lessons: s.Lesson,
  drafts: s.Draft,
  pastPayrolls: s.PastPayroll,
  auditEvents: s.AuditEvent,
  accessEvents: s.AccessEvent,
};

describe("records round-trip (parse → serialize → parse)", () => {
  for (const [table, schema] of Object.entries(RECORDS)) {
    test(table, () => {
      for (const row of sample[table as keyof typeof sample]) {
        const once = schema.parse(row);
        expect(schema.parse(JSON.parse(JSON.stringify(once)))).toEqual(once);
      }
    });
  }

  test("every fixture reference points at a row that exists", () => {
    const ids = new Set<string>(
      Object.values(sample).flatMap((rows) => rows.map((r) => r.id)),
    );
    // Source-system values, not references to our records.
    const notRefs = new Set([
      "sourceId",
      "recordId",
      "userId",
      "checkId",
      "providerId",
    ]);
    const refs = (v: unknown, key = ""): string[] =>
      typeof v === "string"
        ? /Ids?$/.test(key) && !notRefs.has(key)
          ? [v]
          : []
        : Array.isArray(v)
          ? v.flatMap((x) => refs(x, key))
          : v && typeof v === "object"
            ? Object.entries(v).flatMap(([k, x]) => refs(x, k))
            : [];
    const dangling = Object.values(sample)
      .flatMap((rows) => rows.flatMap((r) => refs(r)))
      .filter((id) => !ids.has(id));
    expect(dangling).toEqual([]);
  });
});

describe("contract rules", () => {
  test("money is integer cents", () => {
    expect(() =>
      s.Expense.parse({ ...sample.expenses[0], amountCents: 214.5 }),
    ).toThrow();
  });

  test("instants must be UTC", () => {
    expect(() =>
      s.TimeEntry.parse({
        ...sample.timeEntries[0],
        startAt: "2026-10-08T08:00:00-07:00",
      }),
    ).toThrow();
  });

  test("flag confidence is 'certain' or 0..1", () => {
    expect(() =>
      s.Flag.parse({ ...sample.flags[0], confidence: "likely" }),
    ).toThrow();
    expect(() =>
      s.Flag.parse({ ...sample.flags[0], confidence: 1.2 }),
    ).toThrow();
    expect(
      s.Flag.parse({ ...sample.flags[0], confidence: 0.7 }).confidence,
    ).toBe(0.7);
  });

  test("CheckId covers exactly CHK-01..CHK-23", () => {
    expect(s.CheckId.options).toHaveLength(25);
    expect(s.CheckId.options.slice(-3)).toEqual(["CHK-23", "AGT-01", "LRN-01"]);
  });
});

// biome-ignore lint/suspicious/noExplicitAny: walking zod's internal def tree
function hasRecord(schema: any): boolean {
  const def = schema._zod.def;
  if (def.type === "record") return true;
  const children = [
    def.innerType,
    def.element,
    ...(def.options ?? []),
    ...Object.values(def.shape ?? {}),
  ].filter(Boolean);
  return children.some(hasRecord);
}

describe("agent outputs work with structured outputs", () => {
  const AGENT = {
    ProposedRules: s.ProposedRules,
    LessonClassification: s.LessonClassification,
    MatchDecision: s.MatchDecision,
    ExpenseKind: s.ExpenseKind,
    QuestionDraft: s.QuestionDraft,
    InterpretationOutput: s.InterpretationOutput,
    CorrectionProposal: s.CorrectionProposal,
  };
  for (const [name, schema] of Object.entries(AGENT)) {
    test(`${name} has no open records (the model could only return {})`, () => {
      expect(hasRecord(schema)).toBe(false);
    });
  }

  test("pairsToRecord rebuilds the map and rejects repeated keys", () => {
    const out = s.InterpretationOutput.parse({
      kind: "change",
      optionIndex: null,
      values: [{ key: "jobId", value: "job_12" }],
      confidence: 0.9,
      needsFollowUp: false,
      followUpText: null,
    });
    expect(s.pairsToRecord(out.values)).toEqual({ jobId: "job_12" });
    expect(() =>
      s.pairsToRecord([
        { key: "hours", value: 8 },
        { key: "hours", value: 9 },
      ]),
    ).toThrow(/duplicate/);
  });
});
