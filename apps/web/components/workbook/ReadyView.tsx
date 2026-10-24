"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DataLabel } from "@/components/DataLabel";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { companies } from "@/lib/companies";
import { holdsOf, periodLabel, type WorkbookData, workerLabel } from "./data";
import { useGateApproved } from "./gate-store";
import { HoldReason } from "./WorkbookTable";

const STATUS_WORDS = {
  computed: "Computed, Gate 1 not approved",
  approved: "Gate 1 approved, not filled yet",
  filled: "Filled in Gusto",
  calculated: "Filled and calculated in Gusto",
} as const;

function Figure({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <Card size="sm" className="px-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-[1.75rem] leading-tight font-semibold tracking-[-0.01em]">
        {children}
      </p>
      <div className="text-sm text-muted-foreground">{note}</div>
    </Card>
  );
}

export function ReadyView({
  companyId,
  data,
}: {
  companyId: string;
  data: WorkbookData;
}) {
  const params = useSearchParams();
  const company = companies[companyId];
  const open = data.cycles.filter((c) => c.basis === "engine");
  const wb =
    open.find((c) => c.cycle.id === params.get("cycle")) ?? open.at(-1);
  const approved = useGateApproved(wb?.draftId ?? null);

  if (!wb)
    return (
      <>
        <PageHeader title="Payroll ready" />
        <div className="flex flex-col gap-2 rounded-card border bg-card p-5">
          <DataLabel kind={company.kind} detail={company.label} />
          <p className="text-muted-foreground">
            No open payroll cycle is loaded for {company.label} yet.
          </p>
        </div>
      </>
    );

  const status = approved ? "approved" : (wb.draftStatus ?? "computed");
  const ready = status === "calculated";
  const holds = holdsOf(wb);
  const inGusto = wb.stage1.lines.filter((l) => !l.held).length;

  return (
    <>
      <PageHeader
        title={
          ready ? "Payroll is ready for your review" : "What goes into Gusto"
        }
        description={
          ready
            ? "The Gusto draft is filled and calculated. Check it in Gusto when you’re ready."
            : "The Gusto draft isn’t filled yet. This is what the workbook will put in it."
        }
        actions={
          <Button
            nativeButton={false}
            variant={ready ? "secondary" : "primary"}
            render={
              <Link href={`/c/${companyId}/workbook?cycle=${wb.cycle.id}`} />
            }
          >
            {ready ? "Back to workbook" : "Open workbook"}
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <DataLabel
          kind={company.kind}
          detail={`${company.label}, cycle ${wb.cycle.number}`}
        />
        <span>Payroll for {periodLabel(wb.cycle, company.timezone)}</span>
      </div>

      <div className="flex flex-col gap-6">
        <Card className="gap-3 px-5">
          <div className="flex flex-wrap items-center gap-3">
            {ready ? (
              <StatusBadge status="verified" label="Draft calculated" />
            ) : (
              <StatusBadge status="needs-you" label="Not in Gusto yet" />
            )}
            <p className="font-semibold">Gusto draft: {STATUS_WORDS[status]}</p>
          </div>
          <p className="text-muted-foreground">
            {status === "computed"
              ? "Approve Gate 1 on the workbook, then fill the Gusto draft. Nothing is paid until you check the draft and finish it in Gusto yourself."
              : status === "approved"
                ? "You approved Gate 1. Fill the Gusto draft from the workbook next."
                : "Nothing is paid until you open the draft, check it and finish it in Gusto yourself."}
          </p>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            Draft only. PayrollPilot never submits payroll.
            {wb.cycle.gustoPayrollId && (
              <SourceChip system="Gusto" recordId={wb.cycle.gustoPayrollId} />
            )}
          </p>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Figure
            label="Stage 1 · Wages in Gusto"
            note={
              <span className="flex flex-wrap items-center gap-2">
                {inGusto} people
                {wb.draftId && (
                  <SourceChip system="Workbook" recordId={wb.draftId} />
                )}
              </span>
            }
          >
            <Money cents={wb.stage1.totalCents} />
          </Figure>
          <Figure
            label="Stage 2 · Commissions and splits"
            note={`${wb.stage2.lines.length} lines · ${wb.stage2.held.length} held`}
          >
            <Money cents={wb.stage2.totalCents} />
          </Figure>
          <Figure
            label="Cycle profit"
            note={
              wb.totalProfitCents === null
                ? "Not known yet: at least one job has no total or invoice."
                : "Revenue minus labor and job costs"
            }
          >
            {wb.totalProfitCents === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <Money cents={wb.totalProfitCents} />
            )}
          </Figure>
        </div>

        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Held from this payroll</h2>
            <Badge tone={holds.length > 0 ? "hold" : "neutral"}>
              {holds.length} {holds.length === 1 ? "hold" : "holds"}
            </Badge>
          </div>
          {holds.length === 0 ? (
            <p className="px-5 py-4 text-muted-foreground">Nothing is held.</p>
          ) : (
            <ul className="divide-y">
              {holds.map((h) => (
                <li
                  key={h.key}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium first-letter:uppercase">
                      {h.workerId
                        ? `${workerLabel(data.names, h.workerId)} · `
                        : ""}
                      {h.what}
                    </span>
                    <HoldReason reason={h.reason} />
                  </span>
                  <StatusBadge status="held" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="text-sm text-muted-foreground">
          Prepared by PayrollPilot from Jobber, QuickBooks and Gusto records.{" "}
          <Link
            href={`/c/${companyId}/inputs`}
            className="text-link underline-offset-4 hover:underline"
          >
            See every input
          </Link>
          .
        </p>
      </div>
    </>
  );
}
