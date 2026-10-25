"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** `done: null` means the step has nothing to finish, so visiting it counts. */
export type SetupStep = { title: string; sub: string; done: boolean | null };

/** Guided setup rail (mockup OnboardingV3): done steps get a check, the current one the Sunset dot. */
export function SetupSteps({
  steps,
  current,
  onSelect,
}: {
  steps: SetupStep[];
  current: number;
  onSelect: (i: number) => void;
}) {
  const last = steps.length - 1;
  const pct = Math.round((current / last) * 100);
  return (
    <nav aria-label="Setup steps" className="flex flex-col gap-1">
      <div className="mb-3 flex flex-col gap-2 px-2.5">
        <span className="text-[11px] font-bold tracking-wider text-muted-foreground">
          SET UP ROLLPAY
        </span>
        <span className="text-sm font-semibold">
          {pct}% done · step {Math.min(current, last - 1)} of {last - 1}
        </span>
        <span
          aria-hidden
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="block h-full rounded-full bg-sunset transition-[width] duration-(--dur-archive) ease-out-soft"
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>
      <ol className="flex flex-col gap-0.5">
        {steps.map((s, i) => {
          const cur = i === current;
          const done = s.done ?? i < current;
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={cur ? "step" : undefined}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  cur ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6.5 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                    cur
                      ? "bg-sunset text-sunset-ink ring-4 ring-sunset-2/20"
                      : done
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground ring-[1.5px] ring-border ring-inset",
                  )}
                >
                  {done && !cur ? <Check className="size-3.5" /> : i}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "truncate text-sm",
                      cur
                        ? "font-extrabold text-link"
                        : done
                          ? "font-semibold"
                          : "font-medium text-muted-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {s.sub}
                  </span>
                </span>
                {done && !cur && <span className="sr-only">(done)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
