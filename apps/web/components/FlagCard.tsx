"use client";

import Link from "next/link";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { Money } from "@/components/Money";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { useRole } from "@/components/RoleProvider";
import { SourceChip } from "@/components/SourceChip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { checkTitle } from "@/lib/checks";
import { forViewer } from "@/lib/role";
import type { Flag, ViewerRole } from "@/lib/types";

const statusLabel: Record<Flag["status"], string> = {
  open: "needs an answer",
  asked: "asked",
  answered: "answered",
  corrected: "fixed",
  dismissed: "dismissed",
  held: "on hold",
};

export function FlagCard({
  flag: rawFlag,
  dataKind,
  viewerRole,
}: {
  flag: Flag;
  dataKind: DataKind;
  viewerRole?: ViewerRole;
}) {
  const { role } = useRole();
  // Strip pay before render so a manager view cannot show it, whatever the data source sent.
  const flag = forViewer(rawFlag, viewerRole ?? role);
  const dollars = flag.affects.dollarsCents;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">
            {checkTitle(flag.checkId)}
          </h3>
          <Badge
            variant="outline"
            className={
              flag.status === "asked"
                ? "border-transparent bg-ask-soft text-ask"
                : flag.status === "held"
                  ? "border-transparent bg-hold-soft text-hold"
                  : ""
            }
          >
            {statusLabel[flag.status]}
          </Badge>
          <DataLabel kind={dataKind} className="ml-auto" />
        </div>
        <p>{flag.seen}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge confidence={flag.confidence} />
          <PrecedentBadge
            precedent={flag.precedent}
            companyId={flag.companyId}
          />
          {flag.where.map((w) => (
            <SourceChip
              key={`${w.system}-${w.recordId}`}
              system={w.system}
              recordId={w.recordId}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Goes to {flag.routeTo === "none" ? "no one" : `the ${flag.routeTo}`}
            {dollars !== null && (
              <>
                {" · affects "}
                <Money cents={dollars} className="text-foreground" />
                {` (${dataKind})`}
              </>
            )}
          </span>
          <Link
            href={`/c/${flag.companyId}/flags/${flag.id}`}
            className="font-medium text-primary hover:underline"
          >
            Details
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
