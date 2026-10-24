"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { ROLE_COOKIE } from "@/lib/role";
import type { ViewerRole } from "@/lib/types";

// Demo-mode stand-in for login (cut-order item 5): the role lives in a cookie.
type Ctx = { role: ViewerRole; setRole: (r: ViewerRole) => void };
const RoleContext = createContext<Ctx>({ role: "owner", setRole: () => {} });
const EVENT = "pp-role-change";

function readRole(): ViewerRole {
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${ROLE_COOKIE}=`));
  return hit?.split("=")[1] === "manager" ? "manager" : "owner";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function RoleProvider({ children }: { children: ReactNode }) {
  // The server snapshot is "owner", so first paint is the owner view and the cookie applies after hydration.
  const role = useSyncExternalStore<ViewerRole>(
    subscribe,
    readRole,
    () => "owner",
  );
  const setRole = useCallback((r: ViewerRole) => {
    // biome-ignore lint/suspicious/noDocumentCookie: sync write needed so useSyncExternalStore reads it back at once; Cookie Store API is async.
    document.cookie = `${ROLE_COOKIE}=${r}; path=/; max-age=86400; samesite=lax`;
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);
