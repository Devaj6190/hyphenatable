// Courier side of the messaging contract (shared-context section 10). B's apps/web/convex/messaging/contract.ts is
// the source of truth once it lands; keep these in step with it.

export type OutboundKind = "text" | "poll";
export type InboundKind = "text" | "poll_vote" | "reaction";

// One row from messages.pendingOutbound. Convex knows the recipient by contactRef (Worker.contactRef);
// conversationKey is accepted too for replies into an existing conversation.
export type OutboundRow = {
  messageId: string;
  contactRef: string | null;
  conversationKey: string | null;
  text: string;
  kind: OutboundKind;
  options: string[] | null;
};

export type MarkSentArgs = { courierKey: string; messageId: string; providerId: string };
export type MarkFailedArgs = { courierKey: string; messageId: string; reason: string };
export type InboundArgs = {
  courierKey: string;
  conversationKey: string;
  providerId: string;
  text: string;
  kind: InboundKind;
  pollTarget: string | null;
};

// The Convex functions the courier calls, or the local stub with the same names.
export interface Backend {
  onPending(handler: (rows: OutboundRow[]) => void): () => void;
  markSent(args: MarkSentArgs): Promise<void>;
  markFailed(args: MarkFailedArgs): Promise<void>;
  inbound(args: InboundArgs): Promise<void>;
  close(): Promise<void>;
}

// What arrived from a phone, before the phone is turned into a conversationKey.
export type InboundEvent = {
  providerId: string;
  phone: string;
  text: string;
  kind: InboundKind;
  pollTarget: string | null;
};

// Photon, or a fake that prints sends when no Photon credentials are set.
export interface Transport {
  readonly name: string;
  send(phone: string, kind: OutboundKind, text: string, options: string[] | null): Promise<{ providerId: string }>;
  inbound(): AsyncIterable<InboundEvent>;
  close(): Promise<void>;
}
