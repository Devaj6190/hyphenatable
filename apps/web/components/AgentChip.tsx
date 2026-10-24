import { Badge } from "@/components/ui/badge";
import type { FlagEvent } from "@/lib/types";

const agentStyle = {
  analyst: "bg-ask-soft text-ask",
  auditor: "bg-hold-soft text-hold",
  messenger: "bg-ok-soft text-ok",
} as const;

const label = (actor: FlagEvent["actor"]) => {
  if (actor.id.startsWith("persona:")) return "Simulated manager";
  if (actor.agent) return actor.agent[0].toUpperCase() + actor.agent.slice(1);
  if (actor.kind === "user") return "Owner";
  if (actor.id === "controller") return "Controller";
  if (actor.id === "courier") return "Courier";
  return "System";
};

export function AgentChip({ actor }: { actor: FlagEvent["actor"] }) {
  const cls = actor.id.startsWith("persona:")
    ? "border-destructive text-destructive"
    : actor.agent
      ? agentStyle[actor.agent]
      : actor.kind === "user"
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground";
  return (
    <Badge
      variant="outline"
      className={
        actor.id.startsWith("persona:") ? cls : `border-transparent ${cls}`
      }
    >
      {label(actor)}
    </Badge>
  );
}
