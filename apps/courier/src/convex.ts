import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { log } from "./log.ts";
import type { Backend, OutboundRow } from "./types.ts";

// Functions are addressed by name, so the courier needs no generated code from apps/web/convex.
const pendingOutboundFn = makeFunctionReference<"query">("messages:pendingOutbound");
const markSentFn = makeFunctionReference<"mutation">("messages:markSent");
const markFailedFn = makeFunctionReference<"mutation">("messages:markFailed");
const inboundFn = makeFunctionReference<"mutation">("messages:inbound");

export function toOutboundRow(raw: Record<string, unknown>): OutboundRow {
  return {
    messageId: String(raw.messageId ?? raw._id),
    contactRef: (raw.contactRef as string | undefined) ?? null,
    conversationKey: (raw.conversationKey as string | undefined) ?? null,
    text: String(raw.text),
    kind: raw.kind === "poll" ? "poll" : "text",
    options: (raw.options as string[] | null | undefined) ?? null,
  };
}

export function createConvexBackend(url: string, courierKey: string): Backend {
  const client = new ConvexClient(url);
  let markFailedMissing = false;

  return {
    onPending(handler) {
      return client.onUpdate(
        pendingOutboundFn,
        { courierKey },
        (rows: Record<string, unknown>[]) => handler((rows ?? []).map(toOutboundRow)),
        (error) => log("pendingOutbound subscription error:", String(error)),
      );
    },
    async markSent(args) {
      await client.mutation(markSentFn, args);
    },
    // messages.markFailed is not a binding name yet (asked of B); until it exists, the failure is only logged.
    async markFailed(args) {
      if (markFailedMissing) return;
      try {
        await client.mutation(markFailedFn, args);
      } catch (error) {
        if (!/Could not find public function/i.test(String(error))) throw error;
        markFailedMissing = true;
        log("messages.markFailed is not deployed; failures are logged here only");
      }
    },
    async inbound(args) {
      await client.mutation(inboundFn, args);
    },
    close: () => client.close(),
  };
}
