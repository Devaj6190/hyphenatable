"use client";

import { ApprovalSheet } from "@/components/ApprovalSheet";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { WorkerThread } from "@/components/WorkerThread";
import {
  FIXTURE_SOURCE,
  fixtureFlags,
  fixtureQuestions,
  workerName,
} from "@/lib/fixtures";
import type { Flag } from "@/lib/types";

// Always rendered as the manager: viewerRole is fixed so no pay reaches these components, whoever is switched in.
export function ManagerInbox({
  companyId,
  dataKind,
}: {
  companyId: string;
  dataKind: DataKind;
}) {
  const crew = fixtureFlags.filter(
    (f) => f.companyId === companyId && f.routeTo === "manager",
  );
  const qOf = (f: Flag) => fixtureQuestions.find((q) => q.id === f.questionId);
  const needsOk = crew.filter((f) => qOf(f)?.status === "draft");
  const rest = crew.filter((f) => qOf(f)?.status !== "draft");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Source: {FIXTURE_SOURCE} · {dataKind}
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Needs your OK ({needsOk.length})
        </h2>
        {needsOk.length === 0 && <p>Nothing to approve right now.</p>}
        {needsOk.map((f) => {
          const q = qOf(f);
          return (
            <div key={f.id} className="flex flex-col gap-3">
              <FlagCard flag={f} dataKind={dataKind} viewerRole="manager" />
              {q && q.toRole === "employee" ? (
                <ApprovalSheet
                  question={q}
                  recipientName={workerName(q.toWorkerId)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The owner approves the text that reaches you.
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Waiting or answered ({rest.length})
        </h2>
        {rest.map((f) => {
          const q = qOf(f);
          return (
            <div key={f.id} className="flex flex-col gap-3">
              <FlagCard flag={f} dataKind={dataKind} viewerRole="manager" />
              {q && (
                <WorkerThread
                  questionId={q.id}
                  title="Replies"
                  dataKind={dataKind}
                />
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
