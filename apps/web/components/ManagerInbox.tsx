import { ApprovalSheet } from "@/components/ApprovalSheet";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { WorkerThread } from "@/components/WorkerThread";
import { FIXTURE_SOURCE } from "@/lib/sources";
import type { InboxItem, ManagerInboxData } from "@/lib/view-types";

// Rendered from data the server built for the manager, so no pay is in the props. viewerRole is fixed to
// manager as well, so a switched-in owner still sees the manager's version of this page.
export function ManagerInbox({
  data,
  dataKind,
  timezone,
}: {
  data: ManagerInboxData;
  dataKind: DataKind;
  timezone: string;
}) {
  const card = (i: InboxItem) => (
    <FlagCard flag={i.flag} dataKind={dataKind} viewerRole="manager" />
  );
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Source: {FIXTURE_SOURCE} · {dataKind}
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Needs your OK ({data.needsOk.length})
        </h2>
        {data.needsOk.length === 0 && <p>Nothing to approve right now.</p>}
        {data.needsOk.map((i) => (
          <div key={i.flag.id} className="flex flex-col gap-3">
            {card(i)}
            {i.question && i.question.toRole === "employee" ? (
              <ApprovalSheet
                question={i.question}
                recipientName={i.recipientName ?? undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                The owner approves the text that reaches you.
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Waiting or answered ({data.rest.length})
        </h2>
        {data.rest.map((i) => (
          <div key={i.flag.id} className="flex flex-col gap-3">
            {card(i)}
            {i.thread && (
              <WorkerThread
                thread={i.thread}
                title="Replies"
                dataKind={dataKind}
                timezone={timezone}
              />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
