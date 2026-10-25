import { Badge } from "@/components/ui/badge";
import type { FlagEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgentKind =
  | "analyst"
  | "auditor"
  | "messenger"
  | "controller"
  | "courier"
  | "system"
  | "simulated"
  | "you"
  | "owner"
  | "manager";

const style: Record<AgentKind, string> = {
  analyst: "bg-agent-analyst-soft text-agent-analyst",
  auditor: "bg-agent-auditor-soft text-agent-auditor",
  messenger: "bg-agent-messenger-soft text-agent-messenger",
  controller: "bg-muted text-neutral-chip",
  courier: "bg-muted text-neutral-chip",
  system: "bg-muted text-neutral-chip",
  simulated: "border-destructive bg-transparent text-destructive",
  you: "bg-foreground text-background",
  owner: "bg-foreground text-background",
  manager: "bg-foreground text-background",
};

const word: Partial<Record<AgentKind, string>> = {
  simulated: "Simulated manager",
};

// AuditEvent.actor → chip kind. The demo persona is always labelled simulated.
export function agentFromActor(actor: FlagEvent["actor"]): AgentKind {
  if (actor.id.startsWith("persona:")) return "simulated";
  if (actor.agent) return actor.agent;
  if (actor.kind === "user") return "owner";
  if (actor.id === "controller") return "controller";
  if (actor.id === "courier") return "courier";
  return "system";
}

/** Pass `agent` (with an optional `label`, e.g. "Manager · W12"), or an AuditEvent `actor`. */
export function AgentChip(
  props:
    | { agent: AgentKind; label?: string; className?: string }
    | { actor: FlagEvent["actor"]; label?: string; className?: string },
) {
  const agent = "agent" in props ? props.agent : agentFromActor(props.actor);
  return (
    <Badge className={cn(style[agent], props.className)}>
      {props.label ?? word[agent] ?? agent[0].toUpperCase() + agent.slice(1)}
    </Badge>
  );
}
