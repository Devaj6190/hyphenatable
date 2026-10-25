import { AgentChip } from "@/components/AgentChip";
import { type HandoffCounts, handoffCounts } from "@/lib/audit";
import type { AuditEvent } from "@/lib/types";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function Node({
  agent,
  title,
  children,
}: {
  agent: "controller" | "auditor" | "messenger" | "analyst" | "owner";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-control border border-border bg-card p-3">
      <AgentChip agent={agent} label={title} />
      <p className="text-sm text-muted-foreground">{children}</p>
    </li>
  );
}

const Line = () => <div aria-hidden className="mx-auto h-4 w-px bg-border" />;

/** The controller (code) starts the agents; the owner or manager approves what they propose. Counts come from
 * the audit events passed in (actor.kind === "agent"), the same ones the log below shows. */
export function AgentOrgChart({ events }: { events: readonly AuditEvent[] }) {
  const c: HandoffCounts = handoffCounts(events);
  return (
    <section aria-label="Agent hand-offs" className="mb-6">
      <ol className="list-none">
        <Node agent="controller">
          Plain code starts every run and owns state, approvals and money.
          Agents never start each other.
        </Node>
      </ol>
      <Line />
      <ol className="flex list-none flex-col gap-2 sm:flex-row">
        <Node agent="auditor">
          Flagged {c.auditor.flagged}, routed {c.auditor.routed} to Messenger
        </Node>
        <Node agent="messenger">
          Drafted {plural(c.messenger.drafted, "question")}, read{" "}
          {plural(c.messenger.read, "reply", "replies")}
        </Node>
        <Node agent="analyst">
          Proposed {plural(c.analyst.proposed, "rule")}
        </Node>
      </ol>
      <Line />
      <ol className="list-none">
        <Node agent="owner" title="Owner or manager">
          Approves every text, correction and rule before anything happens.
        </Node>
      </ol>
    </section>
  );
}
