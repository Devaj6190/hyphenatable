import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LiveWorkbook } from "@/components/LiveWorkbook";
import { PageHeader } from "@/components/PageHeader";
import { WorkbookView } from "@/components/workbook/WorkbookView";
import { companies } from "@/lib/companies";
import { currentViewer, workbookView } from "@/lib/server/fixtures";

// Next 16 instant navigation: params are read inside a Suspense child, never at the top of the page.
export default function WorkbookPage({
  params,
}: PageProps<"/c/[companyId]/workbook">) {
  return (
    <Suspense>
      <Workbook params={params} />
    </Suspense>
  );
}

async function Workbook({
  params,
}: Pick<PageProps<"/c/[companyId]/workbook">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  const data = workbookView(await currentViewer(companyId), companyId);
  if (!data)
    return (
      <>
        <PageHeader title="Workbook" />
        <p className="rounded-card border bg-card p-5 text-muted-foreground">
          The workbook shows pay amounts, so only the owner sees it.
        </p>
      </>
    );
  // A company with no fixtures (Company R) shows its Stage 1 draft from Convex; the owner-only check above holds.
  if (!company.cycle)
    return (
      <LiveWorkbook
        companyId={companyId}
        label={company.label}
        dataKind={company.kind}
      />
    );
  return <WorkbookView companyId={companyId} data={data} />;
}
