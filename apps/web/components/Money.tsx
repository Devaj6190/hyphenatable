import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

// Owner views only. Never pass cents into manager or employee components.
/** Integer cents → "$1,284.50". `signed` shows "+$344.25" / "−$344.25" for effects and diffs. */
export function Money({
  cents,
  signed = false,
  className,
}: {
  cents: number;
  signed?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {formatCents(cents, signed)}
    </span>
  );
}
