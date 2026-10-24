import { z } from "zod";

// The reply Interpretation, exactly as shared-context section 6 defines it. The Messenger (Haiku 5.5) returns
// InterpretationResult plus a confidence; code stores the full Interpretation. B co-signs any change here.
export const interpretationKinds = [
  "confirm",
  "change",
  "fixed_in_source",
  "escalate",
  "ambiguous",
  "stop",
] as const;

export const InterpretationResult = z.object({
  kind: z.enum(interpretationKinds),
  optionIndex: z.number().int().min(1).max(4).nullable(), // questions carry at most four options
  values: z.record(z.string(), z.union([z.string(), z.number()])), // e.g. { jobId: "a-j04" }, { endAt: "16:30" }
});

export const Interpretation = z.object({
  id: z.string(),
  questionId: z.string(),
  messageId: z.string(),
  result: InterpretationResult,
  confidence: z.number().min(0).max(1),
  model: z.string(),
  needsFollowUp: z.boolean(),
});

export type InterpretationResult = z.infer<typeof InterpretationResult>;
export type Interpretation = z.infer<typeof Interpretation>;
