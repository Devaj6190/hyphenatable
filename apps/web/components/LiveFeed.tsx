"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AgentChip } from "@/components/AgentChip";
import { LiveBoundary } from "@/components/LiveBoundary";
import { useRole } from "@/components/RoleProvider";
import { SimulatedChip } from "@/components/SimulatedChip";
import { forViewerEvents, isSimulated } from "@/lib/audit";
import { clock } from "@/lib/home";
import { AUDIT_FIXTURE_SOURCE } from "@/lib/sources";
import type { AuditEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

// By name so this builds before B's generated api has audit.list.
const auditList = makeFunctionReference<
  "query",
  { companyId: string; cycleId?: string; limit: number },
  AuditEvent[]
>("audit:list");

const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const SHOWN = 6;

type Render = (
  events: AuditEvent[],
  source: string,
  live: boolean,
) => ReactNode;

function Live({
  companyId,
  cycleId,
  children,
}: {
  companyId: string;
  cycleId: string;
  children: Render;
}) {
  const events = useQuery(auditList, { companyId, cycleId, limit: 30 });
  if (events === undefined)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  return children(events, "Convex audit.list, live", true);
}

// Messenger, Auditor and controller events for the cycle: a Convex subscription when audit.list is
// deployed, the audit fixture otherwise. `extra` holds this screen's own unsaved actions in fixture mode.
export function LiveFeed({
  companyId,
  cycleId,
  timeZone,
  fixtureEvents,
  visibleFlagIds,
  extra = [],
}: {
  companyId: string;
  cycleId: string;
  timeZone: string;
  /** The cycle's audit fixture, already filtered and redacted on the server for this viewer. */
  fixtureEvents: AuditEvent[];
  /** Flags this viewer may see, so live events about other flags are dropped for a manager. */
  visibleFlagIds: ReadonlySet<string>;
  extra?: AuditEvent[];
}) {
  const fixture = (note: string) =>
    render(fixtureEvents, `${AUDIT_FIXTURE_SOURCE} (${note})`, false);
  const render: Render = (events, source, live) => (
    <Feed
      events={[...extra, ...events]}
      freshIds={new Set(extra.map((e) => e.id))}
      source={source}
      live={live}
      timeZone={timeZone}
      companyId={companyId}
      visibleFlagIds={visibleFlagIds}
    />
  );
  if (!hasConvex) return fixture("Convex not configured");
  return (
    <LiveBoundary fallback={fixture("audit.list not live yet")}>
      <Live companyId={companyId} cycleId={cycleId}>
        {render}
      </Live>
    </LiveBoundary>
  );
}

function Feed({
  events,
  freshIds,
  source,
  live,
  timeZone,
  companyId,
  visibleFlagIds,
}: {
  events: AuditEvent[];
  freshIds: Set<string>;
  source: string;
  live: boolean;
  timeZone: string;
  companyId: string;
  visibleFlagIds: ReadonlySet<string>;
}) {
  const { role } = useRole();
  const shown = forViewerEvents(events, role, visibleFlagIds)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, SHOWN);

  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2
          id="feed-title"
          className="text-sm font-medium text-muted-foreground"
        >
          What happened
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              live ? "bg-foreground" : "bg-muted-foreground/50",
            )}
          />
          {live ? "Live" : "Fixture"}
        </span>
        <Link
          href={`/c/${companyId}/audit`}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          Audit log
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-card border bg-card p-4 text-sm text-muted-foreground">
          Nothing yet this cycle. Syncs, checks, questions and replies show up
          here as they happen.
        </p>
      ) : (
        <ol
          aria-live="polite"
          className="flex flex-col overflow-hidden rounded-card border bg-card"
        >
          {shown.map((e) => (
            <li
              key={e.id}
              className={cn(
                "border-b last:border-b-0",
                freshIds.has(e.id) &&
                  "overflow-hidden transition-[height,opacity] duration-(--dur-archive) ease-out-soft [interpolate-size:allow-keywords] starting:h-0 starting:opacity-0",
              )}
            >
              <div className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {e.actor.id === "you" ? (
                    <AgentChip agent="you" />
                  ) : (
                    <AgentChip actor={e.actor} />
                  )}
                  {isSimulated(e) && <SimulatedChip />}
                  <time
                    dateTime={e.at}
                    className="ml-auto text-xs text-muted-foreground tabular-nums"
                  >
                    {clock(e.at, timeZone)}
                  </time>
                </div>
                <p className="text-sm leading-snug">{e.summary}</p>
                {freshIds.has(e.id) && (
                  <p className="text-xs text-muted-foreground">
                    On this screen only. Not saved in fixture mode.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">Source: {source}.</p>
    </section>
  );
}
