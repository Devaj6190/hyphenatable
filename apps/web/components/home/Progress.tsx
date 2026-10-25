"use client";

import { useEffect } from "react";
import { STAGES } from "@/lib/home";
import { stageStore } from "@/lib/stageStore";
import { cn } from "@/lib/utils";

// The home's stage track (prototype "seg"): eight thin segments, done ones ink, the current one filling in the accent,
// with "Step 3 of 8 · Asking" under it. It also publishes the stage and the open count, so the nav can badge Home.
export function Progress({
  companyId,
  step,
  allDone = false,
  caption = "",
  fraction = 0,
  open = 0,
}: {
  companyId: string;
  /** Index into STAGES; -1 before the run starts. */
  step: number;
  allDone?: boolean;
  caption?: string;
  fraction?: number;
  /** Items still waiting on the owner. */
  open?: number;
}) {
  useEffect(() => {
    stageStore.set({ companyId, step, allDone, caption, fraction, open });
  }, [companyId, step, allDone, caption, fraction, open]);

  const now = STAGES[Math.max(0, Math.min(step, STAGES.length - 1))];
  const label =
    step < 0
      ? "Not started"
      : allDone
        ? `All ${STAGES.length} steps done`
        : `Step ${step + 1} of ${STAGES.length} · ${now.label}${caption ? ` · ${caption}` : ""}`;

  return (
    <div className="flex flex-col gap-2.5">
      <ol
        aria-label="Payroll stages"
        className="grid grid-cols-8 gap-1"
        title={STAGES.map((s) => s.label).join(" → ")}
      >
        {STAGES.map((s, i) => {
          const done = allDone || i < step;
          const here = !allDone && i === step;
          return (
            <li
              key={s.label}
              aria-current={here ? "step" : undefined}
              className="h-1 overflow-hidden rounded-[2px] bg-border"
            >
              <span className="sr-only">
                {s.label}: {done ? "done" : here ? "now" : "not yet"}
              </span>
              <span
                aria-hidden
                className={cn(
                  "block h-full rounded-[2px] transition-[width] duration-1000 ease-out-soft",
                  here ? "bg-sunset-2" : "bg-foreground",
                )}
                style={{
                  width: done
                    ? "100%"
                    : here
                      ? `${Math.max(8, fraction * 100).toFixed(1)}%`
                      : "0%",
                }}
              />
            </li>
          );
        })}
      </ol>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </div>
  );
}
