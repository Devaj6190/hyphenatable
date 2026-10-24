"use client";

import { CircleDot, CircleMinus } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Money } from "@/components/Money";
import { cn } from "@/lib/utils";
import { type CycleWorkbook, periodLabel } from "./data";

// The signature interaction (design-style-handoff.md, "cycle archive rack"): payroll cycles stand as sleeves in a
// shallow rack. Selecting one parts its neighbours and brings it forward onto a flat, readable plane with its
// summary. Plain CSS transitions on transform and grid tracks, so an interrupted move continues from where it is.
// Tabs with manual activation: arrows move focus, Enter or Space opens. Phone: a flat scroll row, no perspective.
// Reduced motion: no travel or rearrangement, colours fade (--dur-archive drops to 120ms).

export function CycleArchive({
  cycles,
  selectedId,
  onSelect,
  timeZone,
  panelId,
}: {
  cycles: CycleWorkbook[];
  selectedId: string;
  onSelect: (cycleId: string) => void;
  timeZone: string;
  /** Id of the workbook panel the sleeves control. */
  panelId: string;
}) {
  const selected = Math.max(
    0,
    cycles.findIndex((c) => c.cycle.id === selectedId),
  );
  const [focus, setFocus] = useState(selected);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Phone: the row scrolls, so keep the selected sleeve in view (horizontal only, never the page).
  useEffect(() => {
    const list = listRef.current;
    const el = refs.current[selected];
    if (list && el && list.scrollWidth > list.clientWidth)
      list.scrollLeft = el.offsetLeft - 16;
  }, [selected]);

  const move = (to: number) => {
    const i = (to + cycles.length) % cycles.length;
    setFocus(i);
    refs.current[i]?.focus();
    refs.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const next = {
      ArrowRight: focus + 1,
      ArrowLeft: focus - 1,
      Home: 0,
      End: cycles.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    move(next);
  };

  return (
    <section
      aria-labelledby="cycle-archive-title"
      className="grain overflow-hidden rounded-card border bg-accent/60 dark:bg-accent/45"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3 sm:px-5">
        <h2 id="cycle-archive-title" className="text-sm font-semibold">
          Payroll cycles
        </h2>
        <p className="text-xs text-muted-foreground">
          <span className="max-sm:hidden">
            Arrow keys to browse, Enter to open.{" "}
          </span>
          {cycles.length} cycles, oldest first
        </p>
      </div>

      <div className="relative">
        <div
          ref={listRef}
          role="tablist"
          aria-label="Payroll cycles"
          onKeyDown={onKeyDown}
          className={cn(
            // Phone: a flat row that scrolls, about two sleeves wide.
            "flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pt-5 pb-5 [scrollbar-width:none]",
            // Wider: the rack. Grid tracks widen the selected sleeve, which parts its neighbours.
            "sm:grid sm:h-[212px] sm:snap-none sm:items-end sm:gap-3 sm:overflow-visible sm:px-5 sm:pb-6 sm:[perspective:1200px] sm:[perspective-origin:50%_0%]",
            "sm:transition-[grid-template-columns] sm:duration-(--dur-archive) sm:ease-out-soft motion-reduce:transition-none",
          )}
          style={{
            gridTemplateColumns: cycles
              .map((_, i) => (i === selected ? "1.9fr" : "1fr"))
              .join(" "),
          }}
        >
          {cycles.map((wb, i) => (
            <Sleeve
              key={wb.cycle.id}
              wb={wb}
              timeZone={timeZone}
              panelId={panelId}
              selected={i === selected}
              offset={i - selected}
              tabIndex={i === focus ? 0 : -1}
              buttonRef={(el) => {
                refs.current[i] = el;
              }}
              onFocus={() => setFocus(i)}
              onSelect={() => onSelect(wb.cycle.id)}
            />
          ))}
        </div>
        {/* Frosted front rail of the rack, over the sleeves' feet. */}
        <div
          aria-hidden
          className="frosted pointer-events-none absolute inset-x-0 bottom-0 hidden h-5 border-t border-white/40 sm:block dark:border-white/5"
        />
      </div>
    </section>
  );
}

function Sleeve({
  wb,
  timeZone,
  panelId,
  selected,
  offset,
  tabIndex,
  buttonRef,
  onFocus,
  onSelect,
}: {
  wb: CycleWorkbook;
  timeZone: string;
  panelId: string;
  selected: boolean;
  /** Position relative to the selected sleeve: neighbours part away from it. */
  offset: number;
  tabIndex: number;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onSelect: () => void;
}) {
  const closed = wb.basis === "paid";
  // Nearest neighbours part the most; the selected sleeve advances and stands up straight.
  const part =
    offset === 0 ? 0 : Math.sign(offset) * (Math.abs(offset) === 1 ? 10 : 4);
  const style = { "--part": `${part}px` } as CSSProperties;
  const StatusIcon = closed ? CircleMinus : CircleDot;

  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={`cycle-tab-${wb.cycle.id}`}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onSelect}
      style={style}
      className={cn(
        "group relative flex shrink-0 snap-start flex-col rounded-[14px] text-left outline-none sm:min-h-[140px] sm:w-auto",
        "[transform-origin:50%_100%] [transform-style:preserve-3d]",
        "transition-[transform,background-color,box-shadow] duration-(--dur-archive) ease-out-soft",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected ? "w-[64%]" : "w-[44%]",
        selected
          ? "z-10 bg-raised shadow-raised ring-1 ring-primary-edge/60 motion-safe:sm:[transform:translateY(-6px)_translateZ(28px)]"
          : "bg-[color-mix(in_srgb,var(--accent)_70%,var(--card))] shadow-card ring-1 ring-black/5 hover:bg-[color-mix(in_srgb,var(--accent)_40%,var(--card))] focus-visible:bg-[color-mix(in_srgb,var(--accent)_40%,var(--card))] motion-safe:sm:[transform:translateX(var(--part))_rotateX(11deg)] motion-safe:sm:hover:[transform:translateX(var(--part))_translateY(-4px)_rotateX(7deg)] motion-safe:sm:focus-visible:[transform:translateX(var(--part))_translateY(-4px)_rotateX(7deg)] dark:ring-white/5",
      )}
    >
      {/* Folder tab, in the sleeve's own material. */}
      <span
        aria-hidden
        className="absolute -top-2 left-4 h-3 w-14 rounded-t-lg bg-inherit"
      />
      <span className="flex flex-col gap-1 px-3.5 pt-3 pb-3 sm:pb-5">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold">Cycle {wb.cycle.number}</span>
          {selected && (
            <span className="text-xs font-medium text-link">Viewing</span>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          {periodLabel(wb.cycle, timeZone)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-chip">
          <StatusIcon aria-hidden className="size-3.5" />
          {closed ? "Paid" : "In progress"}
        </span>

        {/* Expansion: the selected sleeve's summary settles onto its flat face. */}
        <span
          inert={!selected}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-(--dur-archive) ease-out-soft motion-reduce:transition-opacity",
            selected
              ? "grid-rows-[1fr] opacity-100 delay-75"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <span className="min-h-0 overflow-hidden">
            <span className="mt-2 flex flex-col gap-0.5 border-t pt-2 text-sm">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-muted-foreground">
                  {closed ? "Paid in Gusto" : "Stage 1 draft"}
                </span>
                <Money cents={wb.stage1.totalCents} className="font-semibold" />
              </span>
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-muted-foreground">Questions asked</span>
                <span className="font-medium">{wb.cycle.questionsAsked}</span>
              </span>
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}
