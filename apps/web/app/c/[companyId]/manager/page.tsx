import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ManagerInbox } from "@/components/ManagerInbox";
import { companies } from "@/lib/companies";
import { managerInboxView } from "@/lib/server/views/manager";

// The URL is inside sent texts and tests: never rename it. Params are read inside Suspense so the shell stays
// instant (Next 16); the headline counts open items, so ManagerInbox renders its own title.
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
  return (
    <ManagerInbox
      data={managerInboxView(companyId)}
      dataKind={company.kind}
      timezone={company.timezone}
      companyLabel={company.label}
    />
  );
}
