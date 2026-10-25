"use node";
// B-13 fallback: the Analyst through complete() in Convex when Creao is not configured, and the owner's
// plain-words rule restated (seconds, not a Creao run). Ids only; code validates and backtests after.
import Anthropic from "@anthropic-ai/sdk";
import { complete } from "@payrollpilot/engine/llm/complete";
import { scrub } from "@payrollpilot/engine/llm/scrub";
import { ProposedRules, RuleType } from "@payrollpilot/engine/schemas";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { ANALYST_RESTATE, ANALYST_RULES } from "./prompts";

export const propose = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<unknown> => {
    const input = await ctx.runQuery(internal.onboarding.history, {
      companyId,
    });
    scrub(input);
    const out = await complete({
      client: new Anthropic(),
      model: "claude-opus-5-5",
      schema: ProposedRules,
      system: ANALYST_RULES.system,
      input,
      effort: "high",
      tag: "analyst.rules",
    });
    return ctx.runMutation(internal.onboarding.proposeRules, {
      companyId,
      payload: out.value,
      by: `${out.model} (${ANALYST_RULES.version})`,
    });
  },
});

export const restate = internalAction({
  args: { companyId: v.id("companies"), text: v.string(), userId: v.string() },
  handler: async (ctx, { companyId, text, userId }): Promise<unknown> => {
    const { summary } = await ctx.runQuery(internal.onboarding.history, {
      companyId,
    });
    const input = {
      ownerText: text,
      ruleTypes: RuleType.options,
      context: {
        workers: summary.paidRegularRates.map((r) => r.workerId),
        accounts: summary.expenseAccounts.map((a) => a.accountName),
      },
    };
    scrub({ ...input, ownerText: "" });
    const out = await complete({
      client: new Anthropic(),
      model: "claude-opus-5-5",
      schema: ProposedRules,
      system: ANALYST_RESTATE.system,
      input,
      effort: "medium",
      tag: "analyst.restate",
    });
    return ctx.runMutation(internal.rules.storeStated, {
      companyId,
      payload: out.value,
      text,
      userId,
    });
  },
});
