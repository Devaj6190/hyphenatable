import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReadyView } from "@/components/workbook/ReadyView";
import { companies } from "@/lib/companies";

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
  return <ReadyView companyId={companyId} />;
}
