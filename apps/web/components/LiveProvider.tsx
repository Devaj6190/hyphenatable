"use client";

import { useQuery } from "convex/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { api } from "@/convex/_generated/api";
import { envIds, hasConvex } from "@/lib/live/config";
import { type LiveState, type Roster, resolveLive } from "@/lib/live/ids";

const LiveContext = createContext<LiveState>({ status: "off" });

/** What the screens need to go live: the company, owner and manager ids, or why they are not available. */
export const useLive = () => useContext(LiveContext);

type Lookup = { roster: Roster } | { error: string };

function Lookup({ onLookup }: { onLookup: (l: Lookup) => void }) {
  const roster = useQuery(api.roster.list, {});
  useEffect(() => {
    if (roster !== undefined) onLookup({ roster });
  }, [roster, onLookup]);
  return null;
}

function Failed({
  error,
  onLookup,
}: {
  error: string;
  onLookup: (l: Lookup) => void;
}) {
  useEffect(() => onLookup({ error }), [error, onLookup]);
  return null;
}

// Finds the owner and the manager by role from Convex (roster.list), falling back to the env ids. The lookup runs in
// its own error boundary, so a roster that is not deployed yet never takes a page down. Key it by company.
export function LiveProvider({
  companyKey,
  children,
}: {
  companyKey: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<LiveState>(
    hasConvex ? { status: "loading" } : { status: "off" },
  );
  const onLookup = useCallback(
    (l: Lookup) => setState(resolveLive(l, envIds, companyKey)),
    [companyKey],
  );
  return (
    <LiveContext.Provider value={state}>
      {hasConvex && (
        <LiveBoundary
          fallback={(e) => (
            <Failed error={errorReason(e)} onLookup={onLookup} />
          )}
        >
          <Lookup onLookup={onLookup} />
        </LiveBoundary>
      )}
      {children}
    </LiveContext.Provider>
  );
}
