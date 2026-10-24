import { notFound } from "next/navigation";
import { FlagsList } from "@/components/FlagsList";
import { companies } from "@/lib/companies";
import { currentViewer, homeFlags } from "@/lib/server/fixtures";

export default async function OwnerHome({
  params,
}: PageProps<"/c/[companyId]">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  // Fixture mode: the server picks the viewer from the role cookie and strips pay before anything is sent.
  const viewer = await currentViewer(companyId);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Here’s what we need from you</h1>
        <p className="text-sm text-muted-foreground">
          Flags for this pay cycle. Details are one click away.
        </p>
      </div>
      <FlagsList
        companyId={companyId}
        dataKind={company.kind}
        flags={homeFlags(viewer, companyId)}
        viewerId={viewer.workerId}
      />
    </div>
  );
}
