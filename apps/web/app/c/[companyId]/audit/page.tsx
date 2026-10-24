import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuditLog } from "@/components/AuditLog";
import { PageHeader } from "@/components/PageHeader";
import { companies } from "@/lib/companies";

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
  return <AuditLog companyId={companyId} dataKind={company.kind} />;
}
