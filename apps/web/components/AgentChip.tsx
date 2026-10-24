import { Badge } from "@/components/ui/badge";
import type { FlagEvent } from "@/lib/types";

const agentStyle = {
  analyst: "bg-ask-soft text-ask",
  auditor: "bg-hold-soft text-hold",
  messenger: "bg-ok-soft text-ok",
} as const;

const label = (actor: FlagEvent["actor"]) => {
  if (actor.agent) return actor.agent[0].toUpperCase() + actor.agent.slice(1);
  if (actor.kind === "user") return "Owner";
  return actor.id === "controller" ? "Controller" : "System";
};

export function AgentChip({ actor }: { actor: FlagEvent["actor"] }) {
  const cls = actor.agent
    ? agentStyle[actor.agent]
    : actor.kind === "user"
      ? "bg-foreground text-background"
      : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`border-transparent ${cls}`}>
      {label(actor)}
    </Badge>
  );
}
