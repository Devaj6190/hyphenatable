import { v } from "convex/values";
import { query } from "./_generated/server";

type Summary = {
  m1: null | { recall: number; precision: number; measuredAt: string };
  m3: null | { cycle: number; questionsAsked: number }[];
  m5: null | { complete: number; total: number };
  m6: null | { traceable: number; total: number };
};

/** M1, M3, M5, M6 for the readiness screen. null = not measured yet; a target is never shown as a result (B-16). */
export const summary = query({
  args: { companyId: v.id("companies") },
  handler: (): Summary => ({ m1: null, m3: null, m5: null, m6: null }),
});
