"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AgentChip, type AgentKind } from "@/components/AgentChip";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { Money } from "@/components/Money";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { useRole } from "@/components/RoleProvider";
import { SourceChip } from "@/components/SourceChip";
import { flagStatus, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { checkTitle } from "@/lib/checks";
import { forViewer } from "@/lib/role";
import type { Flag, ViewerRole } from "@/lib/types";

export type FlagCardProps = {
  flag: Flag;
  dataKind: DataKind;
  /** Defaults to the RoleProvider role. Dollars are stripped before render unless "owner". */
  viewerRole?: ViewerRole;
  /** Plain headline; defaults to `flag.seen`. Ids or fake display names only. */
  headline?: string;
  /** What the money touches, e.g. "Wages", "Job cost", "Commission". */
  affectsLabel?: string;
  /** Agents that handled it, shown as chips (e.g. ["auditor", "messenger"]). */
  agents?: AgentKind[];
  /** Body slot: the proposed text, a match picker, a diff. */
  children?: ReactNode;
  onApprove?: () => void;
  onEdit?: () => void;
  onDeny?: () => void;
  /** e.g. "Approve and send", "Approve rule". */
  approveLabel?: string;
  /** Disables the three actions while a mutation is in flight. */
  pending?: boolean;
  /** Where and Check start expanded (problem detail); collapsed under "See details" elsewhere. */
  detailsOpen?: boolean;
  /** Set to null to hide the details link (e.g. on the detail page itself). */
  href?: string | null;
};

// Shannin's eight elements: status tag, headline, Where, Precedent, Affects, Check, Approve / Edit / Deny.
export function FlagCard({
  flag: rawFlag,
  dataKind,
  viewerRole,
  headline,
  affectsLabel,
  agents = [],
  children,
  onApprove,
  onEdit,
  onDeny,
  approveLabel = "Approve",
  pending = false,
  detailsOpen = false,
  href,
}: FlagCardProps) {
  const { role } = useRole();
  // Strip pay before render so a manager view cannot show it, whatever the data source sent.
  const flag = forViewer(rawFlag, viewerRole ?? role);
  const dollars = flag.affects.dollarsCents;
  const status = flagStatus[flag.status];
  const link =
    href === undefined ? `/c/${flag.companyId}/flags/${flag.id}` : href;
  const hasActions = Boolean(onApprove || onEdit || onDeny);

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
        <StatusBadge status={status.status} label={status.label} />
        {affectsLabel && (
          <span className="text-sm text-muted-foreground">
            Affects {affectsLabel.toLowerCase()}
          </span>
        )}
        <DataLabel kind={dataKind} className="ml-auto" />
      </div>

      <div className="flex flex-col gap-2 px-(--card-spacing)">
        <h3 className="text-lg leading-snug font-semibold">
          {headline ?? flag.seen}
        </h3>
        {headline && <p className="text-muted-foreground">{flag.seen}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {agents.map((a) => (
            <AgentChip key={a} agent={a} />
          ))}
          <ConfidenceBadge confidence={flag.confidence} />
          <PrecedentBadge
            precedent={flag.precedent}
            companyId={flag.companyId}
          />
        </div>
      </div>

      {children && <div className="px-(--card-spacing)">{children}</div>}

      <details
        open={detailsOpen}
        className="group/details mx-(--card-spacing) rounded-control bg-muted/60 px-4 py-3"
      >
        <summary className="cursor-pointer list-none text-sm font-medium text-link marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="group-open/details:hidden">See details</span>
          <span className="hidden group-open/details:inline">Hide details</span>
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Where</dt>
          <dd className="flex flex-wrap gap-1.5">
            {flag.where.map((w) => (
              <SourceChip
                key={`${w.system}-${w.recordId}`}
                system={w.system}
                recordId={w.recordId}
                url={w.url}
              />
            ))}
          </dd>
          <dt className="text-muted-foreground">Affects</dt>
          <dd>
            {[affectsLabel, flag.affects.workerId, flag.affects.jobId]
              .filter(Boolean)
              .join(" · ") || "Nothing on pay"}
            {dollars !== null && (
              <>
                {" · "}
                <Money cents={dollars} className="font-medium" />{" "}
                <span className="text-muted-foreground">
                  ({dataKind}, from {flag.where[0]?.system ?? "the workbook"})
                </span>
              </>
            )}
          </dd>
          <dt className="text-muted-foreground">Check</dt>
          <dd>
            {flag.checkId} · {checkTitle(flag.checkId)}
          </dd>
        </dl>
      </details>

      {(hasActions || link) && (
        <div className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
          {onApprove && (
            <Button onClick={onApprove} disabled={pending}>
              {approveLabel}
            </Button>
          )}
          {onEdit && (
            <Button variant="secondary" onClick={onEdit} disabled={pending}>
              Edit
            </Button>
          )}
          {onDeny && (
            <Button variant="quiet" onClick={onDeny} disabled={pending}>
              Deny
            </Button>
          )}
          {link && (
            <Link
              href={link}
              className="ml-auto text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              Open problem
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
