import type { Id } from "@/convex/_generated/dataModel";

// Who the dashboard looks at Convex as. Row ids change whenever the database is reseeded, so nothing here is
// written in code: the owner and the manager are found by role from roster.list, and the NEXT_PUBLIC_LIVE_* env
// ids are only a fallback for when that lookup is not deployed.
export type LiveIds = {
  companyId: Id<"companies">;
  ownerId: Id<"workers">;
  /** Null when the company has no manager worker; the manager views then stay on fixtures. */
  managerId: Id<"workers"> | null;
};

export type LiveContext = {
  /** The dashboard's company key ("a", "b", "r"). */
  companyKey: string;
  ids: LiveIds;
  /** Worker display names by id, when roster.list supplied them. Empty for the env fallback. */
  names: Record<string, string>;
  via: "roster.list" | "env";
};

export type Roster = {
  demoMode: boolean;
  companies: { id: string; name: string; kind: string }[];
  workers: {
    id: string;
    companyId: string;
    displayName: string;
    role: string;
    managerId: string | null;
  }[];
};

export type EnvIds = {
  companyKey: string;
  companyId: string;
  ownerId: string;
  managerId: string;
};

/** "Company A (synthetic landscaping crew)" → "a". The dashboard keys companies by this letter. */
export function companyKeyOf(name: string): string | null {
  return /^Company ([A-Za-z])\b/.exec(name)?.[1].toLowerCase() ?? null;
}

/** The owner is the company's owner worker; the manager is the manager with the most direct reports (the crew lead). */
export function fromRoster(
  roster: Roster,
  companyKey: string,
): LiveContext | null {
  const company = roster.companies.find(
    (c) => companyKeyOf(c.name) === companyKey,
  );
  if (!company) return null;
  const workers = roster.workers.filter((w) => w.companyId === company.id);
  const owner = workers.find((w) => w.role === "owner");
  if (!owner) return null;
  const reports = (id: string) =>
    workers.filter((w) => w.managerId === id).length;
  const manager = workers
    .filter((w) => w.role === "manager")
    .sort((a, b) => reports(b.id) - reports(a.id))[0];
  return {
    companyKey,
    ids: {
      companyId: company.id as Id<"companies">,
      ownerId: owner.id as Id<"workers">,
      managerId: (manager?.id as Id<"workers">) ?? null,
    },
    names: Object.fromEntries(workers.map((w) => [w.id, w.displayName])),
    via: "roster.list",
  };
}

/** The env fallback applies to one company key, and only when all three ids are set. */
export function fromEnv(env: EnvIds, companyKey: string): LiveContext | null {
  if (env.companyKey !== companyKey) return null;
  if (!env.companyId || !env.ownerId || !env.managerId) return null;
  return {
    companyKey,
    ids: {
      companyId: env.companyId as Id<"companies">,
      ownerId: env.ownerId as Id<"workers">,
      managerId: env.managerId as Id<"workers">,
    },
    names: {},
    via: "env",
  };
}

export type LiveState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; ctx: LiveContext; note: string | null };

/** The lookup first, then the env ids; `unavailable` says why neither worked. */
export function resolveLive(
  lookup: { roster: Roster } | { error: string },
  env: EnvIds,
  companyKey: string,
): LiveState {
  let why: string;
  if ("roster" in lookup) {
    const ctx = fromRoster(lookup.roster, companyKey);
    if (ctx) return { status: "ready", ctx, note: null };
    why = lookup.roster.demoMode
      ? `roster.list has no owner for company ${companyKey.toUpperCase()}`
      : "roster.list is off (set DEMO_MODE=1 in the Convex environment)";
  } else {
    why = `roster.list is not available (${lookup.error})`;
  }
  const ctx = fromEnv(env, companyKey);
  if (ctx)
    return {
      status: "ready",
      ctx,
      note: `${why}; using the NEXT_PUBLIC_LIVE_* ids`,
    };
  return {
    status: "unavailable",
    reason: `${why}, and the NEXT_PUBLIC_LIVE_* ids are not set for company ${companyKey.toUpperCase()}`,
  };
}

/** Convex row ids are 32 lowercase letters and digits. Fixture ids ("a-flag-04") are not, so they never go to Convex. */
export const looksLikeConvexId = (s: string) => /^[a-z0-9]{32}$/.test(s);
