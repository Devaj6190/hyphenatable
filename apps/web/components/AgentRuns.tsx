import { AgentChip } from "@/components/AgentChip";
import { Badge } from "@/components/ui/badge";
import type { AgentRunRow, CreaoAgent, CreaoRunStatus } from "@/lib/agents";
import { formatWhen } from "@/lib/time";

const statusView: Record<
  CreaoRunStatus,
  { label: string; tone: "neutral" | "brand" | "ok" | "error" | "hold" }
> = {
  starting: { label: "Starting", tone: "neutral" },
  pending: { label: "Pending", tone: "neutral" },
  running: { label: "Running", tone: "brand" },
  completed: { label: "Completed", tone: "ok" },
  failed: { label: "Failed", tone: "error" },
  cancelled: { label: "Cancelled", tone: "hold" },
};

const order: CreaoAgent[] = ["auditor", "messenger", "analyst"];

/** The newest run per agent, in org-chart order. Agents with no run yet are left out. */
function latestPerAgent(runs: AgentRunRow[]): AgentRunRow[] {
  const newest = new Map<CreaoAgent, AgentRunRow>();
  for (const r of runs) {
    const cur = newest.get(r.agent);
    if (!cur || r.startedAt > cur.startedAt) newest.set(r.agent, r);
  }
  return order.flatMap((a) => newest.get(a) ?? []);
}

/** One row per agent: its newest run. Presentational; the caller passes the rows and the company timezone. */
export function AgentRuns({
  runs,
  timezone,
}: {
  runs: AgentRunRow[];
  timezone: string;
}) {
  const rows = latestPerAgent(runs);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No agent runs yet</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((r) => {
        const s = statusView[r.status];
        return (
          <li
            key={r.agent}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
          >
            <AgentChip agent={r.agent} />
            <Badge tone={s.tone}>{s.label}</Badge>
            <span className="text-muted-foreground">
              Started {formatWhen(r.startedAt, timezone)}
              {r.finishedAt
                ? ` · Finished ${formatWhen(r.finishedAt, timezone)}`
                : ""}
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {r.credits === null ? "Credits: pending" : `${r.credits} credits`}
            </span>
            {r.error && (
              <span className="basis-full text-destructive">{r.error}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
