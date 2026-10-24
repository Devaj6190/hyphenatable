import type { Flag, ViewerRole } from "@/lib/types";

export const ROLE_COOKIE = "pp_role";

// Anything that is not exactly "manager" is the owner view; the server and the client parse it the same way.
export const parseRole = (value: string | undefined | null): ViewerRole =>
  value === "manager" ? "manager" : "owner";

// Manager and employee views never get a pay amount: strip it before the data reaches any component.
export function forViewer(flag: Flag, role: ViewerRole): Flag {
  if (role === "owner") return flag;
  return { ...flag, affects: { ...flag.affects, dollarsCents: null } };
}
