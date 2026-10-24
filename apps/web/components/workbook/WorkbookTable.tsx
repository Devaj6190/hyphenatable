import type { ReactNode } from "react";
import { Money } from "@/components/Money";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { checkTitle } from "@/lib/checks";
import type { SourceSystem } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  type CycleWorkbook,
  type JobRow,
  type Names,
  type Stage1Line,
  workerLabel,
} from "./data";

// Workbook tables. Every amount is a stored value (engine draft or Gusto record) shown through <Money>;
// nothing here adds, multiplies or rounds pay.

const num = "text-right tabular-nums";
const hours = (h: number | null) => (h === null ? "—" : h.toFixed(2));

/** "Gusto" for what was paid in a closed cycle, "Workbook" for the engine's draft. */
const sourceOf = (wb: CycleWorkbook): SourceSystem =>
  wb.basis === "paid" ? "Gusto" : "Workbook";

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

function SectionTitle({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {children && (
          <p className="text-sm text-muted-foreground">{children}</p>
        )}
      </div>
      {aside}
    </div>
  );
}

export function Stage1Table({
  names,
  wb,
}: {
  names: Names;
  wb: CycleWorkbook;
}) {
  const cleared = wb.stage1.lines.filter((l) => !l.held);
  const held = wb.stage1.lines.filter((l) => l.held);
  const system = sourceOf(wb);
  const row = (l: Stage1Line) => (
    <TableRow
      key={l.workerId}
      className={cn(l.held && "bg-hold-soft/50 hover:bg-hold-soft/70")}
    >
      <TableCell className="font-medium">
        {workerLabel(names, l.workerId)}
        <span className="block text-xs font-normal text-muted-foreground">
          {l.workerId}
        </span>
      </TableCell>
      <TableCell className={num}>
        {l.kind === "salary" ? "Salaried" : hours(l.regularHours)}
      </TableCell>
      <TableCell className={num}>{hours(l.overtimeHours)}</TableCell>
      <TableCell className={num}>
        {l.rateCents === null ? (
          "—"
        ) : (
          <>
            <Money cents={l.rateCents} />
            <span className="text-muted-foreground">
              {l.kind === "salary" ? "/yr" : "/h"}
            </span>
          </>
        )}
      </TableCell>
      <TableCell className={cn(num, "font-semibold")}>
        {l.grossCents === null ? (
          <span className="font-normal text-muted-foreground">Not paid</span>
        ) : (
          <Money cents={l.grossCents} />
        )}
      </TableCell>
      <TableCell className="max-w-72">
        <span className="flex items-start justify-between gap-3">
          {l.held ? (
            <span className="flex min-w-0 flex-col gap-1">
              <StatusBadge status="held" />
              <HoldReason
                reason={l.reason ?? `held by ${l.heldFlagIds.join(", ")}`}
              />
            </span>
          ) : (
            <span className="text-sm whitespace-normal text-muted-foreground">
              {l.kind === "hourly" &&
              l.regularHours === null &&
              l.grossCents === 0
                ? "No hours this cycle"
                : ""}
            </span>
          )}
          <SourceChip system={system} recordId={l.recordId} />
        </span>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        title={
          wb.basis === "paid" ? "Wages paid in Gusto" : "Stage 1 · Wages in Gusto"
        }
        aside={
          <span className="flex items-center gap-2">
            <Money
              cents={wb.stage1.totalCents}
              className="text-xl font-semibold"
            />
            <SourceChip system={system} recordId={wb.draftId ?? wb.cycle.id} />
          </span>
        }
      >
        {cleared.length} cleared
        {held.length > 0 && ` · ${held.length} held, kept out of the draft`}
      </SectionTitle>
      <Table className="text-[0.9375rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Worker</TableHead>
            <TableHead className={num}>Hours</TableHead>
            <TableHead className={num}>Overtime</TableHead>
            <TableHead className={num}>Rate</TableHead>
            <TableHead className={num}>Gross</TableHead>
            <TableHead>Notes and source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cleared.map(row)}
          {held.length > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={6}
                className="pt-5 text-xs font-semibold tracking-wide text-hold uppercase"
              >
                Held · not in this draft until someone answers
              </TableCell>
            </TableRow>
          )}
          {held.map(row)}
        </TableBody>
      </Table>
    </div>
  );
}

export function VenmoList({
  names,
  wb,
}: {
  names: Names;
  wb: CycleWorkbook;
}) {
  const { venmo, venmoHeld } = wb.stage1;
  if (venmo.length === 0 && venmoHeld.length === 0) return null;
  const system = sourceOf(wb);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed p-4">
      <SectionTitle title="Paid outside payroll">
        Venmo · never sent to Gusto
      </SectionTitle>
      <ul className="flex flex-col divide-y">
        {venmo.map((v) => (
          <li
            key={v.workerId}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
          >
            <span className="font-medium">
              {workerLabel(names, v.workerId)}
            </span>
            <span className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground tabular-nums">
                {hours(v.hours)} h
                {v.rateCents !== null && (
                  <>
                    {" × "}
                    <Money cents={v.rateCents} />
                  </>
                )}
              </span>
              <Money cents={v.amountCents} className="font-semibold" />
              <SourceChip system={system} recordId={v.recordId} />
            </span>
          </li>
        ))}
        {venmoHeld.map((v) => (
          <li
            key={v.workerId}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2"
          >
            <span className="font-medium">
              {workerLabel(names, v.workerId)}
            </span>
            <span className="flex max-w-md items-start gap-2">
              <HoldReason reason={v.reason} />
              <StatusBadge status="held" label="Held · needs a rate" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Stage2Table({
  names,
  wb,
}: {
  names: Names;
  wb: CycleWorkbook;
}) {
  const system = sourceOf(wb);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        title={
          wb.basis === "paid"
            ? "Off-cycle pay in Gusto"
            : "Stage 2 · Commissions and splits"
        }
        aside={
          <Money
            cents={wb.stage2.totalCents}
            className="text-xl font-semibold"
          />
        }
      >
        Commission, tips and the manager split, each from its rule
      </SectionTitle>
      {wb.stage2.lines.length === 0 ? (
        <p className="rounded-control bg-muted px-4 py-3 text-sm text-muted-foreground">
          Nothing to pay in Stage 2 this cycle
          {wb.stage2.held.length > 0 ? "; the items below are held." : "."}
        </p>
      ) : (
        <Table className="text-[0.9375rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Worker</TableHead>
              <TableHead>Earning</TableHead>
              <TableHead className={num}>Amount</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wb.stage2.lines.map((s) => (
              <TableRow key={`${s.recordId}-${s.workerId}-${s.name}`}>
                <TableCell className="font-medium">
                  {workerLabel(names, s.workerId)}
                </TableCell>
                <TableCell>
                  {s.name}
                  {s.name === "Cash Tips" && (
                    <span className="block text-xs text-muted-foreground">
                      Venmo, never sent to Gusto
                    </span>
                  )}
                </TableCell>
                <TableCell className={cn(num, "font-semibold")}>
                  <Money cents={s.amountCents} />
                </TableCell>
                <TableCell>
                  <SourceChip system={system} recordId={s.recordId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {wb.stage2.held.length > 0 && (
        <ul className="flex flex-col divide-y rounded-control border border-hold/40 bg-hold-soft/40">
          {wb.stage2.held.map((h) => (
            <li
              key={`${h.workerId}-${h.what}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
            >
              <span className="flex flex-col">
                <span className="font-medium first-letter:uppercase">
                  {h.what}
                </span>
                <span className="text-sm text-muted-foreground">
                  {h.workerId ? workerLabel(names, h.workerId) : "—"} ·{" "}
                  {h.reason}
                </span>
              </span>
              <StatusBadge status="held" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const cents = (c: number | null) => (c === null ? "—" : <Money cents={c} />);

export function ReconTable({ wb }: { wb: CycleWorkbook }) {
  if (!wb.jobs)
    return (
      <p className="rounded-control bg-muted px-4 py-3 text-sm text-muted-foreground">
        The reconciliation report is kept for the open cycle only. Closed cycles
        show what Gusto paid.
      </p>
    );
  const low = wb.jobs.filter((j) => j.low).length;
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        title="Reconciliation · job profit"
        aside={
          low > 0 ? (
            <StatusBadge
              status="needs-you"
              label={`${low} below your ${wb.lowMarginPct}% margin line`}
            />
          ) : null
        }
      >
        Revenue minus labor and job costs, per job
      </SectionTitle>
      <Table className="text-[0.9375rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Job</TableHead>
            <TableHead className={num}>Revenue</TableHead>
            <TableHead className={num}>Labor</TableHead>
            <TableHead className={num}>Job costs</TableHead>
            <TableHead className={num}>Profit</TableHead>
            <TableHead className={num}>Margin</TableHead>
            <TableHead>Likely reasons</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {wb.jobs.map((j: JobRow) => (
            <TableRow
              key={j.jobId}
              className={cn(j.low && "bg-hold-soft/50 hover:bg-hold-soft/70")}
            >
              <TableCell className="max-w-56 whitespace-normal">
                <span className="font-medium">Job {j.jobNumber ?? j.jobId}</span>
                <span className="block text-xs text-muted-foreground">
                  {j.title}
                </span>
              </TableCell>
              <TableCell className={num}>{cents(j.revenueCents)}</TableCell>
              <TableCell className={num}>{cents(j.laborCents)}</TableCell>
              <TableCell className={num}>{cents(j.jobCostCents)}</TableCell>
              <TableCell className={cn(num, "font-semibold")}>
                {cents(j.profitCents)}
              </TableCell>
              <TableCell className={num}>
                {j.marginPct === null ? "—" : `${j.marginPct}%`}
              </TableCell>
              <TableCell className="max-w-80 text-sm whitespace-normal">
                <span className="flex flex-col gap-1">
                  {j.low && <StatusBadge status="needs-you" label="Low profit" />}
                  {j.hints.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                  {j.provisional && (
                    <span className="text-muted-foreground">
                      Provisional: the job is still in progress
                    </span>
                  )}
                  <span className="flex flex-wrap gap-1">
                    <SourceChip system="Jobber" recordId={j.jobId} />
                  </span>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
