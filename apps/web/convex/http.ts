import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { callTool, TOOLS } from "./creao";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () =>
    Response.json({ ok: true, at: new Date().toISOString() }),
  ),
});

const bearer = (req: Request, key: string | undefined) =>
  !!key && req.headers.get("authorization") === `Bearer ${key}`;

// ponytail: falls back to MCP_KEY until the two keys are split (creao-plan section 8).
const agentKey = () => process.env.PAYROLLPILOT_KEY ?? process.env.MCP_KEY;

/** S1: the tool list for Creao agent scripts. Same tools as /mcp, plain JSON. */
http.route({
  path: "/agent/tools",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    if (!bearer(req, agentKey()))
      return new Response("unauthorized", { status: 401 });
    return Response.json({ tools: TOOLS });
  }),
});

/**
 * S1: POST /agent/<tool> with the tool's arguments as the JSON body (empty body = no arguments).
 * Creao agents call this from their sandbox with PAYROLLPILOT_KEY from Creao Secrets.
 */
http.route({
  pathPrefix: "/agent/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!bearer(req, agentKey()))
      return new Response("unauthorized", { status: 401 });
    const name = new URL(req.url).pathname.slice("/agent/".length);
    if (!TOOLS.some((t) => t.name === name))
      return Response.json({ error: `unknown tool ${name}` }, { status: 404 });
    let args: Record<string, unknown>;
    try {
      const body = await req.text();
      args = body ? JSON.parse(body) : {};
    } catch {
      return Response.json({ error: "body is not JSON" }, { status: 400 });
    }
    try {
      return Response.json(await callTool(ctx, name, args));
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }),
});

/**
 * Creao calls this when a run finishes (up to 3 attempts, unsigned). We check the per-run token and
 * the run id, then re-fetch the run from Creao before trusting its status; 200 either way so Creao
 * stops retrying a delivery we have seen.
 */
http.route({
  path: "/creao/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => null)) as {
      runId?: string;
    } | null;
    const id = await ctx.runQuery(internal.creaoRuns.verifyWebhook, {
      creaoRunId: url.searchParams.get("r") ?? "",
      token: url.searchParams.get("t") ?? "",
      runId: body?.runId ?? "",
    });
    if (!id) return new Response("unknown run", { status: 404 });
    await ctx.scheduler.runAfter(0, internal.creaoRuns.refresh, {
      creaoRunId: id,
    });
    return new Response(null, { status: 200 });
  }),
});

type Rpc = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    protocolVersion?: string;
  };
};

/**
 * MCP over Streamable HTTP for the Creao agent (B-19). JSON responses only, no SSE, no sessions.
 * Bearer MCP_KEY from Convex env; refuses everything when it is unset.
 */
http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!bearer(req, process.env.MCP_KEY))
      return new Response("unauthorized", { status: 401 });
    let rpc: Rpc;
    try {
      rpc = (await req.json()) as Rpc;
    } catch {
      return Response.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      });
    }
    // Notifications (no id) get no body.
    if (rpc.id === undefined) return new Response(null, { status: 202 });
    const ok = (result: unknown) =>
      Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    switch (rpc.method) {
      case "initialize":
        return ok({
          protocolVersion: rpc.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "payrollpilot", version: "0.1.0" },
        });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call":
        try {
          const out = await callTool(
            ctx,
            rpc.params?.name ?? "",
            rpc.params?.arguments ?? {},
          );
          return ok({ content: [{ type: "text", text: JSON.stringify(out) }] });
        } catch (e) {
          return ok({
            content: [{ type: "text", text: (e as Error).message }],
            isError: true,
          });
        }
      default:
        return Response.json({
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32601, message: "method not found" },
        });
    }
  }),
});

export default http;
