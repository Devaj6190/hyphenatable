"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { useLive } from "@/components/LiveProvider";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { useRole } from "@/components/RoleProvider";
import { Segmented } from "@/components/Segmented";
import { flagStatus, StatusBadge } from "@/components/StatusBadge";
import type { Id } from "@/convex/_generated/dataModel";
import { checkTitle } from "@/lib/checks";
import { affectsLabel, infoFor } from "@/lib/home";
import { useLiveFlags, useLiveInfo } from "@/lib/live/hooks";
import type { LiveContext } from "@/lib/live/ids";
import { FIXTURE_SOURCE } from "@/lib/sources";
import type { Flag } from "@/lib/types";
import type { Cycle, FlagInfo } from "@/lib/view-types";

/** What a live read adds to the flags: the live cycle, the question behind each flag, and who is looking. */
export type FlagsExtras = {
  live: boolean;
  /** Questions for the live flags, by flag id; null for fixture flags (the screen has its own fixture info). */
  info: Record<string, FlagInfo> | null;
  /** The worker looking (a Convex worker id when live); null for fixtures. */
  viewerId: string | null;
  cycle: Cycle | null;
  names: Record<string, string>;
};

const NO_FLAGS: Flag[] = [];

const FIXTURE_EXTRAS: FlagsExtras = {
  live: false,
  info: null,
  viewerId: null,
  cycle: null,
  names: {},
};

type Render = (flags: Flag[], source: string, extras: FlagsExtras) => ReactNode;

function LiveFlags({
  ctx,
  note,
  fixtureFlags,
  children,
}: {
  ctx: LiveContext;
  note: string | null;
  fixtureFlags: Flag[];
  children: Render;
}) {
  const { role } = useRole();
  const live = useLiveFlags(ctx, role);
  const ready = live.status === "ready";
  // Hooks run on every render, so the info lookup always runs; with no flags yet it asks for nothing.
  const { info, loading } = useLiveInfo(
    ctx,
    (ready ? live.viewerId : ctx.ids.ownerId) as Id<"workers">,
    ready ? live.flags : NO_FLAGS,
  );
  if (live.status === "no-viewer")
    return children(
      fixtureFlags,
      `${FIXTURE_SOURCE} (Convex has no ${role} for this company)`,
      FIXTURE_EXTRAS,
    );
  if (live.status === "loading" || loading)
    return <p className="text-muted-foreground">Loading…</p>;
  // Convex has no cycles yet: show the fixture so the screen is never blank.
  if (!live.cycle)
    return children(
      fixtureFlags,
      `${FIXTURE_SOURCE} (no cycles in Convex yet)`,
      FIXTURE_EXTRAS,
    );
  return children(
    live.flags,
    `Convex flags.list as the ${role}${note ? ` (${note})` : ""}`,
    {
      live: true,
      info,
      viewerId: live.viewerId,
      cycle: live.cycle,
      names: ctx.names,
    },
  );
}

/**
 * The cycle's flags from Convex flags.list for the role looking, or `fixtureFlags` (filtered and redacted on the
 * server for this viewer) when Convex is off, not reachable, or a live read fails. The source string says which, and
 * why. `live={false}` keeps a screen on fixtures when its other data (e.g. the roster) is still fixture-keyed.
 */
export function FlagsSource({
  companyId,
  fixtureFlags,
  live = true,
  children,
}: {
  companyId: string;
  fixtureFlags: Flag[];
  live?: boolean;
  children: Render;
}) {
  const state = useLive();
  const fixture = (note: string) =>
    children(fixtureFlags, `${FIXTURE_SOURCE} (${note})`, FIXTURE_EXTRAS);
  if (state.status === "off") return fixture("Convex not configured");
  if (!live) return fixture("this screen's roster is still a fixture");
  if (state.status === "loading")
    return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === "unavailable")
    return fixture(`live Convex unavailable: ${state.reason}`);
  if (state.ctx.companyKey !== companyId)
    return fixture(`no live data for company ${companyId.toUpperCase()}`);
  return (
    <LiveBoundary
      fallback={(e) => fixture(`live Convex failed: ${errorReason(e)}`)}
    >
      <LiveFlags ctx={state.ctx} note={state.note} fixtureFlags={fixtureFlags}>
        {children}
      </LiveFlags>
    </LiveBoundary>
  );
}

const groups = {
  all: () => true,
  you: (f: Flag) => f.status === "open" || f.status === "answered",
  waiting: (f: Flag) => f.status === "asked",
  held: (f: Flag) => f.status === "held",
  resolved: (f: Flag) => f.status === "corrected" || f.status === "dismissed",
} satisfies Record<string, (f: Flag) => boolean>;
type Group = keyof typeof groups;

function next(f: Flag, { question: q, recipient }: FlagInfo): string {
  switch (f.status) {
    case "open":
      return q?.status === "draft"
        ? `Approve the text to ${recipient}`
        : "Open it and decide";
    case "answered":
      return "Reply in. Approve the correction";
    case "asked":
      return `Waiting on ${recipient}`;
    case "held":
      return "Held until you decide. Nothing else waits";
    case "corrected":
      return "Fixed and in the workbook";
    case "dismissed":
      return "Dismissed, no change";
  }
}

/** Every problem found this cycle, filterable by who it waits on. The Inputs page list. */
export function FlagsList({
  companyId,
  flags: fixtureFlags,
  info,
  dataKind,
}: {
  companyId: string;
  dataKind: DataKind;
  /** Fixture flags, already filtered and redacted on the server for this viewer. */
  flags: Flag[];
  info: Record<string, FlagInfo>;
  /** The worker looking. Not used until #15 merges (see the TODO above). */
  viewerId: string;
}) {
  const [group, setGroup] = useState<Group>("all");
  return (
    <FlagsSource companyId={companyId} fixtureFlags={fixtureFlags}>
      {(flags, source, x) => {
        const rowInfo = x.info ?? info;
        const n = (g: Group) => flags.filter(groups[g]).length;
        const shown = flags.filter(groups[group]);
        return (
          <div className="flex flex-col gap-3">
            <div className="max-w-full self-start overflow-x-auto">
              <Segmented
                label="Show problems"
                value={group}
                onValueChange={setGroup}
                size="sm"
                className="min-w-max"
                options={[
                  { value: "all", label: `All ${n("all")}` },
                  { value: "you", label: `Needs you ${n("you")}` },
                  { value: "waiting", label: `Waiting ${n("waiting")}` },
                  { value: "held", label: `Held ${n("held")}` },
                  { value: "resolved", label: `Resolved ${n("resolved")}` },
                ]}
              />
            </div>
            {shown.length === 0 ? (
              <p className="rounded-card border bg-card p-6 text-muted-foreground">
                {flags.length === 0
                  ? "No problems found this cycle."
                  : "Nothing in this group."}
              </p>
            ) : (
              <ul className="flex flex-col overflow-hidden rounded-card border bg-card">
                {shown.map((f) => (
                  <ProblemRow
                    key={f.id}
                    flag={f}
                    info={infoFor(rowInfo, f.id)}
                  />
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Source: {source}. <DataLabel kind={dataKind} />
            </p>
          </div>
        );
      }}
    </FlagsSource>
  );
}

function ProblemRow({ flag, info }: { flag: Flag; info: FlagInfo }) {
  const status = flagStatus[flag.status];
  return (
    <li className="grid gap-x-6 gap-y-2 border-b p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_9rem_11rem] md:items-start">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={`/c/${flag.companyId}/flags/${flag.id}`}
          className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {checkTitle(flag.checkId)}
        </Link>
        <p className="text-sm text-muted-foreground">{flag.seen}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {info.agents.map((a) => (
            <AgentChip key={a} agent={a} />
          ))}
          <ConfidenceBadge confidence={flag.confidence} />
          <PrecedentBadge
            precedent={flag.precedent}
            companyId={flag.companyId}
          />
        </div>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground md:hidden">Affects </span>
        {affectsLabel(flag.checkId)}
      </p>
      <div className="flex flex-col items-start gap-1.5">
        <StatusBadge status={status.status} label={status.label} />
        <p className="text-sm text-muted-foreground">{next(flag, info)}</p>
      </div>
    </li>
  );
}
