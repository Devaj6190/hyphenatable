import { notFound } from "next/navigation";
import { FlagDetail } from "@/components/FlagDetail";
import { companies } from "@/lib/companies";
import { fixtureFlags } from "@/lib/fixtures";

export function generateStaticParams() {
  return fixtureFlags.map((f) => ({ companyId: f.companyId, flagId: f.id }));
}

export default async function FlagPage({
  params,
}: PageProps<"/c/[companyId]/flags/[flagId]">) {
  const { companyId, flagId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  return (
    <FlagDetail companyId={companyId} flagId={flagId} dataKind={company.kind} />
  );
}
