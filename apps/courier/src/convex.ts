import { ConvexClient } from "convex/browser";
import { api } from "../../web/convex/_generated/api";
import { log } from "./log.ts";
import type { Backend } from "./types.ts";

// The real Convex deployment, through B's generated API: messages.pendingOutbound, markSent, inbound.
export function createConvexBackend(url: string, courierKey: string): Backend {
  const client = new ConvexClient(url);

  return {
    onPending(handler) {
      return client.onUpdate(
        api.messages.pendingOutbound,
        { courierKey },
        handler,
        (error) => log("pendingOutbound subscription error:", String(error)),
      );
    },
    async markSent(args) {
      await client.mutation(api.messages.markSent, args);
    },
    async inbound(args) {
      await client.mutation(api.messages.inbound, args);
    },
    close: () => client.close(),
  };
}
