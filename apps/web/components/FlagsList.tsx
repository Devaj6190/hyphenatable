"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { LiveBoundary } from "@/components/LiveBoundary";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { Segmented } from "@/components/Segmented";
import { flagStatus, StatusBadge } from "@/components/StatusBadge";
import { checkTitle } from "@/lib/checks";
import { FIXTURE_SOURCE, fixtureFlags } from "@/lib/fixtures";
import { affectsLabel, flagAgents, questionFor, recipient } from "@/lib/home";
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

type Render = (flags: Flag[], source: string) => ReactNode;

function fixture(companyId: string, note: string, children: Render) {
  return children(
    fixtureFlags.filter((f) => f.companyId === companyId),
    `${FIXTURE_SOURCE} (${note})`,
  );
}

function LiveFlags({
  companyId,
  children,
}: {
  companyId: string;
  children: Render;
}) {
  const cycles = useQuery(cyclesList, { companyId });
  const cycleId = cycles?.[0] ? (cycles[0].id ?? cycles[0]._id) : undefined;
  const flags = useQuery(flagsList, cycleId ? { cycleId } : "skip");
  if (cycles === undefined || (cycleId && flags === undefined)) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  // Empty deployment before B-02 seeds data: show the fixture so the screen is never blank.
  if (!cycleId || !flags)
    return fixture(companyId, "no cycles in Convex yet", children);
  return children(flags, "Convex flags.list");
}

/** The cycle's flags from Convex flags.list, or the fixture when Convex or the function isn't there. */
export function FlagsSource({
  companyId,
  children,
}: {
  companyId: string;
  children: Render;
}) {
  if (!hasConvex) return fixture(companyId, "Convex not configured", children);
  return (
    <LiveBoundary
      fallback={fixture(companyId, "Convex flags.list not live yet", children)}
    >
      <LiveFlags companyId={companyId}>{children}</LiveFlags>
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

function next(f: Flag): string {
  const q = questionFor(f);
  switch (f.status) {
    case "open":
      return q?.status === "draft"
        ? `Approve the text to ${recipient(q)}`
        : "Open it and decide";
    case "answered":
      return "Reply in. Approve the correction";
    case "asked":
      return `Waiting on ${recipient(q)}`;
    case "held":
      return "Held until you decide. Nothing else waits";
    case "corrected":
      return "Fixed and in the workbook";
    case "dismissed":
      return "Dismissed, no change";
  }
}

/** Every problem found this cycle, filterable by who it waits on. The Inputs page list. */
export function FlagsList({ companyId }: { companyId: string }) {
  const [group, setGroup] = useState<Group>("all");
  return (
    <FlagsSource companyId={companyId}>
      {(flags, source) => {
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
                  <ProblemRow key={f.id} flag={f} />
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Source: {source}.</p>
          </div>
        );
      }}
    </FlagsSource>
  );
}

function ProblemRow({ flag }: { flag: Flag }) {
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
          {flagAgents(flag.id).map((a) => (
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
        <p className="text-sm text-muted-foreground">{next(flag)}</p>
      </div>
    </li>
  );
}
