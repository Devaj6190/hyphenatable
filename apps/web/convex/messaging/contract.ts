// Contract with the courier (shared-context section 10). Change only by a `contract:` PR that C acknowledges.
// Deviation from section 10: markSent also carries conversationKey. The courier is the only place that knows
// sha256(phone), and without it an inbound reply cannot be tied to the question that was sent.
import { ConvexError, type Infer, v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const pendingOutboundArgs = { courierKey: v.string() };

/** What the courier sends. It maps contactRef to a phone itself; the phone never reaches Convex. */
export type OutboundItem = {
  messageId: Id<"messages">;
  contactRef: string;
  text: string;
  kind: "text" | "poll";
  options: string[] | null;
};

export const markSentArgs = {
  courierKey: v.string(),
  messageId: v.id("messages"),
  providerId: v.string(),
  conversationKey: v.string(),
};

export const inboundArgs = {
  courierKey: v.string(),
  conversationKey: v.string(),
  providerId: v.string(),
  text: v.string(),
  kind: v.union(
    v.literal("text"),
    v.literal("poll_vote"),
    v.literal("reaction"),
  ),
  /** The poll's providerId when kind = "poll_vote"; ties the vote to its question. */
  pollTarget: v.union(v.string(), v.null()),
};

export type MarkSentArgs = Infer<
  ReturnType<typeof v.object<typeof markSentArgs>>
>;
export type InboundArgs = Infer<
  ReturnType<typeof v.object<typeof inboundArgs>>
>;

/** Rejects anything but the courier. Constant-time so the key cannot be probed byte by byte. */
export function assertCourier(courierKey: string): void {
  const expected = process.env.COURIER_KEY;
  if (!expected)
    throw new ConvexError("COURIER_KEY is not set on this deployment");
  let diff = courierKey.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ (courierKey.charCodeAt(i) || 0);
  }
  if (diff !== 0) throw new ConvexError("bad courier key");
}
