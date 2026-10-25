import { AgentChip } from "@/components/AgentChip";
import { formatWhen } from "@/lib/time";
import type { AuditEvent } from "@/lib/types";

// The Auditor's brief is an audit event of type "auditor.brief" whose data.text is the brief.
const BRIEF = "auditor.brief";

function briefText(e: AuditEvent): string | null {
  const t = (e.data as Record<string, unknown> | null)?.text;
  return typeof t === "string" && t.trim() ? t : null;
}

/** The newest auditor.brief event. Presentational; proposal only, nothing in it is applied. */
export function MorningBrief({
  events,
  timezone,
}: {
  events: AuditEvent[];
  timezone: string;
}) {
  const newest = events
    .filter((e) => e.type === BRIEF && briefText(e) !== null)
    .reduce<AuditEvent | null>((a, e) => (a && a.at >= e.at ? a : e), null);
  return (
    <section className="rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <AgentChip agent="auditor" />
        <span>From the Auditor (Creao), proposal only</span>
        {newest && <span>· {formatWhen(newest.at, timezone)}</span>}
      </div>
      {newest ? (
        <p className="whitespace-pre-line text-sm">{briefText(newest)}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No brief yet</p>
      )}
    </section>
  );
}
