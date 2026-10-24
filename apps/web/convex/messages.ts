// Courier side of the messaging contract (messaging/contract.ts). Every call is checked against COURIER_KEY.
import { mutation, query } from "./_generated/server";
import { notYet } from "./lib/stub";
import {
  assertCourier,
  inboundArgs,
  markSentArgs,
  type OutboundItem,
  pendingOutboundArgs,
} from "./messaging/contract";

export const pendingOutbound = query({
  args: pendingOutboundArgs,
  handler: (_ctx, { courierKey }): OutboundItem[] => {
    assertCourier(courierKey);
    return []; // B-08 fills the outbox; one open question per conversation.
  },
});

export const markSent = mutation({
  args: markSentArgs,
  handler: (_ctx, { courierKey }) => {
    assertCourier(courierKey);
    return notYet("B-08");
  },
});

export const inbound = mutation({
  args: inboundArgs,
  handler: (_ctx, { courierKey }) => {
    assertCourier(courierKey);
    return notYet("B-08");
  },
});
