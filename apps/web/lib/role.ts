import type { Flag, ViewerRole } from "@/lib/types";

export const ROLE_COOKIE = "pp_role";

// Manager and employee views never get a pay amount: strip it before the data reaches any component.
export function forViewer(flag: Flag, role: ViewerRole): Flag {
  if (role === "owner") return flag;
  return { ...flag, affects: { ...flag.affects, dollarsCents: null } };
}
