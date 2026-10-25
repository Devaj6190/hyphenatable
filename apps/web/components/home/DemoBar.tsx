"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// DEMO_MODE only: step the board through every stage, and show the PR 8 states on demand.
export function DemoBar({
  stageName,
  onBack,
  onNext,
  onReset,
  sync,
  onSync,
  gustoDown,
  onGusto,
  nextOn,
  onNextPayroll,
}: {
  stageName: string;
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
  sync: boolean;
  onSync: () => void;
  gustoDown: boolean;
  onGusto: () => void;
  nextOn: boolean;
  onNextPayroll: () => void;
}) {
  // Phone: one compact, horizontally scrolling row of 32 px controls (demo-only, so it stays out of the way).
  const compact = "max-sm:h-8";
  const toggle = (on: boolean) =>
    cn(compact, on && "border-sunset-2 bg-accent text-link");
  return (
    <div
      role="toolbar"
      aria-label="Demo controls"
      data-compact
      className="flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed bg-card/70 px-3 py-2 text-sm max-sm:gap-1.5 max-sm:text-xs"
    >
      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
        Demo mode
      </span>
      <span className="text-muted-foreground">
        Stage: <b className="text-foreground">{stageName}</b>
      </span>
      <span className="ml-auto flex flex-wrap gap-1.5 max-sm:-mx-3 max-sm:w-[calc(100%+1.5rem)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-3 max-sm:[scrollbar-width:none]">
        <Button
          size="sm"
          variant="secondary"
          className={compact}
          onClick={onBack}
        >
          ‹ Back
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={compact}
          onClick={onNext}
        >
          Next stage ›
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={toggle(sync)}
          aria-pressed={sync}
          onClick={onSync}
        >
          Sync incomplete
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={toggle(gustoDown)}
          aria-pressed={gustoDown}
          onClick={onGusto}
        >
          Gusto disconnected
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={toggle(nextOn)}
          aria-pressed={nextOn}
          onClick={onNextPayroll}
        >
          Next payroll
        </Button>
        <Button size="sm" variant="quiet" className={compact} onClick={onReset}>
          Reset
        </Button>
      </span>
    </div>
  );
}
