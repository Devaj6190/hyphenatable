import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompanyView } from "@/components/company/CompanyView";
import { companies } from "@/lib/companies";
import type { CompanyTab } from "@/lib/routes";
import { currentViewer, rulesView } from "@/lib/server/fixtures";
import { companyView } from "@/lib/server/views/company";

const TABS: CompanyTab[] = ["people", "profile", "rules"];

// Params and the tab are read inside Suspense so the shell stays instant (Next 16).
export default function CompanyPage(
  props: PageProps<"/c/[companyId]/company">,
) {
  return (
    <Suspense>
      <Body {...props} />
    </Suspense>
  );
}

async function Body({
  params,
  searchParams,
}: PageProps<"/c/[companyId]/company">) {
  const { companyId } = await params;
  const { tab } = await searchParams;
  const company = companies[companyId];
  if (!company) notFound();
  const viewer = await currentViewer(companyId);
  const initialTab = TABS.find((t) => t === tab) ?? "people";
  return (
    <CompanyView
      companyId={companyId}
      name={company.name}
      label={company.label}
      dataKind={company.kind}
      initialTab={initialTab}
      data={companyView(viewer, companyId)}
      rules={rulesView(viewer, companyId)}
    />
  );
}
