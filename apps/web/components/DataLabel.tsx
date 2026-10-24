import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DataKind = "synthetic" | "real, anonymized";

export function DataLabel({
  kind,
  className,
}: {
  kind: DataKind;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        kind === "synthetic"
          ? "border-transparent bg-muted text-muted-foreground"
          : "border-primary text-primary",
        className,
      )}
    >
      {kind}
    </Badge>
  );
}
