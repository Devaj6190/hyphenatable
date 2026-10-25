// The results.json contract the readiness screen and docs/PROOF.md read (plan A-11 step 6).
import { z } from "zod";
import { M4Summary } from "./m4-r";

const Ratio = z.object({
  num: z.number().int().min(0),
  den: z.number().int().min(0),
  value: z.number().min(0).max(1).nullable(),
});

export const Results = z.object({
  generatedAt: z.iso.datetime(),
  gitSha: z.string().nullable(),
  company: z.string(),
  cycle: z.string(),
  flagsSource: z.string(),
  synthetic: z.boolean(),
  /** How to read the numbers (e.g. what M1 counts). */
  notes: z.array(z.string()),
  m1: z.object({
    keyRows: z.number().int(),
    flags: z.number().int(),
    recall: Ratio,
    precision: Ratio,
    perCheck: z.record(
      z.string(),
      z.object({ recall: Ratio, precision: Ratio }),
    ),
    missedKeyRowIds: z.array(z.string()),
    unmatchedFlags: z.array(
      z.object({ id: z.string(), checkId: z.string(), seen: z.string() }),
    ),
    /** Flags that are not planted-error checks (AGT-01, LRN-01, ...), by checkId; not in precision. */
    otherFlags: z.record(z.string(), z.number().int()),
  }),
  m2: z.union([
    z.object({ status: z.literal("pending"), reason: z.string() }),
    z.object({
      status: z.literal("measured"),
      total: z.number().int(),
      match: z.number().int(),
      differ: z.number().int(),
      notLearned: z.number().int(),
    }),
  ]),
  m3: z.object({
    measured: z.array(
      z.object({ cycleId: z.string(), questionsAsked: z.number().int() }),
    ),
    pastAnswered: z.record(z.string(), z.number().int()),
    expectedFromAnswerKey: z.array(
      z.object({
        cycleId: z.string(),
        planted: z.number().int(),
        needAnswer: z.number().int(),
        resolvedByRule: z.number().int(),
        perCheck: z.record(z.string(), z.number().int()),
      }),
    ),
  }),
  m4: z.object({
    companyR: z.union([
      z.object({ status: z.literal("pending"), reason: z.string() }),
      M4Summary,
    ]),
    syntheticSelfCheck: z
      .object({
        company: z.string(),
        synthetic: z.boolean(),
        cycles: z.array(z.string()),
        workers: z.number().int(),
        exact: z.number().int(),
        maxDiffCents: z.number().int(),
        diffs: z.array(
          z.object({
            cycleId: z.string(),
            workerId: z.string(),
            engineCents: z.number().int(),
            paidCents: z.number().int(),
          }),
        ),
      })
      .nullable(),
  }),
  m5: z.object({
    runs: Ratio,
    blocked: z.array(
      z.object({
        id: z.string(),
        cycleId: z.string().nullable(),
        source: z.string(),
        object: z.string(),
        pulled: z.number().int(),
        expected: z.number().int().nullable(),
        error: z.string().nullable(),
      }),
    ),
  }),
  m6: z.object({
    traceable: Ratio,
    withWhere: Ratio,
    withRuleOrModel: Ratio,
    untraceableFlagIds: z.array(z.string()),
  }),
  /** M1 on every current cycle, when the flags come from the checks engine. */
  m1ByCycle: z
    .array(
      z.object({
        cycleId: z.string(),
        recall: Ratio,
        precision: Ratio,
        missedKeyRowIds: z.array(z.string()),
      }),
    )
    .optional(),
  /** M3 learning curve (m3-learning.ts): what still needs a person as the rules grow. */
  learning: z
    .object({
      extraction: z.string(),
      curve: z.array(
        z.object({
          scenario: z.enum(["day0", "onboarding", "learned"]),
          cycleId: z.string(),
          rules: z.number().int(),
          flags: z.number().int(),
          outcomes: z.object({
            needs_person: z.number().int(),
            rule_backed: z.number().int(),
            settled: z.number().int(),
            note: z.number().int(),
          }),
        }),
      ),
      learned: z.array(
        z.object({
          fromKeyRow: z.string(),
          type: z.string(),
          verdict: z.enum(["approved", "duplicate", "rejected_by_backtest"]),
          ruleId: z.string().nullable(),
          backtest: z
            .object({
              cycles: z.number().int(),
              agree: z.number().int(),
              disagree: z.number().int(),
            })
            .nullable(),
        }),
      ),
      resolvedRows: z.array(
        z.object({
          id: z.string(),
          checkId: z.string(),
          expected: z.string(),
          outcome: z.enum([
            "needs_person",
            "rule_backed",
            "settled",
            "note",
            "not_flagged",
          ]),
        }),
      ),
    })
    .optional(),
});
export type Results = z.infer<typeof Results>;
