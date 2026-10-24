import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// On every message or reply produced by demo.simulatedReply, always (also in the video).
export function SimulatedChip({ className }: { className?: string }) {
  return (
    <Badge tone="error" variant="outline" className={className}>
      <FlaskConical aria-hidden />
      Simulated
    </Badge>
  );
}
