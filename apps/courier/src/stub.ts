import type { Contacts } from "./contacts.ts";
import type { FakeTransport } from "./fake.ts";
import { log } from "./log.ts";
import type {
  Backend,
  Id,
  InboundArgs,
  MarkSentArgs,
  OutboundItem,
  OutboundKind,
} from "./types.ts";

// Local stand-in for B's messages.pendingOutbound / markSent / inbound until a Convex deployment is reachable.
// Same function names and the contract's argument types; rows live in memory. Like Convex, it stores
// conversationKeys (from markSent and inbound), never phones.
export type StubMessage = {
  messageId: Id<"messages">;
  direction: "out" | "in";
  contactRef: string | null;
  conversationKey: string | null;
  text: string;
  kind: OutboundKind | InboundArgs["kind"];
  options: string[] | null;
  status: "pending" | "sent" | "received";
  providerId: string | null;
  pollTarget: string | null;
  at: string;
};

export class StubBackend implements Backend {
  readonly messages: StubMessage[] = [];
  private seq = 0;
  private listeners = new Set<(rows: OutboundItem[]) => void>();

  constructor(private courierKey: string) {}

  private nextId(): Id<"messages"> {
    return `stub_msg_${++this.seq}` as Id<"messages">;
  }

  private check(courierKey: string) {
    if (courierKey !== this.courierKey) throw new Error("bad courierKey");
  }

  private notify() {
    const rows = this.pendingOutbound();
    for (const listener of this.listeners) listener(rows);
  }

  // Oldest first, one per conversation, as B-08 specifies.
  pendingOutbound(): OutboundItem[] {
    const seen = new Set<string>();
    const rows: OutboundItem[] = [];
    for (const m of this.messages) {
      if (m.direction !== "out" || m.status !== "pending" || !m.contactRef)
        continue;
      if (seen.has(m.contactRef)) continue;
      seen.add(m.contactRef);
      rows.push({
        messageId: m.messageId,
        contactRef: m.contactRef,
        text: m.text,
        kind: m.kind === "poll" ? "poll" : "text",
        options: m.options,
      });
    }
    return rows;
  }

  enqueue(input: {
    contactRef: string;
    text: string;
    kind?: OutboundKind;
    options?: string[] | null;
  }): StubMessage {
    const message: StubMessage = {
      messageId: this.nextId(),
      direction: "out",
      contactRef: input.contactRef,
      conversationKey: null,
      text: input.text,
      kind: input.kind ?? "text",
      options: input.options ?? null,
      status: "pending",
      providerId: null,
      pollTarget: null,
      at: new Date().toISOString(),
    };
    this.messages.push(message);
    this.notify();
    return message;
  }

  onPending(handler: (rows: OutboundItem[]) => void) {
    this.listeners.add(handler);
    handler(this.pendingOutbound());
    return () => this.listeners.delete(handler);
  }

  async markSent(args: MarkSentArgs) {
    this.check(args.courierKey);
    const m = this.messages.find((x) => x.messageId === args.messageId);
    if (!m) throw new Error(`no message ${args.messageId}`);
    m.status = "sent";
    m.providerId = args.providerId;
    m.conversationKey = args.conversationKey;
    this.notify();
  }

  async inbound(args: InboundArgs) {
    this.check(args.courierKey);
    if (
      this.messages.some(
        (x) => x.direction === "in" && x.providerId === args.providerId,
      )
    )
      return;
    this.messages.push({
      messageId: this.nextId(),
      direction: "in",
      contactRef: null,
      conversationKey: args.conversationKey,
      text: args.text,
      kind: args.kind,
      options: null,
      status: "received",
      providerId: args.providerId,
      pollTarget: args.pollTarget,
      at: new Date().toISOString(),
    });
  }

  async close() {
    this.listeners.clear();
  }
}

// Localhost-only control surface for the stub: queue a text, fake a reply, read what Convex would hold.
export function serveStubControl(
  stub: StubBackend,
  contacts: Contacts,
  fake: FakeTransport | null,
  port: number,
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(req) {
      const url = new URL(req.url);
      try {
        if (req.method === "GET" && url.pathname === "/messages")
          return Response.json(stub.messages);
        if (req.method === "POST" && url.pathname === "/outbound") {
          const body = (await req.json()) as {
            contactRef: string;
            text: string;
            kind?: OutboundKind;
            options?: string[];
          };
          return Response.json(stub.enqueue(body));
        }
        if (req.method === "POST" && url.pathname === "/reply") {
          if (!fake)
            return new Response(
              "replies come from the real phone when Photon is connected\n",
              { status: 409 },
            );
          const body = (await req.json()) as {
            contactRef: string;
            text?: string;
            vote?: number;
          };
          const phone = contacts.phoneFor(body.contactRef);
          if (!phone)
            return new Response(`unknown contactRef ${body.contactRef}\n`, {
              status: 404,
            });
          const event = fake.inject(phone, body);
          return Response.json({
            providerId: event.providerId,
            kind: event.kind,
          });
        }
        return new Response("GET /messages, POST /outbound, POST /reply\n", {
          status: 404,
        });
      } catch (error) {
        return new Response(`${String(error)}\n`, { status: 400 });
      }
    },
  });
  log(`stub control on http://127.0.0.1:${server.port}`);
  return server;
}
