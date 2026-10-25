"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { companies } from "@/lib/companies";
import { STAGES } from "@/lib/home";
import { routes } from "@/lib/routes";
import { useStageState } from "@/lib/stageStore";
import { cn } from "@/lib/utils";

// Compact 48px workflow track under the top bar, on every page. The home publishes its stage (StageSync); elsewhere
// the fixture cycle's stage shows. A stage is a link to the home, where that stage's view lives. Done segments are
// ink, the current one is the accent; no gradient.
export function Stepper() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = companies[companyId];
  const live = useStageState();
  const fromHome = live && live.companyId === companyId ? live : null;
  // Until the home has published a stage, the shell shows the track with nothing started: the company list
  // carries the cycle's dates, not its stage, and the stepper never guesses.
  const step = fromHome?.step ?? -1;
  const allDone = fromHome?.allDone ?? false;
  const fraction = fromHome?.fraction ?? 0;
  const caption = fromHome?.caption ?? "";
  const now = STAGES[Math.max(0, Math.min(step, STAGES.length - 1))];
  if (!company) return null;

  return (
    <nav
      aria-label="Payroll stages"
      className="flex h-12 shrink-0 items-center gap-4 border-b bg-background px-4 lg:px-6"
    >
      <span className="hidden shrink-0 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase xl:inline">
        Stage 1 · wages
      </span>
      <ol className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {STAGES.map((s, i) => {
          const done = allDone || i < step;
          const here = !allDone && i === step;
          return (
            <li key={s.label} className="flex min-w-0 flex-1 items-center">
              <Link
                href={routes.home(companyId)}
                aria-current={here ? "step" : undefined}
                title={s.hint}
                className={cn(
                  "group flex min-w-0 flex-1 flex-col gap-1 rounded-md px-1.5 py-1 transition-colors duration-(--dur-hover) hover:bg-muted",
                )}
              >
                <span className="relative block h-1 overflow-hidden rounded-full bg-border">
                  {done && <span className="absolute inset-0 bg-foreground" />}
                  {here && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-link transition-[width] duration-(--dur-sheet) ease-out-soft"
                      style={{
                        width: `${Math.max(8, fraction * 100).toFixed(1)}%`,
                      }}
                    />
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1 text-xs">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-3 shrink-0 place-items-center rounded-full",
                      done && "bg-foreground text-background",
                      here && "bg-link",
                      !done && !here && "border border-muted-foreground/40",
                    )}
                  >
                    {done && <Check className="size-2" strokeWidth={3} />}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      here
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </span>
              </Link>
              {i === 3 && (
                <span className="mx-2 hidden h-5 w-px shrink-0 bg-border xl:block" />
              )}
            </li>
          );
        })}
      </ol>
      <span className="hidden shrink-0 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase xl:inline">
        Stage 2 · commissions
      </span>
      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
        {step < 0
          ? "Not started"
          : allDone
            ? "All 8 steps done"
            : `${now.label}${caption ? ` · ${caption}` : ""}`}
      </span>
    </nav>
  );
}
