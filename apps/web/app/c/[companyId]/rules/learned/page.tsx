import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LearnedView } from "@/components/rules/LearnedView";
import { companies } from "@/lib/companies";
import { currentViewer, rulesView } from "@/lib/server/fixtures";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function LearnedPage({
  params,
}: PageProps<"/c/[companyId]/rules/learned">) {
  return (
    <>
      <PageHeader
        title="What PayrollPilot learned"
        description="Questions per cycle, the rules that changed, and what it learned from."
      />
      <Suspense>
        <Body params={params} />
      </Suspense>
    </>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/rules/learned">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  const viewer = await currentViewer(companyId);
  return (
    <LearnedView
      companyId={companyId}
      dataKind={company.kind}
      label={company.label}
      data={rulesView(viewer, companyId)}
    />
  );
}
