import {
  type Contacts,
  conversationKey,
  opaqueId,
  redactPhones,
} from "./contacts.ts";
import { log } from "./log.ts";
import type {
  Backend,
  InboundEvent,
  OutboundItem,
  Transport,
} from "./types.ts";

export async function withRetry<T>(
  what: string,
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 250,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      log(`${what} failed (attempt ${i + 1}/${attempts}):`, String(error));
      if (i < attempts - 1) await Bun.sleep(baseMs * 2 ** i);
    }
  }
  throw lastError;
}

// The courier is dumb: it sends what Convex says is pending and relays what arrives. Convex decides everything else.
export class Relay {
  private inFlight = new Set<string>();
  private sent = new Map<string, string>(); // messageId → providerId; a message with a providerId is never sent again
  private refused = new Set<string>();
  private seenInbound = new Set<string>();

  constructor(
    private backend: Backend,
    private transport: Transport,
    private contacts: Contacts,
    private courierKey: string,
    private retryBaseMs = 250,
  ) {}

  async handlePending(rows: OutboundItem[]): Promise<void> {
    await Promise.all(rows.map((row) => this.sendOne(row)));
  }

  // Refused and failed sends are logged and never retried; the contract has no way to report them yet.
  private async sendOne(row: OutboundItem): Promise<void> {
    const id = row.messageId;
    if (this.inFlight.has(id) || this.sent.has(id) || this.refused.has(id))
      return;

    const phone = this.contacts.phoneFor(row.contactRef);
    if (!phone) {
      this.refused.add(id);
      log(
        `refused ${id}: contact ${row.contactRef} is not in contacts.json (unregistered_contact)`,
      );
      return;
    }

    this.inFlight.add(id);
    try {
      const sent = await this.transport.send(
        phone,
        row.kind,
        row.text,
        row.options,
      );
      const providerId = opaqueId(sent.providerId);
      this.sent.set(id, providerId);
      log(
        `sent ${id} (${row.kind}) via ${this.transport.name} to ${phone} as ${providerId}`,
      );
      await withRetry(
        `markSent ${id}`,
        () =>
          this.backend.markSent({
            courierKey: this.courierKey,
            messageId: id,
            providerId,
            conversationKey: conversationKey(phone),
          }),
        3,
        this.retryBaseMs,
      ).catch(() =>
        log(
          `markSent ${id} gave up; the text went out as ${providerId} and will not be resent`,
        ),
      );
    } catch (error) {
      this.refused.add(id);
      log(`send ${id} failed (send_error):`, String(error));
    } finally {
      this.inFlight.delete(id);
    }
  }

  async handleInbound(event: InboundEvent): Promise<void> {
    if (this.seenInbound.has(event.providerId)) return;
    this.seenInbound.add(event.providerId);
    // Nothing raw from the provider leaves the courier: ids are hashed, phones in the text are replaced.
    const providerId = opaqueId(event.providerId);
    if (!this.contacts.isRegistered(event.phone)) {
      log(`dropped inbound ${providerId} from unregistered ${event.phone}`);
      return;
    }
    // STOP goes through unchanged as text; Convex handles it in code before any model sees it.
    const args = {
      courierKey: this.courierKey,
      conversationKey: conversationKey(event.phone),
      providerId,
      text: redactPhones(event.text),
      kind: event.kind,
      pollTarget: event.pollTarget && opaqueId(event.pollTarget),
    };
    await withRetry(
      `inbound ${providerId}`,
      () => this.backend.inbound(args),
      3,
      this.retryBaseMs,
    ).catch(() => log(`inbound ${providerId} gave up after retries`));
    log(`relayed inbound ${providerId} (${event.kind}) from ${event.phone}`);
  }

  async run(): Promise<void> {
    const unsubscribe = this.backend.onPending((rows) => {
      this.handlePending(rows).catch((error) =>
        log("handlePending failed:", String(error)),
      );
    });
    try {
      for await (const event of this.transport.inbound()) {
        await this.handleInbound(event);
      }
    } finally {
      unsubscribe();
    }
  }
}
