// The one model adapter (plan B 4.3). Every agent call goes through `complete()`.
// The Anthropic client is injected: Convex "use node" actions create it, so the engine stays IO-free.
// Create it with `new Anthropic({ maxRetries: 0 })`; this function owns retries and the SDK's own
// would otherwise multiply them (SDK default 2 x ours 2 = up to 9 requests per call).
// Audit events and the daily budget are written by the Convex wrapper from the returned usage and ms.
import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { scrub } from "./scrub";

export type Model = "claude-opus-5-5" | "claude-haiku-5-5";
export type Effort = "low" | "medium" | "high";

/** The slice of the Anthropic client `complete()` uses. A real `Anthropic` instance satisfies it. */
export type LlmClient = {
  messages: {
    create(body: MessageCreateParamsNonStreaming): PromiseLike<Message>;
  };
};

export type CompleteOptions<T> = {
  client: LlmClient;
  model: Model;
  schema: z.ZodType<T>;
  system: string;
  /** Ids, dates, hours, amounts, categories only. Checked by `scrub()`; sent as JSON. */
  input: unknown;
  effort: Effort;
  /** Retries on 429, 5xx and connection errors. Default 2. */
  maxRetries?: number;
  /** Agent + task, e.g. "messenger.draft". Carried on errors for the audit log. */
  tag: string;
  /** Default 4096. Thinking tokens count against it. */
  maxTokens?: number;
};

export type CompleteResult<T> = {
  value: T;
  /** Summed over every attempt that reached the model. */
  usage: { input: number; output: number };
  model: Model;
  ms: number;
  attempts: number;
};

export class LlmError extends Error {
  constructor(
    readonly tag: string,
    message: string,
    readonly attempts: number,
    readonly usage: { input: number; output: number },
  ) {
    super(`${tag}: ${message}`);
    this.name = new.target.name;
  }
}
/** The model declined (`stop_reason: "refusal"`). Not retried. */
export class LlmRefusalError extends LlmError {}
/** Output cut off (`max_tokens` or context window). Not retried; raise `maxTokens`. */
export class LlmTruncatedError extends LlmError {}
/** Output failed the schema twice (first failure is retried with the error appended). */
export class LlmSchemaError extends LlmError {
  constructor(
    tag: string,
    readonly issues: string,
    attempts: number,
    usage: { input: number; output: number },
  ) {
    super(tag, `output failed schema after retry: ${issues}`, attempts, usage);
  }
}

const isTransient = (e: unknown) =>
  !(e instanceof APIUserAbortError) &&
  (e instanceof RateLimitError ||
    e instanceof InternalServerError ||
    e instanceof APIConnectionError);

const MAX_BACKOFF_MS = 20_000;

/** Honors retry-after(-ms) when the API sends it, else 0.5s, 1s, 2s... with jitter. */
function backoffMs(e: unknown, retry: number): number {
  const h = e instanceof APIError ? e.headers : undefined;
  const ms =
    Number(h?.get("retry-after-ms")) || Number(h?.get("retry-after")) * 1000;
  if (ms > 0) return Math.min(ms, MAX_BACKOFF_MS);
  return (
    Math.min(500 * 2 ** retry, MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `path: message` per zod issue. Zod messages state the rule, not the offending value. */
const formatIssues = (error: z.ZodError) =>
  error.issues
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");

function validate<T>(
  schema: z.ZodType<T>,
  text: string,
): { ok: true; value: T } | { ok: false; issues: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: `not valid JSON (${(e as Error).message})` };
  }
  const r = schema.safeParse(json);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, issues: formatIssues(r.error) };
}

export async function complete<T>(
  opts: CompleteOptions<T>,
): Promise<CompleteResult<T>> {
  const {
    client,
    model,
    schema,
    system,
    effort,
    tag,
    maxRetries = 2,
    maxTokens = 4096,
  } = opts;
  const started = Date.now();

  // Scrub exactly what is sent: JSON round-trip first (Dates become strings, undefined drops).
  const json = JSON.stringify(opts.input);
  if (json === undefined)
    throw new TypeError(`${tag}: input is not JSON-serializable`);
  scrub(JSON.parse(json));

  // ponytail: messages.create + our own safeParse, not messages.parse. parse() throws on a bad
  // JSON/schema output before stop_reason can be read, so a max_tokens cut-off would look like a
  // schema error. zodOutputFormat still builds the strict JSON schema the API expects.
  const format = {
    type: "json_schema" as const,
    schema: zodOutputFormat(schema).schema,
  };
  let prompt = json;
  let attempts = 0;
  let transientRetries = 0;
  let schemaRetried = false;
  const usage = { input: 0, output: 0 };

  for (;;) {
    attempts++;
    let res: Message;
    try {
      res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { format, effort },
      });
    } catch (e) {
      if (isTransient(e) && transientRetries < maxRetries) {
        await sleep(backoffMs(e, transientRetries++));
        continue;
      }
      throw e;
    }

    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;

    if (res.stop_reason === "refusal")
      throw new LlmRefusalError(tag, "model refused", attempts, usage);
    if (
      res.stop_reason === "max_tokens" ||
      res.stop_reason === "model_context_window_exceeded"
    ) {
      throw new LlmTruncatedError(
        tag,
        `output truncated (${res.stop_reason})`,
        attempts,
        usage,
      );
    }

    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("");
    const r = validate(schema, text);
    if (r.ok)
      return {
        value: r.value,
        usage,
        model,
        ms: Date.now() - started,
        attempts,
      };
    if (schemaRetried) throw new LlmSchemaError(tag, r.issues, attempts, usage);
    schemaRetried = true;
    prompt = `${json}\n\nYour previous output failed validation: ${r.issues}\nReturn only output that matches the schema.`;
  }
}
