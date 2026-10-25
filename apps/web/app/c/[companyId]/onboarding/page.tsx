import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OnboardingView } from "@/components/rules/OnboardingView";
import { companies } from "@/lib/companies";
import { currentViewer, rulesView } from "@/lib/server/fixtures";
import { companyView } from "@/lib/server/views/company";

// Guided setup (mockup OnboardingV3). Fixture only: the onboarding functions are stubs.
// Params are read inside Suspense so the shell stays instant (Next 16).
export default function OnboardingPage({
  params,
}: PageProps<"/c/[companyId]/onboarding">) {
  return (
    <Suspense>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/onboarding">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  const viewer = await currentViewer(companyId);
  return (
    <OnboardingView
      companyId={companyId}
      companyName={company.name}
      dataKind={company.kind}
      label={company.label}
      data={rulesView(viewer, companyId)}
      company={companyView(viewer, companyId)}
    />
  );
}
