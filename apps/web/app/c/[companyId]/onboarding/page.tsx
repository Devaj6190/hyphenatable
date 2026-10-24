import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OnboardingView } from "@/components/rules/OnboardingView";
import { SetupSteps } from "@/components/rules/SetupSteps";
import { companies } from "@/lib/companies";
import { currentViewer, rulesView } from "@/lib/server/fixtures";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function OnboardingPage({
  params,
}: PageProps<"/c/[companyId]/onboarding">) {
  return (
    <>
      <Suspense>
        <Steps params={params} />
      </Suspense>
      <PageHeader
        title="Here’s how we think you run payroll"
        description="Rules we found in your past payrolls. Confirm them, answer what we missed, or add your own."
      />
      <Suspense>
        <Body params={params} />
      </Suspense>
    </>
  );
}

async function Steps({
  params,
}: Pick<PageProps<"/c/[companyId]/onboarding">, "params">) {
  const { companyId } = await params;
  const viewer = await currentViewer(companyId);
  return <SetupSteps connected={rulesView(viewer, companyId).connected} />;
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
      dataKind={company.kind}
      label={company.label}
      data={rulesView(viewer, companyId)}
    />
  );
}
