import { Check, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Connect Jobber",
  "Connect QuickBooks",
  "Connect Gusto",
  "Check your rules",
  "Add your job manager",
];

/** Shannin's setup checklist, as an eyebrow above the onboarding title. */
export function SetupSteps() {
  return (
    <ol className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {STEPS.map((s, i) => {
        // Company A's syncRuns.json has runs from all three sources.
        const done = i < 3;
        const now = i === 3;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5",
              now ? "font-semibold" : "text-muted-foreground",
            )}
          >
            {done ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <CircleDot
                aria-hidden
                className={cn("size-4", now && "text-link")}
              />
            )}
            {s}
            {done && <span className="sr-only">(done)</span>}
          </li>
        );
      })}
    </ol>
  );
}
