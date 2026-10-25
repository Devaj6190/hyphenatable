import { type Message, type Space, Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { log } from "./log.ts";
import { sendPoll } from "./polls.ts";
import type { InboundEvent, OutboundKind, Transport } from "./types.ts";

// Photon message → what the courier relays. Returns null for our own sends, read receipts, attachments and the like.
export function toInboundEvent(
  message: Message & { direction?: string },
): InboundEvent | null {
  if (message.direction === "outbound") return null;
  const phone = message.sender?.id;
  if (!phone) return null;
  const content = message.content;
  switch (content.type) {
    case "text":
      return {
        providerId: message.id,
        phone,
        text: content.text,
        kind: "text",
        pollTarget: null,
      };
    case "poll_option":
      if (!content.selected) return null;
      return {
        providerId: message.id,
        phone,
        text: content.option.title,
        kind: "poll_vote",
        pollTarget:
          content.pollMessageGuid ?? content.poll.pollMessageGuid ?? null,
      };
    case "reaction":
      return {
        providerId: message.id,
        phone,
        text: content.emoji,
        kind: "reaction",
        pollTarget: content.target.id,
      };
    default:
      return null;
  }
}

export async function createPhotonTransport(
  projectId: string,
  projectSecret: string,
): Promise<Transport> {
  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
  });
  const spaces = new Map<string, Space>();

  async function spaceFor(phone: string): Promise<Space> {
    let space = spaces.get(phone);
    if (!space) {
      space = await imessage(app).space.create(phone);
      spaces.set(phone, space);
    }
    return space;
  }

  return {
    name: "photon",
    async send(
      phone: string,
      kind: OutboundKind,
      text: string,
      options: string[] | null,
    ) {
      const space = await spaceFor(phone);
      if (kind === "poll" && options?.length) {
        const { providerId, asPoll } = await sendPoll(space, text, options);
        if (!asPoll)
          log(
            `poll not supported on this line; sent numbered text as ${providerId}`,
          );
        return { providerId };
      }
      const sent = await space.send(text);
      if (!sent) throw new Error("send returned no message");
      return { providerId: sent.id };
    },
    async *inbound() {
      for await (const [, message] of app.messages) {
        const event = toInboundEvent(message);
        if (event) yield event;
      }
    },
    close: () => app.stop(),
  };
}
