// Browser Use Cloud (API v4) over plain fetch: one agent run with a JSON-Schema output, polled to the end.
// For pages that have no API and no export. The caller passes the key; nothing here reads env or files.
// Login lives in a Browser Use profile (cookies), filled once by a person through a live browser (cli.ts login):
// the agent is never given a password.

const API = "https://api.browser-use.com/api/v4";
const DONE = new Set(["completed", "failed", "cancelled"]);

export interface BrowserUseCtx {
  apiKey: string;
  /** Browser Use profile holding the site's login. */
  profileId: string;
  fetch?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed" | "cancelled" | "timeout";
  /** Parsed `output` (matches the run's outputSchema per Browser Use; the caller still validates it). */
  output: unknown;
  error: string | null;
  costUsd: string | null;
}

export async function call(
  ctx: Pick<BrowserUseCtx, "apiKey" | "fetch">,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await (ctx.fetch ?? fetch)(`${API}${path}`, {
    method,
    headers: {
      "X-Browser-Use-API-Key": ctx.apiKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      `browser-use ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`,
    );
  return res.json();
}

export async function runTask(
  ctx: BrowserUseCtx,
  task: string,
  outputSchema: object,
  opts: { model: string; maxCostUsd: number },
): Promise<RunResult> {
  const run = (await call(ctx, "POST", "/runs", {
    task,
    outputSchema,
    model: opts.model,
    maxCostUsd: opts.maxCostUsd,
    browserSettings: { profileId: ctx.profileId },
  })) as { id: string };
  const deadline = Date.now() + (ctx.timeoutMs ?? 15 * 60_000);
  for (;;) {
    const { status } = (await call(ctx, "GET", `/runs/${run.id}/status`)) as {
      status: string;
    };
    if (DONE.has(status)) break;
    if (Date.now() > deadline) {
      await call(ctx, "POST", `/runs/${run.id}/cancel`).catch(() => {});
      return {
        runId: run.id,
        status: "timeout",
        output: null,
        error: "timed out",
        costUsd: null,
      };
    }
    await new Promise((r) => setTimeout(r, ctx.pollMs ?? 5000));
  }
  const s = (await call(ctx, "GET", `/runs/${run.id}`)) as {
    status: RunResult["status"];
    output?: unknown;
    error: string | null;
    totalCostUsd: string;
  };
  return {
    runId: run.id,
    status: s.status,
    output: s.output ?? null,
    error: s.error,
    costUsd: s.totalCostUsd,
  };
}
