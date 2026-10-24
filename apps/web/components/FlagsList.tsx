"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Component, type ReactNode } from "react";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { FIXTURE_SOURCE, fixtureFlags } from "@/lib/fixtures";
import type { Flag } from "@/lib/types";

// Function refs by name so this builds before B's generated api exists.
const cyclesList = makeFunctionReference<
  "query",
  { companyId: string },
  { id?: string; _id?: string }[]
>("cycles:list");
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
  companyId,
  dataKind,
  note,
}: {
  companyId: string;
  dataKind: DataKind;
  note?: string;
}) {
  const flags = fixtureFlags.filter((f) => f.companyId === companyId);
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
}: {
  companyId: string;
  dataKind: DataKind;
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
        companyId={companyId}
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
}: {
  companyId: string;
  dataKind: DataKind;
}) {
  if (!hasConvex)
    return (
      <FixtureFlags
        companyId={companyId}
        dataKind={dataKind}
        note="Convex not configured"
      />
    );
  return (
    <LiveBoundary
      fallback={
        <FixtureFlags
          companyId={companyId}
          dataKind={dataKind}
          note="Convex flags.list not live yet"
        />
      }
    >
      <LiveFlags companyId={companyId} dataKind={dataKind} />
    </LiveBoundary>
  );
}
