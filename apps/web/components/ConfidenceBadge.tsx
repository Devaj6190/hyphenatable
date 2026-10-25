import { Badge } from "@/components/ui/badge";

// "rule: certain" for deterministic hits; a percentage only where there is real uncertainty.
// Below 0.85 is amber (it becomes a question). At or above stays neutral: green is reserved for verified.
export function ConfidenceBadge({
  confidence,
}: {
  confidence: "certain" | number;
}) {
  if (confidence === "certain")
    return <Badge tone="neutral">rule: certain</Badge>;
  return (
    <Badge tone={confidence < 0.85 ? "hold" : "neutral"}>
      {Math.round(confidence * 100)}% sure
    </Badge>
  );
}
