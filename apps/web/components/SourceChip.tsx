import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SourceSystem } from "@/lib/types";

export function SourceChip({
  system,
  recordId,
}: {
  system: SourceSystem;
  recordId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="secondary">{system}</Badge>} />
      <TooltipContent>{recordId}</TooltipContent>
    </Tooltip>
  );
}
