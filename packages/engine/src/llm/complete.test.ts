import {
  APIConnectionError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { QuestionDraft } from "../schemas";
import {
  type CompleteOptions,
  complete,
  type LlmClient,
  LlmRefusalError,
  LlmSchemaError,
  LlmTruncatedError,
} from "./complete";
import { ScrubError } from "./scrub";

const draft: QuestionDraft = {
  text: "Was te_14 on 2026-10-14 for job_12 or job_15?",
  options: ["job_12", "job_15"],
  kind: "poll",
  toRole: "employee",
  reason: "CHK-14: entry has two candidate jobs",
};

const msg = (
  text: string,
  stop_reason: Message["stop_reason"] = "end_turn",
): Message =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  }) as unknown as Message;

/** Each step is a Message to return or an error to throw, in order. */
function fakeClient(...steps: (Message | Error)[]) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const client: LlmClient = {
    messages: {
      async create(body) {
        calls.push(structuredClone(body));
        const step = steps.shift();
        if (!step) throw new Error("fake client: no more steps");
        if (step instanceof Error) throw step;
        return step;
      },
    },
  };
  return { client, calls };
}

const opts = (
  client: LlmClient,
  extra: Partial<CompleteOptions<QuestionDraft>> = {},
) => ({
  client,
  model: "claude-opus-5-5" as const,
  schema: QuestionDraft,
  system: "You draft one short question.",
  input: {
    flagId: "flag_03",
    entryId: "te_14",
    candidates: ["job_12", "job_15"],
  },
  effort: "medium" as const,
  tag: "messenger.draft",
  ...extra,
});

const rateLimited = () =>
  new RateLimitError(
    429,
    { error: { type: "rate_limit_error" } },
    "rate limited",
    new Headers(),
  );
const overloaded = () =>
  new InternalServerError(
    529,
    { error: { type: "overloaded_error" } },
    "overloaded",
    new Headers(),
  );

/** Runs `p` to completion with fake timers so backoff sleeps don't slow the suite. */
async function settle<T>(p: Promise<T>): Promise<T> {
  const settled = p.then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  const r = await settled;
  if (r.ok) return r.v;
  throw r.e;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("complete", () => {
  test("returns the parsed value with usage, model, ms and attempts", async () => {
    const { client, calls } = fakeClient(msg(JSON.stringify(draft)));
    const r = await settle(complete(opts(client)));
    expect(r).toMatchObject({
      value: draft,
      usage: { input: 100, output: 20 },
      model: "claude-opus-5-5",
      attempts: 1,
    });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(calls).toHaveLength(1);
  });

  test("sends structured outputs, effort, max_tokens, the scrubbed JSON input, and no thinking", async () => {
    const { client, calls } = fakeClient(msg(JSON.stringify(draft)));
    await settle(
      complete(opts(client, { effort: "low", model: "claude-haiku-5-5" })),
    );
    const body = calls[0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(16_000);
    expect(body.output_config?.effort).toBe("low");
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body.output_config?.format?.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    expect(body.system).toBe("You draft one short question.");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: JSON.stringify({
          flagId: "flag_03",
          entryId: "te_14",
          candidates: ["job_12", "job_15"],
        }),
      },
    ]);
  });

  test("always sends output_config.effort, on retries too", async () => {
    const { client, calls } = fakeClient(
      rateLimited(),
      msg("{}"),
      msg(JSON.stringify(draft)),
    );
    await settle(complete(opts(client, { effort: "high" })));
    expect(calls.map((c) => c.output_config?.effort)).toEqual([
      "high",
      "high",
      "high",
    ]);
  });

  test("honors maxTokens", async () => {
    const { client, calls } = fakeClient(msg(JSON.stringify(draft)));
    await settle(complete(opts(client, { maxTokens: 8000 })));
    expect(calls[0].max_tokens).toBe(8000);
  });

  test("retries once on a schema failure with the error appended, and sums usage", async () => {
    const bad = { ...draft, kind: "sms" };
    const { client, calls } = fakeClient(
      msg(JSON.stringify(bad)),
      msg(JSON.stringify(draft)),
    );
    const r = await settle(complete(opts(client)));
    expect(r.value).toEqual(draft);
    expect(r.attempts).toBe(2);
    expect(r.usage).toEqual({ input: 200, output: 40 });
    const retryPrompt = calls[1].messages[0].content as string;
    expect(retryPrompt.startsWith(calls[0].messages[0].content as string)).toBe(
      true,
    );
    expect(retryPrompt).toMatch(/failed validation: kind: /);
  });

  test("retries once on invalid JSON", async () => {
    const { client, calls } = fakeClient(
      msg("not json"),
      msg(JSON.stringify(draft)),
    );
    await settle(complete(opts(client)));
    expect(calls[1].messages[0].content).toMatch(/not valid JSON/);
  });

  test("throws LlmSchemaError after the one schema retry", async () => {
    const { client, calls } = fakeClient(
      msg("{}"),
      msg('{"text":1}'),
      msg(JSON.stringify(draft)),
    );
    const err = await settle(complete(opts(client))).catch((e) => e);
    expect(err).toBeInstanceOf(LlmSchemaError);
    expect(err).toMatchObject({
      tag: "messenger.draft",
      attempts: 2,
      usage: { input: 200, output: 40 },
    });
    expect(calls).toHaveLength(2);
  });

  test("retries on a 429 then succeeds", async () => {
    const { client, calls } = fakeClient(
      rateLimited(),
      msg(JSON.stringify(draft)),
    );
    const r = await settle(complete(opts(client)));
    expect(r.value).toEqual(draft);
    expect(r.attempts).toBe(2);
    expect(r.usage).toEqual({ input: 100, output: 20 });
    expect(calls).toHaveLength(2);
  });

  test("retries on 5xx and connection errors", async () => {
    const { client } = fakeClient(
      overloaded(),
      new APIConnectionError({}),
      msg(JSON.stringify(draft)),
    );
    const r = await settle(complete(opts(client)));
    expect(r.attempts).toBe(3);
  });

  test("gives up after maxRetries and rethrows the SDK error", async () => {
    const { client, calls } = fakeClient(
      rateLimited(),
      rateLimited(),
      rateLimited(),
      msg(JSON.stringify(draft)),
    );
    await expect(settle(complete(opts(client)))).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(calls).toHaveLength(3);
  });

  test("maxRetries: 0 does not retry", async () => {
    const { client, calls } = fakeClient(
      overloaded(),
      msg(JSON.stringify(draft)),
    );
    await expect(
      settle(complete(opts(client, { maxRetries: 0 }))),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(1);
  });

  test("does not retry a 400", async () => {
    const bad = new BadRequestError(
      400,
      { error: { type: "invalid_request_error" } },
      "bad",
      new Headers(),
    );
    const { client, calls } = fakeClient(bad, msg(JSON.stringify(draft)));
    await expect(settle(complete(opts(client)))).rejects.toBe(bad);
    expect(calls).toHaveLength(1);
  });

  test("waits retry-after when the API sends it", async () => {
    const e = new RateLimitError(
      429,
      {},
      "rate limited",
      new Headers({ "retry-after": "3" }),
    );
    const { client, calls } = fakeClient(e, msg(JSON.stringify(draft)));
    const p = complete(opts(client));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await settle(p);
  });

  test("throws LlmRefusalError on refusal without retrying", async () => {
    const { client, calls } = fakeClient(
      msg("", "refusal"),
      msg(JSON.stringify(draft)),
    );
    await expect(settle(complete(opts(client)))).rejects.toBeInstanceOf(
      LlmRefusalError,
    );
    expect(calls).toHaveLength(1);
  });

  test("throws LlmTruncatedError on max_tokens, even when the partial text would parse", async () => {
    const { client } = fakeClient(msg(JSON.stringify(draft), "max_tokens"));
    await expect(settle(complete(opts(client)))).rejects.toBeInstanceOf(
      LlmTruncatedError,
    );
  });

  test("ignores thinking blocks and reads the text block", async () => {
    const m = msg(JSON.stringify(draft));
    m.content.unshift({
      type: "thinking",
      thinking: "...",
      signature: "sig",
    } as Message["content"][number]);
    const { client } = fakeClient(m);
    expect((await settle(complete(opts(client)))).value).toEqual(draft);
  });

  test("scrubs input before any call", async () => {
    const { client, calls } = fakeClient(msg(JSON.stringify(draft)));
    const input = { worker: { id: "w_07", displayName: "x" } };
    await expect(
      settle(complete(opts(client, { input }))),
    ).rejects.toBeInstanceOf(ScrubError);
    expect(calls).toHaveLength(0);
  });

  test("scrubs the serialized form (toJSON output is checked)", async () => {
    const { client, calls } = fakeClient(msg(JSON.stringify(draft)));
    const input = { w: { toJSON: () => ({ contactRef: "c_1" }) } };
    await expect(
      settle(complete(opts(client, { input }))),
    ).rejects.toBeInstanceOf(ScrubError);
    expect(calls).toHaveLength(0);
  });

  test("rejects input that does not serialize", async () => {
    const { client } = fakeClient(msg(JSON.stringify(draft)));
    await expect(
      settle(complete(opts(client, { input: undefined }))),
    ).rejects.toThrow(/not JSON-serializable/);
  });
});
