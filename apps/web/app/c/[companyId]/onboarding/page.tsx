import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OnboardingView } from "@/components/rules/OnboardingView";
import { SetupSteps } from "@/components/rules/SetupSteps";
import { companies } from "@/lib/companies";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function OnboardingPage({
  params,
}: PageProps<"/c/[companyId]/onboarding">) {
  return (
    <>
      <SetupSteps />
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

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/onboarding">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <OnboardingView
      companyId={companyId}
      dataKind={company.kind}
      label={company.label}
    />
  );
}
