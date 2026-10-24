import { Badge } from "@/components/ui/badge";
import type { FlagEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgentKind =
  | "analyst"
  | "auditor"
  | "messenger"
  | "controller"
  | "you"
  | "owner"
  | "manager";

const style: Record<AgentKind, string> = {
  analyst: "bg-agent-analyst-soft text-agent-analyst",
  auditor: "bg-agent-auditor-soft text-agent-auditor",
  messenger: "bg-agent-messenger-soft text-agent-messenger",
  controller: "bg-muted text-neutral-chip",
  you: "bg-foreground text-background",
  owner: "bg-foreground text-background",
  manager: "bg-foreground text-background",
};

/** `label` overrides the default word, e.g. "Manager · W12" (ids or fake names only). */
export function AgentChip({
  agent,
  label,
  className,
}: {
  agent: AgentKind;
  label?: string;
  className?: string;
}) {
  return (
    <Badge className={cn(style[agent], className)}>
      {label ?? agent[0].toUpperCase() + agent.slice(1)}
    </Badge>
  );
}

// AuditEvent.actor → chip kind. A user is "You" on the owner's own screens.
export function agentFromActor(actor: FlagEvent["actor"]): AgentKind {
  if (actor.agent) return actor.agent;
  if (actor.kind === "user") return "you";
  return "controller";
}
