import { httpRouter } from "convex/server";
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
    const key = process.env.MCP_KEY;
    if (!key || req.headers.get("authorization") !== `Bearer ${key}`)
      return new Response("unauthorized", { status: 401 });
    let rpc: Rpc;
    try {
      rpc = await req.json();
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
