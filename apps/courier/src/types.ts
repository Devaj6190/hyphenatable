// The courier's side of the messaging contract. Every shape below comes from B's
// apps/web/convex/messaging/contract.ts (contract PR #15); nothing here is a guess.
import type { Id } from "../../web/convex/_generated/dataModel";
import type {
  InboundArgs,
  MarkSentArgs,
  OutboundItem,
} from "../../web/convex/messaging/contract";

export type { Id, InboundArgs, MarkSentArgs, OutboundItem };
export type OutboundKind = OutboundItem["kind"];
export type InboundKind = InboundArgs["kind"];

// The Convex functions the courier calls, or the local stub with the same names.
// The contract has no way to report a failed send yet (asked of B as a follow-up), so failures are only logged.
export interface Backend {
  onPending(handler: (rows: OutboundItem[]) => void): () => void;
  markSent(args: MarkSentArgs): Promise<void>;
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
  send(
    phone: string,
    kind: OutboundKind,
    text: string,
    options: string[] | null,
  ): Promise<{ providerId: string }>;
  inbound(): AsyncIterable<InboundEvent>;
  close(): Promise<void>;
}
