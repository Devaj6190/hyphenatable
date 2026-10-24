"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataLabel } from "@/components/DataLabel";
import { PageHeader } from "@/components/PageHeader";
import { useRole } from "@/components/RoleProvider";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { companies } from "@/lib/companies";
import { fixtureFlags } from "@/lib/fixtures";
import { CycleArchive } from "./CycleArchive";
import {
  cyclesFor,
  periodLabel,
  previousCycle,
  readinessOf,
  WORKBOOK_SOURCE,
  workbookCsv,
} from "./data";
import { approveGate, useGateApproved } from "./gate-store";
import { ReadinessCard } from "./ReadinessCard";
import { ReconTable, Stage1Table, Stage2Table, VenmoList } from "./WorkbookTable";

const PANEL_ID = "workbook-cycle-panel";

export function WorkbookView({ companyId }: { companyId: string }) {
  const { role } = useRole();
  const params = useSearchParams();
  const [picked, setPicked] = useState(params.get("cycle"));
  const company = companies[companyId];
  const cycles = cyclesFor(companyId);
  const wb =
    cycles.find((c) => c.cycle.id === picked) ?? cycles.at(-1);
  const approved = useGateApproved(wb?.draftId ?? null);

  if (role === "manager")
    return (
      <>
        <PageHeader title="Workbook and readiness" />
        <p className="rounded-card border bg-card p-5 text-muted-foreground">
          The workbook shows pay amounts, so only the owner sees it.
        </p>
      </>
    );

  if (!wb)
    return (
      <>
        <PageHeader title="Workbook and readiness" />
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
      new Blob([workbookCsv(companyId, wb)], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `payrollpilot-workbook-${wb.cycle.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Workbook and readiness"
        description={
          <>
            Payroll for {period}
            {wb.draftId && ` · draft ${wb.draftId}`}
          </>
        }
        actions={
          <>
            {wb.basis === "engine" && (
              <Button nativeButton={false}
                variant="secondary"
                render={
                  <Link
                    href={`/c/${companyId}/workbook/ready?cycle=${wb.cycle.id}`}
                  />
                }
              >
                Payroll ready summary
              </Button>
            )}
            <Button variant="secondary" onClick={download}>
              <Download aria-hidden />
              Download CSV
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <DataLabel
          kind={company.kind}
          detail={`${company.label}, cycle ${wb.cycle.number}`}
        />
        <span>Source: {WORKBOOK_SOURCE}</span>
      </div>

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
        <ReadinessCard
          companyId={companyId}
          wb={wb}
          readiness={readinessOf(wb, fixtureFlags)}
          lastQuestions={
            previousCycle(companyId, wb.cycle.id)?.cycle.questionsAsked ?? null
          }
          approved={approved}
          onApprove={() => wb.draftId && approveGate(wb.draftId)}
        />

        <Tabs defaultValue="stage1">
          <TabsList>
            <TabsTrigger value="stage1">Stage 1 · Wages</TabsTrigger>
            <TabsTrigger value="stage2">Stage 2 · Commissions</TabsTrigger>
          </TabsList>
          <TabsContent value="stage1" className="flex flex-col gap-6">
            <Stage1Table companyId={companyId} wb={wb} />
            <VenmoList companyId={companyId} wb={wb} />
          </TabsContent>
          <TabsContent value="stage2" className="flex flex-col gap-8">
            <Stage2Table companyId={companyId} wb={wb} />
            <ReconTable wb={wb} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
