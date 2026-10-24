import { notFound } from "next/navigation";
import { AuditLog } from "@/components/AuditLog";
import { companies } from "@/lib/companies";
import { auditView, currentViewer } from "@/lib/server/fixtures";

export default async function AuditPage({
  params,
}: PageProps<"/c/[companyId]/audit">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  const viewer = await currentViewer(companyId);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every step, who did it, and where it came from. Nothing is edited
          after the fact.
        </p>
      </div>
      <AuditLog data={auditView(viewer, companyId)} dataKind={company.kind} />
    </div>
  );
}
