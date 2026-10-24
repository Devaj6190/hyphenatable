import { AgentChip } from "@/components/AgentChip";
import type { DataKind } from "@/components/DataLabel";
import { formatWhen } from "@/lib/time";
import type { FlagEvent } from "@/lib/types";

export function FlagTimeline({
  events,
  dataKind,
  timezone,
}: {
  events: FlagEvent[];
  dataKind: DataKind;
  timezone: string;
}) {
  if (events.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 text-muted-foreground">
            {formatWhen(e.at, timezone)}
          </span>
          <AgentChip actor={e.actor} />
          <span>{e.summary}</span>
          <span className="text-muted-foreground">({dataKind})</span>
        </li>
      ))}
    </ol>
  );
}
