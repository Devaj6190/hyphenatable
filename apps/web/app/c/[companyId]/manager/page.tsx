import { notFound } from "next/navigation";
import { ManagerInbox } from "@/components/ManagerInbox";
import { companies } from "@/lib/companies";
import { managerInbox } from "@/lib/server/fixtures";

export default async function ManagerPage({
  params,
}: PageProps<"/c/[companyId]/manager">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Your crew’s items</h1>
        <p className="text-sm text-muted-foreground">
          Hours and jobs only. Pay amounts are never shown here.
        </p>
      </div>
      <ManagerInbox
        data={managerInbox(companyId)}
        dataKind={company.kind}
        timezone={company.timezone}
      />
    </div>
  );
}
