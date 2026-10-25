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
  const toggle = (on: boolean) =>
    cn(on && "border-sunset-2 bg-accent text-link");
  return (
    <div
      role="toolbar"
      aria-label="Demo controls"
      className="flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed bg-card/70 px-3 py-2 text-sm"
    >
      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
        Demo mode
      </span>
      <span className="text-muted-foreground">
        Stage: <b className="text-foreground">{stageName}</b>
      </span>
      <span className="ml-auto flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={onBack}>
          ‹ Back
        </Button>
        <Button size="sm" variant="secondary" onClick={onNext}>
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
        <Button size="sm" variant="quiet" onClick={onReset}>
          Reset
        </Button>
      </span>
    </div>
  );
}
