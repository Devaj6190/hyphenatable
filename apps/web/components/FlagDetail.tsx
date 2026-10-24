"use client";

import Link from "next/link";
import { useState } from "react";
import { ApprovalSheet } from "@/components/ApprovalSheet";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { FlagTimeline } from "@/components/FlagTimeline";
import { Money } from "@/components/Money";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { useRole } from "@/components/RoleProvider";
import { SourceChip } from "@/components/SourceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkerThread } from "@/components/WorkerThread";
import { checkTitle } from "@/lib/checks";
import {
  FIXTURE_SOURCE,
  fixtureEvents,
  fixtureFlags,
  fixtureQuestions,
  workerName,
} from "@/lib/fixtures";
import { forViewer } from "@/lib/role";
import type { ViewerRole } from "@/lib/types";

export function FlagDetail({
  companyId,
  flagId,
  dataKind,
  viewerRole,
}: {
  companyId: string;
  flagId: string;
  dataKind: DataKind;
  viewerRole?: ViewerRole;
}) {
  const [markedFixed, setMarkedFixed] = useState(false);
  const { role } = useRole();
  const viewer = viewerRole ?? role;
  const found = fixtureFlags.find(
    (f) => f.id === flagId && f.companyId === companyId,
  );
  const back = (
    <Link
      href={`/c/${companyId}`}
      className="text-sm font-medium text-primary hover:underline"
    >
      ← Back to what we need from you
    </Link>
  );
  if (!found) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <p>We can’t find that item.</p>
      </div>
    );
  }
  const flag = forViewer(found, viewer);
  const question = fixtureQuestions.find((q) => q.id === flag.questionId);
  const events = fixtureEvents
    .filter((e) => e.flagId === flag.id)
    .sort((a, b) => a.at.localeCompare(b.at));
  const dollars = flag.affects.dollarsCents;
  const hasJobber = flag.where.some((w) => w.system === "Jobber");

  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{checkTitle(flag.checkId)}</h1>
          <DataLabel kind={dataKind} />
        </div>
        <p>{flag.seen}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge confidence={flag.confidence} />
          <PrecedentBadge precedent={flag.precedent} companyId={companyId} />
        </div>
        <p className="text-sm text-muted-foreground">
          Source: {FIXTURE_SOURCE} · {dataKind}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Where we saw it</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {flag.where.map((w) => (
              <li
                key={`${w.system}-${w.recordId}`}
                className="flex items-center gap-2"
              >
                <SourceChip system={w.system} recordId={w.recordId} />
                <span className="text-muted-foreground">
                  record {w.recordId}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Goes to {flag.routeTo === "none" ? "no one" : `the ${flag.routeTo}`}
            {dollars !== null && (
              <>
                {" · affects "}
                <Money cents={dollars} className="text-foreground" />
                {` (${dataKind}, from ${[...new Set(flag.where.map((w) => w.system))].join(" and ")} records)`}
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {question ? (
        <ApprovalSheet
          key={question.id}
          question={question}
          recipientName={
            question.toRole === "employee"
              ? workerName(question.toWorkerId)
              : undefined
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No text is needed for this one.
        </p>
      )}

      {question && (
        <WorkerThread
          questionId={question.id}
          title="Replies"
          dataKind={dataKind}
        />
      )}

      {hasJobber && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={markedFixed}
            onClick={() => setMarkedFixed(true)}
          >
            Mark fixed in Jobber
          </Button>
          {markedFixed && (
            <span className="text-sm text-muted-foreground">
              Noted. We’ll re-check on the next sync. (Fixture mode: not saved.)
            </span>
          )}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">What happened so far</h2>
          <FlagTimeline events={events} dataKind={dataKind} />
        </CardContent>
      </Card>
    </div>
  );
}
