import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ManagerInbox } from "@/components/ManagerInbox";
import { companies } from "@/lib/companies";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function ManagerPage({
  params,
}: PageProps<"/c/[companyId]/manager">) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Your crew’s items</h1>
        <p className="text-sm text-muted-foreground">
          Hours and jobs only. Pay amounts are never shown here.
        </p>
      </div>
      <Suspense>
        <Body params={params} />
      </Suspense>
    </div>
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
