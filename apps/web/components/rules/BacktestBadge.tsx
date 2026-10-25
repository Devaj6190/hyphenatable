import { Check, FlaskConical, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Rule } from "@/lib/rules";

// Counts only: Rule.backtest has no per-cycle list, so there is nothing to open on click.
export function BacktestBadge({ backtest }: { backtest: Rule["backtest"] }) {
  if (!backtest)
    return (
      <Badge tone="neutral" variant="outline">
        <FlaskConical aria-hidden />
        Not backtested yet
      </Badge>
    );
  const { cycles, agree, disagree } = backtest;
  if (!disagree)
    return (
      <Badge tone="neutral">
        <Check aria-hidden />
        Agrees with {agree} of {cycles} past cycles
      </Badge>
    );
  return (
    <Badge tone="hold">
      <TriangleAlert aria-hidden />
      Agrees {agree}, disagrees {disagree} of {cycles} past cycles
    </Badge>
  );
}
