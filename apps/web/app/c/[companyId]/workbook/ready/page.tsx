import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReadyView } from "@/components/workbook/ReadyView";
import { PageHeader } from "@/components/PageHeader";
import { companies } from "@/lib/companies";
import { currentViewer, workbookView } from "@/lib/server/fixtures";

// Next 16 instant navigation: params are read inside a Suspense child, never at the top of the page.
export default function ReadyPage({
  params,
}: PageProps<"/c/[companyId]/workbook/ready">) {
  return (
    <Suspense>
      <Ready params={params} />
    </Suspense>
  );
}

async function Ready({
  params,
}: Pick<PageProps<"/c/[companyId]/workbook/ready">, "params">) {
  const { companyId } = await params;
  if (!companies[companyId]) notFound();
  const data = workbookView(await currentViewer(companyId), companyId);
  if (!data)
    return (
      <>
        <PageHeader title="Payroll ready" />
        <p className="rounded-card border bg-card p-5 text-muted-foreground">
          This summary shows pay amounts, so only the owner sees it.
        </p>
      </>
    );
  return <ReadyView companyId={companyId} data={data} />;
}
