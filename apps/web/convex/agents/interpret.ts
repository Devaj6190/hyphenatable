"use node";
// B-09: free-text replies read by Haiku 5.5 through complete() (ids and redacted text only). Code
// reads numbers, STOP and times first; this runs only when code could not.
import Anthropic from "@anthropic-ai/sdk";
import { complete } from "@payrollpilot/engine/llm/complete";
import { scrub } from "@payrollpilot/engine/llm/scrub";
import {
  InterpretationOutput,
  pairsToRecord,
} from "@payrollpilot/engine/schemas";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { MESSENGER_INTERPRET } from "./prompts";

export const read = internalAction({
  args: { questionId: v.id("questions"), messageId: v.id("messages") },
  handler: async (ctx, { questionId, messageId }) => {
    const req = await ctx.runQuery(internal.messages.readingRequest, {
      questionId,
      messageId,
    });
    if (!req) return;
    const input = {
      purpose: req.purpose,
      options: req.options,
      reply: req.reply,
    };
    try {
      scrub(input);
      const out = await complete({
        client: new Anthropic(),
        model: "claude-haiku-5-5",
        schema: InterpretationOutput,
        system: MESSENGER_INTERPRET.system,
        input,
        effort: "low",
        tag: "messenger.interpret",
        maxTokens: 2000,
      });
      await ctx.runMutation(internal.messages.applyReading, {
        questionId,
        messageId,
        reading: {
          kind: out.value.kind,
          optionIndex: out.value.optionIndex,
          values: pairsToRecord(out.value.values),
          confidence: out.value.confidence,
        },
        call: {
          model: out.model,
          prompt: MESSENGER_INTERPRET.version,
          inputTokens: out.usage.input,
          outputTokens: out.usage.output,
          ms: out.ms,
        },
      });
    } catch (e) {
      // No key, a refusal or a bad parse: the reply is treated as unclear (one follow-up, then held).
      await ctx.runMutation(internal.messages.applyReading, {
        questionId,
        messageId,
        reading: null,
        call: null,
        error: (e as Error).message.slice(0, 300),
      });
    }
  },
});
