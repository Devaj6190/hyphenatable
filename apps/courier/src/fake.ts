import { log } from "./log.ts";
import type { InboundEvent, OutboundKind, Transport } from "./types.ts";

// Stands in for Photon when no credentials are set: sends are printed, replies are injected by the stub's /reply.
export class FakeTransport implements Transport {
  readonly name = "fake";
  private seq = 0;
  private queue: InboundEvent[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private lastPoll = new Map<
    string,
    { providerId: string; options: string[] }
  >();
  readonly outbox: {
    phone: string;
    kind: OutboundKind;
    text: string;
    options: string[] | null;
    providerId: string;
  }[] = [];

  async send(
    phone: string,
    kind: OutboundKind,
    text: string,
    options: string[] | null,
  ) {
    const providerId = `fake-out-${++this.seq}`;
    this.outbox.push({ phone, kind, text, options, providerId });
    if (kind === "poll" && options?.length)
      this.lastPoll.set(phone, { providerId, options });
    log(
      `[fake phone ${phone}] ${kind === "poll" ? `poll: ${text} [${options?.join(" | ")}]` : text}`,
    );
    return { providerId };
  }

  // A text reply, or a vote (1-based) on the last poll sent to that phone.
  inject(phone: string, reply: { text?: string; vote?: number }): InboundEvent {
    const providerId = `fake-in-${++this.seq}`;
    let event: InboundEvent;
    const pollSent = this.lastPoll.get(phone);
    if (reply.vote !== undefined && pollSent) {
      const title = pollSent.options[reply.vote - 1];
      if (!title) throw new Error(`poll has no option ${reply.vote}`);
      event = {
        providerId,
        phone,
        text: title,
        kind: "poll_vote",
        pollTarget: pollSent.providerId,
      };
    } else {
      event = {
        providerId,
        phone,
        text: reply.text ?? "",
        kind: "text",
        pollTarget: null,
      };
    }
    this.queue.push(event);
    this.wake?.();
    return event;
  }

  async *inbound(): AsyncIterable<InboundEvent> {
    while (!this.closed) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = null;
    }
  }

  async close() {
    this.closed = true;
    this.wake?.();
  }
}
