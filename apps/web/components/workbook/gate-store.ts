"use client";

import { useSyncExternalStore } from "react";

// ponytail: Gate 1 approval lives in memory for this tab until drafts.approveGate is live; then read Draft.status.
const approved = new Set<string>();
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function approveGate(draftId: string) {
  approved.add(draftId);
  for (const l of listeners) l();
}

export function useGateApproved(draftId: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => draftId !== null && approved.has(draftId),
    () => false,
  );
}
