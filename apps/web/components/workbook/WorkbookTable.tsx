"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Money } from "@/components/Money";
import { SourceChip } from "@/components/SourceChip";
import { checkTitle } from "@/lib/checks";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  type CycleWorkbook,
  type EarningLine,
  type Names,
  type WageGroup,
  type WageRow,
  type WeekHours,
  wageRows,
  workerLabel,
} from "./data";

// Wages, person by person. Every amount is a stored value (engine draft or Gusto record) shown through
// <Money>; nothing here adds, multiplies or rounds pay. Bar widths are hours over a display scale, nothing more.

/** "42.5 h", "77.08 h", "85 h". */
export const fmtHours = (h: number) => `${Number(h.toFixed(2))} h`;

/** Closed-cycle totals are summed from Gusto records by the fixture script, not read from one Gusto record. */
export function PaidSum({ records }: { records: number }) {
  return (
    <span className="text-xs text-muted-foreground">
      Sum of {records} Gusto payroll record{records === 1 ? "" : "s"}{" "}
      (synthetic)
    </span>
  );
}

/** Open-cycle totals use rules that are still proposed. */
export function PreviewNote() {
  return (
    <span className="text-xs text-hold">
      Computed with proposed rules treated as approved (preview)
    </span>
  );
}

/** Turns "no Venmo rate (CHK-11): …" into a plain title, keeping the engine's words as the detail. */
export function HoldReason({ reason }: { reason: string }) {
  const chk = reason.match(/CHK-\d+/)?.[0];
  return (
    <span className="flex min-w-0 flex-col whitespace-normal">
      {chk && <span className="font-medium">{checkTitle(chk)}</span>}
      <span className="text-xs text-muted-foreground">{reason}</span>
    </span>
  );
}

const GROUP_TITLE: Record<WageGroup, string> = {
  hourly: "Hourly · in the Gusto draft",
  salary: "Salary · in the Gusto draft",
  venmo: "Venmo · paid outside Gusto",
  held: "Held out of the draft",
};
const GROUP_TITLE_PAID: Record<WageGroup, string> = {
  hourly: "Hourly · paid in Gusto",
  salary: "Salary · paid in Gusto",
  venmo: "Venmo · paid outside Gusto",
  held: "Held out of the draft",
};
const KIND: Record<WageGroup, string> = {
  hourly: "Hourly",
  salary: "Salary",
  venmo: "Venmo",
  held: "Held",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** A plain note under the name, from the stored line only. */
function noteOf(r: WageRow): string | null {
  if (r.group === "venmo")
    return r.held
      ? "Not paid until you add a rate. We never guess."
      : "Paid on Venmo, listed here, never sent to Gusto";
  if (r.held) return "Held for you, not in this draft";
  if (r.group === "salary") return "Gusto pays the salary; no hourly line";
  if (r.grossCents === 0 && !r.hours) return "No hours this cycle";
  return null;
}

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dayOnly = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: "UTC",
});
/** "Oct 10–16", from local YYYY-MM-DD days. */
function weekRange(w: WeekHours) {
  const a = new Date(`${w.start}T00:00:00Z`);
  const b = new Date(`${w.end}T00:00:00Z`);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${DAY.format(a)}–${dayOnly.format(b)}`
    : `${DAY.format(a)} – ${DAY.format(b)}`;
}

function weekCaption(w: WeekHours) {
  if (w.hours === 0) return "No hours";
  if (w.overtimeHours === 0 && w.doubleOvertimeHours === 0)
    return "All regular";
  const n = (h: number) => Number(h.toFixed(2));
  return [
    `${n(w.regularHours)} regular`,
    w.overtimeHours > 0 && `${n(w.overtimeHours)} overtime`,
    w.doubleOvertimeHours > 0 && `${n(w.doubleOvertimeHours)} double overtime`,
  ]
    .filter(Boolean)
    .join(" + ");
}

function WeekCard({
  w,
  index,
  scale,
  threshold,
}: {
  w: WeekHours;
  index: number;
  scale: number;
  threshold: number | null;
}) {
  const pct = (h: number) => `${Math.min(100, (h / scale) * 100)}%`;
  return (
    <div className="flex flex-col gap-2 rounded-control border bg-card px-4 py-3.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          Week {index + 1} · {weekRange(w)}
        </span>
        <b className="text-lg font-semibold tabular-nums">
          {fmtHours(w.hours)}
        </b>
      </span>
      <span
        role="img"
        aria-label={`${fmtHours(w.hours)}: ${weekCaption(w)}`}
        className="relative flex h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full bg-primary"
          style={{ width: pct(w.regularHours) }}
        />
        <span
          className="block h-full bg-linear-to-r from-sunset-1 to-sunset-2"
          style={{ width: pct(w.overtimeHours) }}
        />
        <span
          className="block h-full bg-sunset-3"
          style={{ width: pct(w.doubleOvertimeHours) }}
        />
        {threshold !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-card"
            style={{ left: pct(threshold) }}
          />
        )}
      </span>
      <span className="text-xs text-muted-foreground">{weekCaption(w)}</span>
    </div>
  );
}

const EARNING_LABEL: Record<string, string> = {
  "Regular Hours": "Regular",
  Overtime: "Overtime",
  "Double Overtime": "Double overtime",
  "Venmo Hours": "Hours",
  Hours: "Hours",
};

function formula(e: EarningLine, r: WageRow): string {
  if (e.name === "Salary") {
    if (!r.salary) return "From the Gusto record";
    const rate = formatCents(r.salary.rateCents);
    return r.salary.unit === "Year"
      ? `${rate} a year ÷ ${r.salary.periodsPerYear}`
      : `${rate} per ${r.salary.unit.toLowerCase()}, ${r.salary.periodsPerYear} pay periods a year`;
  }
  if (e.hours === null || e.hourRateCents === null) return "Fixed amount";
  const mult = e.multiplier && e.multiplier !== 1 ? ` (${e.multiplier}×)` : "";
  return `${fmtHours(e.hours)} × ${formatCents(e.hourRateCents)}${mult}`;
}

function Tile({ k, f, v }: { k: string; f: string; v: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5 rounded-control bg-muted/70 px-3.5 py-3">
      <span className="text-xs font-semibold text-muted-foreground">{k}</span>
      <span className="text-sm text-foreground/80">{f}</span>
      <b className="text-[1.0625rem] font-semibold">{v}</b>
    </div>
  );
}

function Breakdown({ r, threshold }: { r: WageRow; threshold: number | null }) {
  const weeks = r.weeks ?? [];
  // 50 h scale with the 40 h line at 80%; a longer week widens the scale so nothing is cut.
  const longest = Math.max(0, ...weeks.map((w) => w.hours));
  const scale = longest > 50 ? Math.ceil(longest / 10) * 10 : 50;
  return (
    <div className="flex flex-col gap-3 bg-accent/50 px-4 pt-1 pb-4 sm:px-5">
      {weeks.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {weeks.map((w, i) => (
            <WeekCard
              key={w.start}
              w={w}
              index={i}
              scale={scale}
              threshold={threshold}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {r.earnings.map((e) => (
          <Tile
            key={e.name}
            k={EARNING_LABEL[e.name] ?? e.name}
            f={formula(e, r)}
            v={<Money cents={e.amountCents} />}
          />
        ))}
        {r.earnings.length === 0 && (
          <Tile
            k="Hours"
            f={
              r.hours === null
                ? "No hours logged"
                : r.held && r.group === "venmo"
                  ? `${fmtHours(r.hours)} × no rate on file`
                  : `${fmtHours(r.hours)} logged`
            }
            v="—"
          />
        )}
        <div className="flex flex-[1_1_170px] sm:flex-[0_1_170px] flex-col justify-center gap-0.5 rounded-control bg-primary px-4 py-3 text-primary-foreground">
          <span className="text-xs font-semibold opacity-75">Gross</span>
          <b className="text-xl font-semibold">
            {r.grossCents === null ? (
              "Not paid"
            ) : (
              <Money cents={r.grossCents} />
            )}
          </b>
        </div>
      </div>
      <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="flex min-w-0 flex-col gap-1">
          {noteOf(r) && <span>{noteOf(r)}</span>}
          {r.reason && <HoldReason reason={r.reason} />}
        </span>
        {r.recordSystem && r.recordId && (
          <SourceChip system={r.recordSystem} recordId={r.recordId} />
        )}
      </span>
    </div>
  );
}

function Row({
  r,
  name,
  open,
  onToggle,
  threshold,
}: {
  r: WageRow;
  name: string;
  open: boolean;
  onToggle: () => void;
  threshold: number | null;
}) {
  const id = `wage-${r.workerId}`;
  const note = noteOf(r);
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "grid min-h-14 w-full items-center gap-3 border-t px-4 py-2 text-left outline-none sm:px-5",
          "grid-cols-[32px_minmax(0,1fr)_auto_20px] sm:grid-cols-[32px_minmax(0,1fr)_90px_110px_120px_20px]",
          "transition-colors duration-(--dur-hover) hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          open && "bg-accent/50",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground",
            r.held && "opacity-55",
          )}
        >
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground sm:hidden">
            {KIND[r.group]}
            {r.hours !== null && ` · ${fmtHours(r.hours)}`}
            {r.overtimeHours ? ` · ${Number(r.overtimeHours)} OT` : ""}
          </span>
          {note && !open && (
            <span className="truncate text-xs text-muted-foreground max-sm:hidden">
              {note}
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground max-sm:hidden">
          {KIND[r.group]}
        </span>
        <span className="text-right tabular-nums max-sm:hidden">
          {r.hours === null ? "—" : fmtHours(r.hours)}
          {r.overtimeHours ? (
            <span className="block text-xs font-semibold text-link">
              {Number(r.overtimeHours)} OT
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "text-right font-semibold",
            r.grossCents === null
              ? r.group === "venmo"
                ? "text-destructive"
                : "text-muted-foreground"
              : r.held && "text-muted-foreground",
          )}
        >
          {r.grossCents === null ? (
            r.group === "venmo" ? (
              "No rate"
            ) : (
              "Not paid"
            )
          ) : (
            <Money cents={r.grossCents} />
          )}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-(--dur-hover) ease-out-soft motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div id={id} className="motion-safe:animate-in motion-safe:fade-in-0">
          <Breakdown r={r} threshold={threshold} />
        </div>
      )}
    </>
  );
}

/** "Overtime: after 40 h in a workweek, 1.5× · after 8 h a day 1.5×, after 12 h a day 2×". */
function overtimeLine(wb: CycleWorkbook): string | null {
  const ot = wb.stage1.overtime;
  if (!ot) return null;
  const parts = [
    ot.weekly &&
      `after ${ot.weekly.overHours} h in a workweek, ${ot.weekly.multiplier}×`,
    ...ot.daily.map((d) => `after ${d.overHours} h a day, ${d.multiplier}×`),
  ].filter(Boolean);
  return `Overtime: ${parts.join(" · ")} (rule ${ot.ruleId})`;
}

export function WageTable({ names, wb }: { names: Names; wb: CycleWorkbook }) {
  const rows = wageRows(wb);
  const [open, setOpen] = useState<string | null>(null);
  const titles = wb.basis === "paid" ? GROUP_TITLE_PAID : GROUP_TITLE;
  const threshold = wb.stage1.overtime?.weekly?.overHours ?? null;
  const ot = overtimeLine(wb);

  return (
    <section
      aria-labelledby="wages-title"
      className="overflow-hidden rounded-card border bg-card shadow-card"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-4 sm:px-5">
        <h2 id="wages-title" className="text-lg font-semibold">
          {wb.basis === "paid" ? "Wages paid, per person" : "Wages, per person"}
        </h2>
        <span className="text-sm text-muted-foreground">
          Tap anyone to see the math
        </span>
        {ot && (
          <span className="text-sm text-muted-foreground sm:ml-auto">{ot}</span>
        )}
      </div>
      <div
        aria-hidden
        className="grid grid-cols-[32px_minmax(0,1fr)_auto_20px] gap-3 border-t bg-muted/50 px-4 py-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase sm:grid-cols-[32px_minmax(0,1fr)_90px_110px_120px_20px] sm:px-5"
      >
        <span />
        <span>Person</span>
        <span className="max-sm:hidden">Type</span>
        <span className="text-right max-sm:hidden">Hours</span>
        <span className="text-right">Gross</span>
        <span />
      </div>
      {rows.length === 0 && (
        <p className="border-t px-5 py-4 text-muted-foreground">
          No wage lines in this cycle.
        </p>
      )}
      {rows.map((r, i) => (
        <div key={`${r.group}-${r.workerId}`}>
          {r.group !== rows[i - 1]?.group && (
            <h3 className="border-t px-4 pt-3 pb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase sm:px-5">
              {titles[r.group]}
            </h3>
          )}
          <Row
            r={r}
            name={workerLabel(names, r.workerId)}
            open={open === r.workerId}
            onToggle={() =>
              setOpen((o) => (o === r.workerId ? null : r.workerId))
            }
            threshold={threshold}
          />
        </div>
      ))}
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t bg-muted/50 px-4 py-3 text-sm text-muted-foreground sm:px-5">
        <span>Gusto calculates taxes after the draft is filled.</span>
        <span className="font-medium text-foreground">
          Draft only. RollPay never submits payroll.
        </span>
      </div>
    </section>
  );
}

function SummaryTile({
  label,
  bar,
  children,
  note,
}: {
  label: string;
  bar: string;
  children: ReactNode;
  note: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border bg-card shadow-card">
      <div aria-hidden className={cn("h-1", bar)} />
      <div className="flex flex-col gap-1 px-4 py-3.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-[1.625rem] leading-tight font-semibold tabular-nums">
          {children}
        </span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}

export function WageSummary({
  names,
  wb,
  previous,
}: {
  names: Names;
  wb: CycleWorkbook;
  previous: CycleWorkbook | null;
}) {
  const rows = wageRows(wb);
  const inGusto = rows.filter(
    (r) => (r.group === "hourly" || r.group === "salary") && !r.held,
  ).length;
  const heldRows = rows.filter((r) => r.held);
  const venmoHeld = wb.stage1.venmoHeld;
  const firstNames = (ids: string[]) =>
    ids.map((id) => workerLabel(names, id).split(" ")[0]).join(", ");
  const { totals } = wb.stage1;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryTile
        label={wb.basis === "paid" ? "Paid in Gusto" : "Gusto gross"}
        bar="bg-primary"
        note={
          <>
            {inGusto} {inGusto === 1 ? "person" : "people"}
            {previous && (
              <>
                {" · last "}
                <Money cents={previous.stage1.totalCents} />
              </>
            )}
          </>
        }
      >
        <Money cents={wb.stage1.totalCents} />
      </SummaryTile>
      <SummaryTile
        label={wb.basis === "paid" ? "Hours paid" : "Hours in the draft"}
        bar="bg-linear-to-r from-sunset-1 to-sunset-2"
        note={`${Number(totals.overtimeHours)} overtime`}
      >
        {Number(totals.hours.toFixed(2))}
      </SummaryTile>
      <SummaryTile
        label="Venmo (outside Gusto)"
        bar="bg-ask"
        note={
          venmoHeld.length > 0
            ? `${firstNames(venmoHeld.map((v) => v.workerId))} not paid · no rate`
            : "Never sent to Gusto"
        }
      >
        <Money cents={totals.venmoCents} />
      </SummaryTile>
      <SummaryTile
        label="Held out"
        bar="bg-hold"
        note={
          heldRows.length > 0
            ? firstNames(heldRows.map((r) => r.workerId))
            : "Nobody is held"
        }
      >
        {heldRows.length} {heldRows.length === 1 ? "person" : "people"}
      </SummaryTile>
    </div>
  );
}
