import { AgentChip, agentFromActor } from "@/components/AgentChip";
import type { DataKind } from "@/components/DataLabel";
import type { FlagEvent } from "@/lib/types";

const when = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

export function FlagTimeline({
  events,
  dataKind,
}: {
  events: FlagEvent[];
  dataKind: DataKind;
}) {
  if (events.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 text-muted-foreground">
            {when.format(new Date(e.at))}
          </span>
          <AgentChip agent={agentFromActor(e.actor)} />
          <span>{e.summary}</span>
          <span className="text-muted-foreground">({dataKind})</span>
        </li>
      ))}
    </ol>
  );
}
