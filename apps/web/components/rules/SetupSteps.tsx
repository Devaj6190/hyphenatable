import { Check, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

import type { RulesViewData } from "@/lib/view-types";

/** Shannin's setup checklist, as an eyebrow above the onboarding title. Connected = a sync run is on record. */
export function SetupSteps({
  connected,
}: {
  connected: RulesViewData["connected"];
}) {
  const steps = [
    { label: "Connect Jobber", done: connected.jobber },
    { label: "Connect QuickBooks", done: connected.qbo },
    { label: "Connect Gusto", done: connected.gusto },
    { label: "Check your rules", done: false },
    { label: "Add your job manager", done: false },
  ];
  const nowIndex = steps.findIndex((s) => !s.done);
  return (
    <ol className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {steps.map(({ label: s, done }, i) => {
        const now = i === nowIndex;
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
