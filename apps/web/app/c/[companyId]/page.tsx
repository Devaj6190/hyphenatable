import { notFound } from "next/navigation";
import { FlagsList } from "@/components/FlagsList";
import { companies } from "@/lib/companies";

export default async function OwnerHome({
  params,
}: PageProps<"/c/[companyId]">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Here’s what we need from you</h1>
        <p className="text-sm text-muted-foreground">
          Flags for this pay cycle. Details are one click away.
        </p>
      </div>
      <FlagsList companyId={companyId} dataKind={company.kind} />
    </div>
  );
}
