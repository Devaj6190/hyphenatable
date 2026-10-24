import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ConfidenceBadge({
  confidence,
}: {
  confidence: "certain" | number;
}) {
  if (confidence === "certain") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-muted text-muted-foreground"
      >
        rule: certain
      </Badge>
    );
  }
  const low = confidence < 0.85;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        low ? "bg-hold-soft text-hold" : "bg-ok-soft text-ok",
      )}
    >
      {Math.round(confidence * 100)}%
    </Badge>
  );
}
