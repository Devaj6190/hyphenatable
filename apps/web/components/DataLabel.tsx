import { Badge } from "@/components/ui/badge";

export type DataKind = "synthetic" | "real, anonymized";

/** Required on every page header and every Company R card. `detail` adds context, e.g. "Company A, cycle 2". */
export function DataLabel({
  kind,
  detail,
  className,
}: {
  kind: DataKind;
  detail?: string;
  className?: string;
}) {
  return (
    <Badge
      tone={kind === "synthetic" ? "neutral" : "brand"}
      variant={kind === "synthetic" ? "soft" : "outline"}
      className={className}
    >
      {kind}
      {detail && <span className="font-normal opacity-80">· {detail}</span>}
    </Badge>
  );
}
