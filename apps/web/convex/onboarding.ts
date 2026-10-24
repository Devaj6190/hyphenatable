import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { notYet } from "./lib/stub";

export const run = action({
  args: { companyId: v.id("companies") },
  handler: () => notYet("B-13"),
});

/** "What did we miss?" questions for the owner (dashboard, not text). Empty until B-13. */
export const questions = query({
  args: { companyId: v.id("companies") },
  handler: (): { question: string; why: string }[] => [],
});
