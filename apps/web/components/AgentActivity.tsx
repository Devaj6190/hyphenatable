"use client";

import { useQuery } from "convex/react";
import fixture from "@/app/_fixtures/agentRuns.json";
import { AgentRuns } from "@/components/AgentRuns";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { useLive } from "@/components/LiveProvider";
import { MorningBrief } from "@/components/MorningBrief";
import { useRole } from "@/components/RoleProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AgentRunRow } from "@/lib/agents";
import { toAgentRun, toAuditEvent } from "@/lib/live/agents";
import { useLiveCycle } from "@/lib/live/hooks";
import type { LiveContext } from "@/lib/live/ids";
import type { AuditEvent } from "@/lib/types";

export const AGENT_RUNS_FIXTURE_SOURCE =
  "synthetic fixture, apps/web/app/_fixtures/agentRuns.json";

/** The fixture rows for one company: the fixture only has Company A, so other companies get empty lists. */
export function fixtureAgentData(companyId: string): {
  runs: AgentRunRow[];
  events: AuditEvent[];
} {
  return {
    runs: (fixture.runs as AgentRunRow[]).filter(
      (r) => r.companyId === companyId,
    ),
    events: (fixture.events as unknown as AuditEvent[]).filter(
      (e) => e.companyId === companyId,
    ),
  };
}

/** Presentational: the Auditor's brief and each agent's newest run, with where they came from. */
export function AgentActivityView({
  runs,
  events,
  timezone,
  source,
  kind,
}: {
  runs: AgentRunRow[];
  events: AuditEvent[];
  timezone: string;
  source: string;
  /** Set for fixture data, so the section says it is synthetic. */
  kind: DataKind | null;
}) {
  return (
    <section aria-labelledby="agent-activity" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="agent-activity" className="text-lg font-semibold">
          Agents
        </h2>
        {kind && <DataLabel kind={kind} />}
        <span className="text-xs text-muted-foreground">Source: {source}</span>
      </div>
      <MorningBrief events={events} timezone={timezone} />
      <AgentRuns runs={runs} timezone={timezone} />
    </section>
  );
}

function LiveAgentActivity({
  ctx,
  note,
  companyId,
  timezone,
}: {
  ctx: LiveContext;
  note: string | null;
  companyId: string;
  timezone: string;
}) {
  const live = useLiveCycle(ctx);
  const cycleId =
    live.status === "ready" && live.cycle
      ? (live.cycle.id as Id<"cycles">)
      : null;
  const runs = useQuery(api.creaoRuns.list, cycleId ? { cycleId } : "skip");
  const briefs = useQuery(
    api.audit.list,
    cycleId
      ? {
          companyId: ctx.ids.companyId,
          cycleId,
          types: ["auditor.brief"],
          paginationOpts: { numItems: 1, cursor: null },
        }
      : "skip",
  );
  if (live.status === "failed") throw new Error("cycles.list failed");
  if (live.status === "ready" && !live.cycle) {
    const f = fixtureAgentData(companyId);
    return (
      <AgentActivityView
        {...f}
        timezone={timezone}
        source={`${AGENT_RUNS_FIXTURE_SOURCE} (no cycles in Convex yet)`}
        kind="synthetic"
      />
    );
  }
  if (runs === undefined || briefs === undefined)
    return <p className="text-sm text-muted-foreground">Loading agents…</p>;
  return (
    <AgentActivityView
      runs={runs.map(toAgentRun)}
      events={briefs.page.map(toAuditEvent)}
      timezone={timezone}
      source={`Convex creaoRuns.list and audit.list (auditor.brief)${note ? ` (${note})` : ""}`}
      kind={null}
    />
  );
}

/**
 * The owner home's agent section: live Convex runs for the current cycle and the newest auditor.brief, or the
 * synthetic fixture when Convex is off, unreachable, or has no data for this company. Owner only.
 */
export function AgentActivity({
  companyId,
  timezone,
}: {
  companyId: string;
  timezone: string;
}) {
  const { role } = useRole();
  const state = useLive();
  if (role !== "owner") return null;
  const fixtureView = (note: string) => (
    <AgentActivityView
      {...fixtureAgentData(companyId)}
      timezone={timezone}
      source={`${AGENT_RUNS_FIXTURE_SOURCE} (${note})`}
      kind="synthetic"
    />
  );
  if (state.status === "off") return fixtureView("Convex not configured");
  if (state.status === "loading")
    return <p className="text-sm text-muted-foreground">Loading agents…</p>;
  if (state.status === "unavailable")
    return fixtureView(`live Convex unavailable: ${state.reason}`);
  if (state.ctx.companyKey !== companyId)
    return fixtureView(`no live data for company ${companyId.toUpperCase()}`);
  return (
    <LiveBoundary
      fallback={(e) => fixtureView(`live Convex failed: ${errorReason(e)}`)}
    >
      <LiveAgentActivity
        ctx={state.ctx}
        note={state.note}
        companyId={companyId}
        timezone={timezone}
      />
    </LiveBoundary>
  );
}
