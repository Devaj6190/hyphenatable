"use client";

import { usePaginatedQuery } from "convex/react";
import type { ComponentProps } from "react";
import { AgentOrgChart } from "@/components/AgentOrgChart";
import { AuditLog } from "@/components/AuditLog";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { useLive } from "@/components/LiveProvider";
import { useRole } from "@/components/RoleProvider";
import { api } from "@/convex/_generated/api";
import { companies } from "@/lib/companies";
import { toAuditEvent } from "@/lib/live/adapt";
import type { LiveContext } from "@/lib/live/ids";
import { AUDIT_FIXTURE_SOURCE } from "@/lib/sources";

type Props = Omit<ComponentProps<typeof AuditLog>, "source">;

// audit.list takes no viewer and returns event data as stored, pay included, so only the owner subscribes.
export const AUDIT_MANAGER_NOTE =
  "Convex audit.list, owner only until it redacts pay for the manager";

function LiveAudit({
  ctx,
  note,
  ...rest
}: Props & { ctx: LiveContext; note: string | null }) {
  const { results, status } = usePaginatedQuery(
    api.audit.list,
    { companyId: ctx.ids.companyId },
    { initialNumItems: 200 },
  );
  if (status === "LoadingFirstPage")
    return <p className="text-muted-foreground">Loading…</p>;
  const events = results.map((d) => toAuditEvent(d, ctx.companyKey));
  const linkableFlagIds = [
    ...new Set(events.flatMap((e) => (e.refs.flagId ? [e.refs.flagId] : []))),
  ];
  return (
    <>
      <AgentOrgChart events={events} />
      <AuditLog
        {...rest}
        data={{ events, linkableFlagIds }}
        source={`Convex audit.list${note ? ` (${note})` : ""}`}
      />
    </>
  );
}

// The audit log from the fixture the server sent, or, for a company with no fixtures (Company R), from Convex
// audit.list as the owner. A manager on such a company sees an empty log that says why.
export function AuditSource(props: Props) {
  const { companyId, data } = props;
  const state = useLive();
  const { role } = useRole();
  const fixture = (note?: string) => (
    <>
      <AgentOrgChart events={data.events} />
      <AuditLog
        {...props}
        source={
          note ? `${AUDIT_FIXTURE_SOURCE} (${note})` : AUDIT_FIXTURE_SOURCE
        }
      />
    </>
  );
  if (companies[companyId]?.cycle !== null) return fixture();
  if (state.status === "off") return fixture("Convex not configured");
  if (state.status === "loading")
    return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === "unavailable")
    return fixture(`live Convex unavailable: ${state.reason}`);
  if (state.ctx.companyKey !== companyId)
    return fixture(`no live data for company ${companyId.toUpperCase()}`);
  if (role !== "owner")
    return (
      <AuditLog
        {...props}
        data={{ events: [], linkableFlagIds: [] }}
        source={AUDIT_MANAGER_NOTE}
      />
    );
  return (
    <LiveBoundary
      fallback={(e) => fixture(`live Convex failed: ${errorReason(e)}`)}
    >
      <LiveAudit {...props} ctx={state.ctx} note={state.note} />
    </LiveBoundary>
  );
}
