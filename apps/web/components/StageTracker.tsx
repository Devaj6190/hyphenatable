import { Check } from "lucide-react";
import { STAGES } from "@/lib/home";
import { cn } from "@/lib/utils";

// Where the payroll is: eight segments, done ones in navy ink, the current one with a flowing Sunset fill.
// The two halves are labelled by what they produce. Done is never green here: green means "done" on items only.
export function StageTracker({
  step,
  allDone = false,
  caption = "",
  fraction = 0,
}: {
  /** Index into STAGES; -1 before the run starts. */
  step: number;
  /** The cycle is finished: every segment done. */
  allDone?: boolean;
  /** Short status under the current step, e.g. "3 of 10 answered". */
  caption?: string;
  /** How far the current step is, 0 to 1. */
  fraction?: number;
}) {
  const now = STAGES[Math.max(0, Math.min(step, STAGES.length - 1))];
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-2 gap-4 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase md:grid">
        <span>Stage 1 · wages → regular draft</span>
        <span>Stage 2 · commissions → off-cycle</span>
      </div>
      {/* Phone: one line, then the bar. */}
      <p className="text-sm md:hidden">
        {step < 0 ? (
          <span className="text-muted-foreground">Not started</span>
        ) : allDone ? (
          <span className="font-semibold">All 8 steps done</span>
        ) : (
          <>
            <span className="text-muted-foreground">
              Step {step + 1} of {STAGES.length} ·{" "}
            </span>
            <span className="font-semibold text-link">{now.label}</span>
            {caption && (
              <span className="text-muted-foreground"> · {caption}</span>
            )}
          </>
        )}
      </p>
      <ol
        aria-label="Payroll stages"
        className="grid grid-cols-8 gap-1.5 md:gap-3"
      >
        {STAGES.map((s, i) => {
          const done = allDone || i < step;
          const here = !allDone && i === step;
          return (
            <li
              key={s.label}
              aria-current={here ? "step" : undefined}
              className="flex min-w-0 flex-col gap-2"
            >
              <span className="relative block h-2 overflow-hidden rounded-full bg-border">
                {done && <span className="absolute inset-0 bg-primary" />}
                {here && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-sunset-flow transition-[width] duration-(--dur-sheet) ease-out-soft"
                    style={{
                      width: `${Math.max(4, fraction * 100).toFixed(1)}%`,
                    }}
                  />
                )}
              </span>
              <span className="hidden min-w-0 items-center gap-1.5 md:flex">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full text-[10px]",
                    done && "bg-primary text-primary-foreground",
                    here && "bg-sunset-2 ring-4 ring-sunset-2/25",
                    !done &&
                      !here &&
                      "border-[1.5px] border-muted-foreground/35",
                  )}
                >
                  {done && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    "truncate text-[13px]",
                    here
                      ? "font-bold text-link"
                      : done
                        ? "font-semibold"
                        : "text-muted-foreground",
                  )}
                >
                  {s.label}
                  <span className="sr-only">
                    {done
                      ? ", done"
                      : here
                        ? ", current step"
                        : ", not started"}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "hidden min-h-3.5 truncate text-[11px] leading-tight md:block",
                  here ? "font-semibold text-link" : "text-muted-foreground",
                )}
              >
                {here
                  ? caption
                  : done
                    ? "Done"
                    : "gate" in s
                      ? "You approve"
                      : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
