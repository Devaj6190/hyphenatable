import { Check } from "lucide-react";
import { STAGES, stageIndex } from "@/lib/home";
import { cn } from "@/lib/utils";
import type { Cycle } from "@/lib/view-types";

// Where the cycle is, from Cycle.stage. The current step is navigation chrome (charcoal), never a
// status color: a finished step is not "verified", and gates are marked as the owner's approvals.
export function StageTracker({ stage }: { stage: Cycle["stage"] }) {
  const current = stage === "closed" ? STAGES.length : stageIndex[stage];
  const now = STAGES[Math.min(current, STAGES.length - 1)];
  const next = STAGES[current + 1];

  return (
    <div>
      {/* Phone: one line and a segmented bar. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          Step {Math.min(current + 1, STAGES.length)} of {STAGES.length}
        </p>
        <p className="text-lg font-semibold">
          {now.label}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {now.hint}
          </span>
        </p>
        <div className="flex gap-1" aria-hidden>
          {STAGES.map((s, i) => (
            <span
              key={s.label}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < current
                  ? "bg-muted-foreground/60"
                  : i === current
                    ? "bg-foreground"
                    : "bg-muted",
              )}
            />
          ))}
        </div>
        {next && (
          <p className="text-sm text-muted-foreground">
            Next: {next.label}
            {"gate" in next && " (you approve)"}
          </p>
        )}
      </div>

      {/* Desktop: the full track. */}
      <ol className="hidden grid-cols-8 md:grid" aria-label="Payroll stages">
        {STAGES.map((s, i) => {
          const done = i < current;
          const here = i === current;
          const gate = "gate" in s;
          return (
            <li
              key={s.label}
              aria-current={here ? "step" : undefined}
              className="relative flex flex-col items-center gap-2 px-1 text-center"
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-3.5 right-1/2 h-px w-full",
                    i <= current ? "bg-muted-foreground/60" : "bg-border",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-7 place-items-center border-2 bg-card",
                  gate ? "rotate-45 rounded-[7px]" : "rounded-full",
                  done && "border-muted-foreground/60 bg-muted",
                  here &&
                    "border-foreground bg-foreground text-background ring-4 ring-foreground/10",
                  !done && !here && "border-border",
                )}
              >
                <span className={cn(gate && "-rotate-45")}>
                  {done ? (
                    <Check className="size-3.5 text-muted-foreground" />
                  ) : here ? (
                    <span className="block size-2 rounded-full bg-background" />
                  ) : null}
                </span>
              </span>
              <span
                className={cn(
                  "text-sm leading-tight",
                  here ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {s.label}
                <span className="sr-only">
                  {done ? ", done" : here ? ", current step" : ", not started"}
                </span>
              </span>
              {(here || gate) && (
                <span
                  className={cn(
                    "text-xs leading-snug",
                    here ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {here ? s.hint : "You approve"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
