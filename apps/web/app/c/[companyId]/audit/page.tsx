import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentOrgChart } from "@/components/AgentOrgChart";
import { AuditLog } from "@/components/AuditLog";
import { LiveAuditLog } from "@/components/LiveAuditLog";
import { PageHeader } from "@/components/PageHeader";
import { companies } from "@/lib/companies";
import { auditView, currentViewer, managerIds } from "@/lib/server/fixtures";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function AuditPage({
  params,
}: PageProps<"/c/[companyId]/audit">) {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every pull, flag, message, answer, correction, rule change and draft fill, in order. Nothing here can be edited."
      />
      <Suspense>
        <Body params={params} />
      </Suspense>
    </>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/audit">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  // A company with no fixtures (Company R, real data never committed) reads its log from Convex.
  if (!company.cycle)
    return (
      <LiveAuditLog
        dataKind={company.kind}
        timezone={company.timezone}
        companyId={companyId}
        companyLabel={company.label}
      />
    );
  const viewer = await currentViewer(companyId);
  const data = auditView(viewer, companyId);
  return (
    <>
      <AgentOrgChart events={data.events} />
      <AuditLog
        data={data}
        dataKind={company.kind}
        timezone={company.timezone}
        companyId={companyId}
        companyLabel={`${company.label}${company.cycle ? `, cycle ${company.cycle.number}` : ""}`}
        managerIds={managerIds(companyId)}
      />
    </>
  );
}
