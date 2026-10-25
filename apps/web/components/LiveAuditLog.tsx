"use client";

import { usePaginatedQuery } from "convex/react";
import { AgentOrgChart } from "@/components/AgentOrgChart";
import { AuditLog } from "@/components/AuditLog";
import type { DataKind } from "@/components/DataLabel";
import { LiveCompany } from "@/components/LiveCompany";
import { useRole } from "@/components/RoleProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toAuditEvent } from "@/lib/live/adapt";
import type { LiveContext } from "@/lib/live/ids";

// The newest events; the log has no "load more" yet.
const PAGE = 200;

function Body({
  ctx,
  note,
  dataKind,
  timezone,
  companyId,
  companyLabel,
}: {
  ctx: LiveContext;
  note: string | null;
  dataKind: DataKind;
  timezone: string;
  companyId: string;
  companyLabel: string;
}) {
  const { role } = useRole();
  const owner = role === "owner";
  // audit.list returns every event's data as stored, and data can carry pay. It takes no viewer yet, so only the
  // owner's browser ever asks for it.
  const { results, status } = usePaginatedQuery(
    api.audit.list,
    owner ? { companyId: ctx.ids.companyId as Id<"companies"> } : "skip",
    { initialNumItems: PAGE },
  );
  if (!owner)
    return (
      <p className="rounded-card border bg-card p-5 text-muted-foreground">
        The live audit log is owner only for now: Convex returns it unredacted,
        and audit events can carry pay.
      </p>
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
        data={{ events, linkableFlagIds }}
        dataKind={dataKind}
        timezone={timezone}
        companyId={companyId}
        companyLabel={companyLabel}
        managerIds={ctx.ids.managerId ? [ctx.ids.managerId] : []}
        source={`Convex audit.list, newest ${PAGE}, as the owner${note ? ` (${note})` : ""}`}
      />
    </>
  );
}

// The audit log for a company with no fixtures (Company R), from Convex audit.list.
export function LiveAuditLog(props: {
  dataKind: DataKind;
  timezone: string;
  companyId: string;
  companyLabel: string;
}) {
  return (
    <LiveCompany companyId={props.companyId} label={props.companyLabel}>
      {(ctx, note) => <Body ctx={ctx} note={note} {...props} />}
    </LiveCompany>
  );
}
