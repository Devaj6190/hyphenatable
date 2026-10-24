import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RulesView } from "@/components/rules/RulesView";
import { buttonVariants } from "@/components/ui/button";
import { companies } from "@/lib/companies";

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function RulesPage({
  params,
}: PageProps<"/c/[companyId]/rules">) {
  return (
    <>
      <PageHeader
        title="Rules"
        description="Every rule in plain words, where it came from, who approved it, and how it backtests."
        actions={
          <Suspense>
            <LearnedLink params={params} />
          </Suspense>
        }
      />
      <Suspense>
        <Body params={params} />
      </Suspense>
    </>
  );
}

async function LearnedLink({
  params,
}: Pick<PageProps<"/c/[companyId]/rules">, "params">) {
  const { companyId } = await params;
  return (
    <Link
      href={`/c/${companyId}/rules/learned`}
      className={buttonVariants({ variant: "secondary" })}
    >
      What it learned
    </Link>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/rules">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <RulesView
      companyId={companyId}
      dataKind={company.kind}
      label={company.label}
    />
  );
}
