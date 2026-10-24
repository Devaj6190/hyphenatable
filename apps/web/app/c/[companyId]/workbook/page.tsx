import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WorkbookView } from "@/components/workbook/WorkbookView";
import { companies } from "@/lib/companies";

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
  if (!companies[companyId]) notFound();
  return <WorkbookView companyId={companyId} />;
}
