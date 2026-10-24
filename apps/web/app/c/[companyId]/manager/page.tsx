import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ManagerInbox } from "@/components/ManagerInbox";
import { companies } from "@/lib/companies";

// Params are read inside Suspense so the shell stays instant (Next 16). The title counts open items, so
// ManagerInbox renders its own PageHeader.
export default function ManagerPage({
  params,
}: PageProps<"/c/[companyId]/manager">) {
  return (
    <Suspense>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/manager">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return <ManagerInbox companyId={companyId} dataKind={company.kind} />;
}
