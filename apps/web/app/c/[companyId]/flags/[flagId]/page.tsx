import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlagDetail } from "@/components/FlagDetail";
import { companies } from "@/lib/companies";
import { fixtureFlags } from "@/lib/fixtures";

export function generateStaticParams() {
  return fixtureFlags.map((f) => ({ companyId: f.companyId, flagId: f.id }));
}

// Params are read inside Suspense so the shell stays instant (Next 16).
export default function FlagPage({
  params,
}: PageProps<"/c/[companyId]/flags/[flagId]">) {
  return (
    <Suspense>
      <Flag params={params} />
    </Suspense>
  );
}

async function Flag({
  params,
}: Pick<PageProps<"/c/[companyId]/flags/[flagId]">, "params">) {
  const { companyId, flagId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <FlagDetail companyId={companyId} flagId={flagId} dataKind={company.kind} />
  );
}
