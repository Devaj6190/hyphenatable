import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoPanel } from "@/components/DemoPanel";
import { PageHeader } from "@/components/PageHeader";
import { companies } from "@/lib/companies";
import { DEMO_MODE } from "@/lib/demo";
import { currentViewer, demoQuestions } from "@/lib/server/fixtures";

// Hidden unless NEXT_PUBLIC_DEMO_MODE=1. Params are read inside Suspense (Next 16).
export default function DemoPage({ params }: PageProps<"/c/[companyId]/demo">) {
  if (!DEMO_MODE) notFound();
  return (
    <>
      <PageHeader
        title="Demo panel"
        description="For judging only. Hidden unless demo mode is on. Everything made here is labelled."
      />
      <Suspense>
        <Body params={params} />
      </Suspense>
    </>
  );
}

async function Body({
  params,
}: Pick<PageProps<"/c/[companyId]/demo">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <DemoPanel
      companyId={companyId}
      dataKind={company.kind}
      {...demoQuestions(await currentViewer(companyId), companyId)}
    />
  );
}
