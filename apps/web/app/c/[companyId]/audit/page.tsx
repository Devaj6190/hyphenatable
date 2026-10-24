import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuditLog } from "@/components/AuditLog";
import { companies } from "@/lib/companies";
import { auditView, currentViewer } from "@/lib/server/fixtures";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function AuditPage({
  params,
}: PageProps<"/c/[companyId]/audit">) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every step, who did it, and where it came from. Nothing is edited
          after the fact.
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
}: Pick<PageProps<"/c/[companyId]/audit">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  const viewer = await currentViewer(companyId);
  return (
    <AuditLog
      data={auditView(viewer, companyId)}
      dataKind={company.kind}
      timezone={company.timezone}
    />
  );
}
