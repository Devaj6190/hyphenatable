import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlagsList } from "@/components/FlagsList";
import { PageHeader } from "@/components/PageHeader";
import { companies } from "@/lib/companies";

// Next 16 instant navigation: the page shell must not await params; read them inside a Suspense child.
export default function OwnerHome({ params }: PageProps<"/c/[companyId]">) {
  return (
    <>
      <PageHeader
        title="Here’s what we need from you"
        description="Flags for this pay cycle. Details are one click away."
      />
      <Suspense>
        <HomeFlags params={params} />
      </Suspense>
    </>
  );
}

async function HomeFlags({
  params,
}: Pick<PageProps<"/c/[companyId]">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return <FlagsList companyId={companyId} dataKind={company.kind} />;
}
