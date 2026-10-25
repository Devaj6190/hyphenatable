"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataLabel } from "@/components/DataLabel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { companies } from "@/lib/companies";
import { CycleArchive } from "./CycleArchive";
import { periodLabel, type WorkbookData, workbookCsv } from "./data";
import { PaidSum, PreviewNote, WageSummary, WageTable } from "./WorkbookTable";

const PANEL_ID = "workbook-cycle-panel";

export function WorkbookView({
  companyId,
  data,
}: {
  companyId: string;
  data: WorkbookData;
}) {
  const params = useSearchParams();
  const company = companies[companyId];
  const [picked, setPicked] = useState(params.get("cycle"));
  const { cycles, names } = data;
  const at = cycles.findIndex((c) => c.cycle.id === picked);
  const index = at >= 0 ? at : cycles.length - 1;
  const wb = cycles[index];

  if (!wb)
    return (
      <>
        <PageHeader title="Workbook" />
        <div className="flex flex-col gap-2 rounded-card border bg-card p-5">
          <DataLabel kind={company.kind} detail={company.label} />
          <p className="text-muted-foreground">
            No payroll cycles are loaded for {company.label} yet.
          </p>
        </div>
      </>
    );

  const period = periodLabel(wb.cycle, company.timezone);
  // Local state moves the rack on the click's frame; native history keeps the URL shareable without a navigation.
  const select = (id: string) => {
    setPicked(id);
    window.history.replaceState(null, "", `?cycle=${id}`);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([workbookCsv(names, wb)], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `rollpay-workbook-${wb.cycle.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title={`Payroll for ${period}`}
        description="Wages, person by person. Every number traces to a Jobber or Gusto record."
        actions={
          <>
            {wb.basis === "engine" && (
              <Button
                nativeButton={false}
                variant="secondary"
                render={
                  <Link
                    href={`/c/${companyId}/workbook/ready?cycle=${wb.cycle.id}`}
                  />
                }
              >
                Ready summary
              </Button>
            )}
            <Button variant="secondary" onClick={download}>
              <Download aria-hidden />
              Download CSV
            </Button>
            <Button
              nativeButton={false}
              variant="ghost"
              render={<Link href={`/c/${companyId}`} />}
            >
              Back to Home
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <DataLabel
          kind={company.kind}
          detail={`${company.label}, cycle ${wb.cycle.number}`}
        />
        {wb.draftId && <span>Draft {wb.draftId}</span>}
        <span>Source: {data.source}</span>
      </div>
      <p className="mb-6 max-w-2xl text-muted-foreground">
        How each person’s wages were worked out. Nothing to do here. Job profit
        and commissions are reviewed during payroll, on Home.
      </p>

      <CycleArchive
        cycles={cycles}
        selectedId={wb.cycle.id}
        onSelect={select}
        timeZone={company.timezone}
        panelId={PANEL_ID}
      />

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`cycle-tab-${wb.cycle.id}`}
        className="mt-6 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <WageSummary
            names={names}
            wb={wb}
            previous={index > 0 ? cycles[index - 1] : null}
          />
          {wb.basis === "paid" ? (
            <PaidSum records={wb.stage1.lines.length} />
          ) : (
            <PreviewNote />
          )}
        </div>
        <WageTable key={wb.cycle.id} names={names} wb={wb} />
      </div>
    </>
  );
}
