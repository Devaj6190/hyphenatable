"use node";
// First-hour checks H5 (Anthropic call from a "use node" action), H6 (structured output + explicit effort)
// and H7 (embedding stored and searched with a company filter). Ids only; no names reach the model.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const Probe = z.object({
  checkId: z.string(),
  routeTo: z.enum(["owner", "manager"]),
  reason: z.string(),
});

export const claude = action({
  args: { model: v.optional(v.string()) },
  handler: async (_ctx, { model = "claude-opus-5-5" }) => {
    const started = Date.now();
    const res = await new Anthropic().messages.parse({
      model,
      max_tokens: 1024,
      output_config: { effort: "medium", format: zodOutputFormat(Probe) },
      messages: [
        {
          role: "user",
          content:
            "Entry te_14 for worker w_07 on 2026-10-07 has no job and no visit. Which check id is this (CHK-01 hours_no_job, CHK-04 overlap) and who should answer it?",
        },
      ],
    });
    return {
      model: res.model,
      stop: res.stop_reason,
      parsed: res.parsed_output,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      ms: Date.now() - started,
    };
  },
});

const DIMS = 1024;

async function embed(texts: string[]): Promise<number[][]> {
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
        input: texts,
        output_dimension: DIMS,
      }),
    });
    if (!r.ok) throw new Error(`voyage ${r.status}: ${await r.text()}`);
    return ((await r.json()) as { data: { embedding: number[] }[] }).data.map(
      (d) => d.embedding,
    );
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
        input: texts,
        dimensions: DIMS,
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${await r.text()}`);
    return ((await r.json()) as { data: { embedding: number[] }[] }).data.map(
      (d) => d.embedding,
    );
  }
  throw new Error("set VOYAGE_API_KEY or OPENAI_API_KEY in Convex env");
}

type VectorProbe = {
  dims: number;
  provider: string;
  hits: { score: number; companyId?: string; text?: string }[];
};

export const vectors = action({
  args: {},
  handler: async (ctx): Promise<VectorProbe> => {
    const rows = [
      {
        companyId: "co_a",
        text: "Disposal runs belong to the parent job they serve.",
      },
      { companyId: "co_a", text: "Overtime is paid after 40 hours in a week." },
      {
        companyId: "co_b",
        text: "Disposal runs belong to the parent job they serve.",
      },
    ];
    const embeddings = await embed([
      ...rows.map((r) => r.text),
      "dump fees go on the main job",
    ]);
    await ctx.runMutation(internal.probe.insertVectors, {
      rows: rows.map((r, i) => ({ ...r, embedding: embeddings[i] })),
    });
    const hits = await ctx.vectorSearch("probeVectors", "by_embedding", {
      vector: embeddings[3],
      limit: 5,
      filter: (q) => q.eq("companyId", "co_a"),
    });
    const found: ({ companyId: string; text: string } | null)[] =
      await ctx.runQuery(internal.probe.vectorRows, {
        ids: hits.map((h) => h._id),
      });
    return {
      dims: embeddings[0].length,
      provider: process.env.VOYAGE_API_KEY
        ? "voyage-4-lite"
        : "text-embedding-3-small",
      hits: hits.map((h, i) => ({
        score: Number(h._score.toFixed(3)),
        ...(found[i] ?? {}),
      })),
    };
  },
});
