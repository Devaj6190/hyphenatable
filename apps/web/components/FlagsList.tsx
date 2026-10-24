"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Component, type ReactNode } from "react";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { FIXTURE_SOURCE } from "@/lib/sources";
import type { Flag } from "@/lib/types";

// Function refs by name so this builds before B's generated api exists.
const cyclesList = makeFunctionReference<
  "query",
  { companyId: string },
  { id?: string; _id?: string }[]
>("cycles:list");
// TODO(#15, not wired until it merges): flags.list, flags.get and drafts.get take a required `viewerId` (the owner's
// worker id, or the manager's own worker id) and redact pay on the server. The pages already pass `viewerId`
// (viewer.workerId) down to FlagsList. When #15 lands, the call below becomes { companyId, viewerId, cycleId }; the
// detail page's flags.get takes { flagId, viewerId }, and the workbook's drafts.get is owner-only and throws for a
// manager. The viewerId is whoever the page says it is, so it is not access control until auth exists.
const flagsList = makeFunctionReference<"query", { cycleId: string }, Flag[]>(
  "flags:list",
);

const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function Cards({
  flags,
  dataKind,
  source,
}: {
  flags: Flag[];
  dataKind: DataKind;
  source: string;
}) {
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Source: {source} · {dataKind}
      </p>
      {flags.length === 0 ? (
        <p>Nothing needs you right now.</p>
      ) : (
        <div className="grid gap-3">
          {flags.map((f) => (
            <FlagCard key={f.id} flag={f} dataKind={dataKind} />
          ))}
        </div>
      )}
    </>
  );
}

function FixtureFlags({
  flags,
  dataKind,
  note,
}: {
  flags: Flag[];
  dataKind: DataKind;
  note?: string;
}) {
  return (
    <Cards
      flags={flags}
      dataKind={dataKind}
      source={`${FIXTURE_SOURCE}${note ? ` (${note})` : ""}`}
    />
  );
}

function LiveFlags({
  companyId,
  dataKind,
  fixtureFlags,
}: {
  companyId: string;
  dataKind: DataKind;
  fixtureFlags: Flag[];
}) {
  const cycles = useQuery(cyclesList, { companyId });
  const cycleId = cycles?.[0] ? (cycles[0].id ?? cycles[0]._id) : undefined;
  const flags = useQuery(flagsList, cycleId ? { cycleId } : "skip");
  if (cycles === undefined || (cycleId && flags === undefined)) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  // Empty deployment before B-02 seeds data: show the fixture so the screen is never blank.
  if (!cycleId || !flags)
    return (
      <FixtureFlags
        flags={fixtureFlags}
        dataKind={dataKind}
        note="no cycles in Convex yet"
      />
    );
  return <Cards flags={flags} dataKind={dataKind} source="Convex flags.list" />;
}

class LiveBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function FlagsList({
  companyId,
  dataKind,
  flags,
}: {
  companyId: string;
  dataKind: DataKind;
  /** Fixture flags, already filtered and redacted on the server for this viewer. */
  flags: Flag[];
  /** The worker looking. Not used until #15 merges (see the TODO above); passed now so the wiring point is real. */
  viewerId: string;
}) {
  if (!hasConvex)
    return (
      <FixtureFlags
        flags={flags}
        dataKind={dataKind}
        note="Convex not configured"
      />
    );
  return (
    <LiveBoundary
      fallback={
        <FixtureFlags
          flags={flags}
          dataKind={dataKind}
          note="Convex flags.list not live yet"
        />
      }
    >
      <LiveFlags
        companyId={companyId}
        dataKind={dataKind}
        fixtureFlags={flags}
      />
    </LiveBoundary>
  );
}
