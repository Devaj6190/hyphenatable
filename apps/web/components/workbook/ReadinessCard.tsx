"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Money } from "@/components/Money";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CycleWorkbook, Readiness } from "./data";
import { GateDialog } from "./GateDialog";
import { PaidSum, PreviewNote } from "./WorkbookTable";

const STEPS = [
  { key: "computed", label: "Computed" },
  { key: "approved", label: "Gate 1 approved" },
  { key: "filled", label: "Filled" },
  { key: "calculated", label: "Calculated in Gusto" },
] as const;

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  tone?: "hold";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-2xl leading-tight font-semibold",
          tone === "hold" && "text-hold",
        )}
      >
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

/** What keeps Gate 1 closed, with a way to it. Nothing when nothing blocks. */
export function GateBlockers({
  companyId,
  readiness: r,
  className,
}: {
  companyId: string;
  readiness: Readiness;
  className?: string;
}) {
  if (r.open + r.incompleteSyncs === 0) return null;
  return (
    <p className={cn("text-sm", className)}>
      Gate 1 is blocked by{" "}
      {r.open > 0 && `${r.open} open problem${r.open === 1 ? "" : "s"}`}
      {r.open > 0 && r.incompleteSyncs > 0 && " and "}
      {r.incompleteSyncs > 0 &&
        `${r.incompleteSyncs} incomplete sync${r.incompleteSyncs === 1 ? "" : "s"}`}{" "}
      ·{" "}
      <Link
        href={`/c/${companyId}`}
        className="text-link underline-offset-4 hover:underline"
      >
        Open problems
      </Link>
    </p>
  );
}

export function ReadinessCard({
  companyId,
  wb,
  readiness: r,
  lastQuestions,
}: {
  companyId: string;
  wb: CycleWorkbook;
  readiness: Readiness;
  /** Questions asked in the previous cycle; null for the first cycle. */
  lastQuestions: number | null;
}) {
  const [fillTried, setFillTried] = useState(false);
  const paid = wb.basis === "paid";
  const cleared =
    wb.stage1.lines.filter((l) => !l.held).length + wb.stage1.venmo.length;
  const workers =
    wb.stage1.lines.length +
    wb.stage1.venmo.length +
    wb.stage1.venmoHeld.length;
  const heldWorkers = workers - cleared;
  const blocked = r.open + r.incompleteSyncs;
  // The draft's own status only moves forward; the gate is offered only while it is computed.
  const status = wb.draftStatus ?? "computed";
  const incomplete = wb.syncRuns.filter((s) => !s.complete);
  const entriesShort = r.pulled !== null && !r.pulled.complete;
  const reached = STEPS.findIndex((s) => s.key === status);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold">
            {paid
              ? `Cycle ${wb.cycle.number} was paid`
              : `${cleared} of ${workers} workers ready`}
            {!paid && heldWorkers > 0 && (
              <span className="text-hold"> · {heldWorkers} held</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {paid
              ? "Wages, off-cycle pay and Venmo as Gusto and Venmo recorded them."
              : "Held items stay out of Gusto until someone answers. Everyone else can be paid."}
          </p>
        </div>
        {!paid && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              {status === "computed" && (
                <GateDialog
                  cycleNumber={wb.cycle.number}
                  cleared={cleared}
                  held={heldWorkers}
                  totalCents={wb.stage1.totalCents}
                  disabled={blocked > 0}
                />
              )}
              {(status === "computed" || status === "approved") && (
                <Button
                  variant={status === "approved" ? "primary" : "secondary"}
                  disabled={status !== "approved"}
                  onClick={() => setFillTried(true)}
                >
                  Fill Gusto draft
                </Button>
              )}
            </div>
            {status === "computed" && (
              <GateBlockers
                companyId={companyId}
                readiness={r}
                className="text-right"
              />
            )}
            {fillTried && (
              <output className="block max-w-sm text-right text-sm">
                Not connected to Gusto yet. Nothing was sent.
              </output>
            )}
          </div>
        )}
      </div>

      {incomplete.length > 0 && (
        <div className="flex flex-col gap-2 border-t px-5 py-4">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {incomplete.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status="sync-incomplete" />
                <span className="text-sm">
                  <span className="capitalize">{s.source}</span>{" "}
                  {s.object === "timeSheetEntries" ? "time entries" : s.object}:{" "}
                  {s.pulled} of {s.expected} pulled
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {paid
              ? "Counts that come from this sync are short, so they aren’t shown."
              : "Gate 1 waits until it completes. Counts that come from this sync are short, so they aren’t shown."}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t px-5 py-5 sm:grid-cols-3 lg:grid-cols-7">
        <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-3 lg:col-span-2">
          <dt className="text-sm text-muted-foreground">
            {paid ? "Wages paid in Gusto" : "Stage 1 wages"}
          </dt>
          <dd className="text-[2rem] leading-tight font-semibold tracking-[-0.01em]">
            <Money cents={wb.stage1.totalCents} />
          </dd>
          <dd className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {paid ? (
              <PaidSum records={wb.stage1.lines.length} />
            ) : (
              <>
                Computed by the engine, not by Gusto
                {wb.draftId && (
                  <SourceChip system="Workbook" recordId={wb.draftId} />
                )}
              </>
            )}
          </dd>
          {!paid && (
            <dd>
              <PreviewNote />
            </dd>
          )}
        </div>
        {paid ? (
          <>
            <Stat
              label="Questions"
              value={wb.cycle.questionsAsked}
              note={
                lastQuestions === null
                  ? "first cycle"
                  : `last cycle: ${lastQuestions}`
              }
            />
            <Stat
              label="Synced"
              value={r.pulled && !entriesShort ? r.pulled.pulled : "—"}
              note={
                !r.pulled
                  ? "no time-entry sync recorded"
                  : entriesShort
                    ? "time-entry sync incomplete"
                    : `of ${r.pulled.expected} time entries expected`
              }
            />
          </>
        ) : (
          <>
            <Stat
              label="Clean"
              value={entriesShort ? "—" : (r.clean ?? "—")}
              note={
                !r.pulled
                  ? "no time-entry sync recorded"
                  : entriesShort
                    ? "time-entry sync incomplete"
                    : `of ${r.pulled.pulled} entries, no problem`
              }
            />
            <Stat
              label="Fixed"
              value={r.fixed}
              note={
                r.fixed === 0
                  ? "no corrections yet, so no dollars changed"
                  : "dollars changed are in the audit log"
              }
            />
            <Stat
              label="Open"
              value={r.open}
              note={r.open > 0 ? "block Gate 1" : "nothing blocks Gate 1"}
              tone={r.open > 0 ? "hold" : undefined}
            />
            <Stat
              label="Held"
              value={r.held}
              note="kept out, with reasons below"
              tone={r.held > 0 ? "hold" : undefined}
            />
            <Stat
              label="Questions"
              value={wb.cycle.questionsAsked}
              note={
                lastQuestions === null
                  ? "first cycle"
                  : `last cycle: ${lastQuestions}`
              }
            />
          </>
        )}
      </dl>

      <div className="flex flex-col gap-3 border-t bg-muted/50 px-5 py-4 rounded-b-card">
        {paid ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status="closed" label="Paid" />
            Summed from Gusto’s payroll records for this cycle.
          </p>
        ) : (
          <>
            <ol
              aria-label="Gusto draft status"
              className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm"
            >
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                  )}
                  <span
                    aria-current={i === reached ? "step" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1",
                      i <= reached ? "font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {i <= reached && (
                      <Check aria-hidden className="size-4 text-ok" />
                    )}
                    {s.label}
                    {i <= reached && <span className="sr-only">(done)</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground">
              Gusto’s calculated totals appear here beside ours once the draft
              is calculated.
            </p>
          </>
        )}
        <p className="text-sm font-medium">
          Draft only. RollPay never submits payroll.
        </p>
      </div>
    </Card>
  );
}
