"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ApprovalSheet } from "@/components/ApprovalSheet";
import { CorrectionDiff } from "@/components/CorrectionDiff";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { FlagTimeline, type TimelineStep } from "@/components/FlagTimeline";
import { JobberRecheck } from "@/components/JobberRecheck";
import { PageHeader } from "@/components/PageHeader";
import { useRole } from "@/components/RoleProvider";
import { Card } from "@/components/ui/card";
import { checkTitle } from "@/lib/checks";
import { forViewer } from "@/lib/role";
import { FIXTURE_SOURCE } from "@/lib/sources";
import type { FlagEvent, ViewerRole } from "@/lib/types";
import type { FlagDetailData } from "@/lib/view-types";

const linkClass =
  "inline-flex items-center gap-1.5 rounded-sm font-medium text-link underline-offset-4 hover:underline";

// Board 7. One flag: what we saw (FlagCard, full width), the one proposed action (a correction, else the text),
// the Jobber re-check, and the item's audit trail beside it. `data` is what the server decided this viewer may
// see: null for a flag that is missing or not theirs. `flagIds` are the viewer's flags, for "Problem N of M".
export function FlagDetail({
  companyId,
  data,
  flagIds,
  dataKind,
  timezone,
  viewerRole,
}: {
  companyId: string;
  data: FlagDetailData | null;
  flagIds: string[];
  dataKind: DataKind;
  timezone: string;
  viewerRole?: ViewerRole;
}) {
  const { role } = useRole();
  const viewer = viewerRole ?? role;
  // Fixture mode: decisions made here are appended to the timeline locally and marked "not saved".
  const [local, setLocal] = useState<FlagEvent[]>([]);
  const [decided, setDecided] = useState(false);
  const [marked, setMarked] = useState(false);

  const home = (
    <Link href={`/c/${companyId}`} className={`${linkClass} text-sm`}>
      <ArrowLeft aria-hidden className="size-4" />
      Home
    </Link>
  );
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {home}
        <p>We can’t find that item.</p>
      </div>
    );
  }

  // The server already removed pay for a manager; this only covers the moment after an owner switches role.
  const flag = forViewer(data.flag, viewer);
  const { question, correction } = data;
  const index = flagIds.indexOf(flag.id);
  const next = index >= 0 ? flagIds[index + 1] : undefined;
  const events = [...data.events, ...local];
  const agents = [
    ...new Set(events.flatMap((e) => (e.actor.agent ? [e.actor.agent] : []))),
  ];
  const jobberIds = flag.where
    .filter((w) => w.system === "Jobber")
    .map((w) => w.recordId);
  const canDecideText = viewer === "owner" || question?.toRole === "employee";

  const record = (summary: string, type: string) =>
    setLocal((l) => [
      ...l,
      {
        id: `local-${l.length + 1}`,
        flagId: flag.id,
        at: new Date().toISOString(),
        actor: { kind: "user", id: "you", agent: null },
        type,
        summary,
      },
    ]);

  let now: TimelineStep | null = null;
  if (!decided && correction?.status === "proposed")
    now =
      viewer === "owner"
        ? { who: "You", when: "Now", text: "Approve or deny the correction." }
        : {
            who: "Owner",
            when: "Now",
            text: "The owner reviews the correction.",
          };
  else if (!decided && question?.status === "draft")
    now = canDecideText
      ? { who: "You", when: "Now", text: "Approve, edit or deny the text." }
      : { who: "Owner", when: "Now", text: "The owner reviews the text." };
  const nextStep: TimelineStep | null =
    jobberIds.length > 0
      ? {
          who: "Next sync",
          when: "Next Jobber sync",
          text: marked
            ? `Re-checks ${jobberIds.join(" and ")} in Jobber.`
            : "Re-checks Jobber once you mark it fixed there.",
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Problems"
        className="-mb-2 flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        {home}
        <span className="flex items-center gap-4">
          {index >= 0 && (
            <span className="text-muted-foreground tabular-nums">
              Problem {index + 1} of {flagIds.length}
            </span>
          )}
          {next && (
            <Link href={`/c/${companyId}/flags/${next}`} className={linkClass}>
              Next problem
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </span>
      </nav>

      <PageHeader title={checkTitle(flag.checkId)} />

      <div className="-mt-6">
        <FlagCard
          flag={flag}
          dataKind={dataKind}
          viewerRole={viewer}
          affectsLabel={
            flag.subject.expenseIds.length > 0 ? "Job cost" : "Wages"
          }
          agents={agents}
          detailsOpen
          href={null}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {correction && (
            <CorrectionDiff
              correction={correction}
              dataKind={dataKind}
              viewerRole={viewer}
              onDecided={(s) => {
                setDecided(true);
                record(s, "correction.decided");
              }}
            />
          )}
          {question ? (
            <ApprovalSheet
              key={question.id}
              question={question}
              recipientName={data.recipientName ?? undefined}
              thread={data.thread?.messages}
              canDecide={canDecideText}
              onDecided={(s) => {
                setDecided(true);
                record(s, "message.decided");
              }}
            />
          ) : (
            !correction && (
              <p className="text-sm text-muted-foreground">
                No text is needed for this one.
              </p>
            )
          )}
          {jobberIds.length > 0 && (
            <JobberRecheck
              recordIds={jobberIds}
              checkId={flag.checkId}
              timeZone={timezone}
              onMarked={(m) => {
                setMarked(m);
                record(
                  m
                    ? `Marked ${jobberIds.join(" and ")} fixed in Jobber.`
                    : "Undid “marked fixed in Jobber”.",
                  "flag.markedFixed",
                );
              }}
            />
          )}
        </div>

        <Card size="sm" className="xl:sticky xl:top-6">
          <div className="flex items-center justify-between gap-2 px-(--card-spacing)">
            <h2 className="text-base font-semibold">What happened</h2>
            <Link
              href={`/c/${companyId}/audit`}
              className={`${linkClass} text-sm`}
            >
              Audit log
            </Link>
          </div>
          <div className="px-(--card-spacing)">
            <FlagTimeline
              events={events}
              timezone={timezone}
              now={now}
              next={nextStep}
              unsavedIds={local.map((e) => e.id)}
            />
          </div>
        </Card>
      </div>

      <footer className="flex flex-col gap-1 border-t pt-4 text-sm text-muted-foreground">
        <p>
          Only this item is held. PayrollPilot changes the workbook, never your
          Jobber, QuickBooks or Gusto records.
        </p>
        <p className="text-xs">
          Source: {FIXTURE_SOURCE} · {dataKind}
        </p>
      </footer>
    </div>
  );
}
