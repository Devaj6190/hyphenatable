"use node";
// B-14 steps 1–2: embed the lesson, find the company's nearest known lessons, and classify it (the
// Analyst through complete(), seconds not minutes, so not a Creao run). Code's comparison is the floor:
// a contradiction code finds is never downgraded by the model.
import Anthropic from "@anthropic-ai/sdk";
import { classifyLexical } from "@payrollpilot/engine/lessons/lessons";
import { complete } from "@payrollpilot/engine/llm/complete";
import { scrub } from "@payrollpilot/engine/llm/scrub";
import {
  LessonClassification,
  pairsToRecord,
} from "@payrollpilot/engine/schemas";
import { v } from "convex/values";
import { internal } from "../_generated/api";

import { internalAction } from "../_generated/server";
import { from } from "../lessons";
import { ANALYST_CLASSIFY } from "./prompts";

const DIMS = 1024;

/** Voyage or OpenAI at 1024 dimensions (the index's size); null when neither key is set. */
async function embed(text: string): Promise<number[] | null> {
  if (process.env.VOYAGE_API_KEY) {
    const base = process.env.VOYAGE_BASE_URL ?? "https://ai.mongodb.com/v1";
    const r = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "voyage-4-lite",
        input: [text],
        output_dimension: DIMS,
      }),
    });
    if (!r.ok) throw new Error(`voyage ${r.status}`);
    return ((await r.json()) as { data: { embedding: number[] }[] }).data[0]
      .embedding;
  }
  if (process.env.OPENAI_API_KEY) {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: [text],
        dimensions: DIMS,
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}`);
    return ((await r.json()) as { data: { embedding: number[] }[] }).data[0]
      .embedding;
  }
  return null;
}

export const recordLesson = internalAction({
  args: { companyId: v.id("companies"), from },
  handler: async (ctx, { companyId, from: f }) => {
    const i = await ctx.runQuery(internal.lessons.input, {
      companyId,
      from: f,
    });
    if (!i) return;

    // Step 2, compare: vector neighbours when an embedding provider is set, else every known lesson
    // goes to code's comparison (it matches on rule type and params, not wording).
    let embedding: number[] | null = null;
    try {
      embedding = await embed(i.draft.text);
    } catch {
      embedding = null;
    }
    let known = i.known;
    if (embedding) {
      const hits = await ctx.vectorSearch("lessons", "by_embedding", {
        vector: embedding,
        limit: 5,
        filter: (q) => q.eq("companyId", companyId),
      });
      const near = new Set(
        hits.filter((h) => h._score > 0).map((h) => h._id as string),
      );
      known = i.known.filter(
        (k) =>
          near.has(k.id) ||
          k.structured.ruleType === i.draft.structured.ruleType,
      );
    }
    const floor = classifyLexical(i.draft, known, i.activeRules);

    let c = {
      ...floor,
      ruleType: null as string | null,
      params: null as Record<string, unknown> | null,
      by: "code",
    };
    if (process.env.ANTHROPIC_API_KEY && floor.kind !== "conflict") {
      const input = {
        lesson: { text: i.draft.text, structured: i.draft.structured },
        known: known.slice(0, 5).map((k) => ({
          id: k.id,
          text: k.text,
          status: k.status,
          structured: k.structured,
        })),
        activeRules: i.activeRules,
      };
      try {
        scrub(input);
        const out = await complete({
          client: new Anthropic(),
          model: "claude-opus-5-5",
          schema: LessonClassification,
          system: ANALYST_CLASSIFY.system,
          input,
          effort: "medium",
          tag: "analyst.classify",
        });
        const m = out.value;
        const relatedOk =
          m.relatedLessonId === null ||
          known.some((k) => k.id === m.relatedLessonId);
        if (
          relatedOk &&
          (m.kind === "new" ||
            m.relatedLessonId !== null ||
            m.kind === "conflict")
        )
          c = {
            kind: m.kind,
            relatedLessonId: m.relatedLessonId,
            conflictRuleId: null,
            reason: `${m.reason} (${ANALYST_CLASSIFY.version}, ${out.model}, confidence ${m.confidence})`,
            ruleType: m.ruleType,
            params: m.params ? pairsToRecord(m.params) : null,
            by: out.model,
          };
      } catch {
        // A failed call leaves code's comparison in place; the lesson is still recorded.
      }
    }

    await ctx.runMutation(internal.lessons.store, {
      companyId,
      from: f,
      draft: i.draft,
      embedding: embedding ?? new Array(DIMS).fill(0),
      neighbourIds: known.map((k) => k.id),
      classification: c,
    });
  },
});
