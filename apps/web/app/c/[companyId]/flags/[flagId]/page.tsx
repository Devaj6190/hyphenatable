import { notFound } from "next/navigation";
import { FlagDetail } from "@/components/FlagDetail";
import { companies } from "@/lib/companies";
import {
  allFlagParams,
  currentViewer,
  flagDetail,
} from "@/lib/server/fixtures";

export function generateStaticParams() {
  return allFlagParams();
}

export default async function FlagPage({
  params,
}: PageProps<"/c/[companyId]/flags/[flagId]">) {
  const { companyId, flagId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  // Like Convex flags.get({ flagId, viewerId }) in #15: null when the flag is missing or not this viewer's.
  const viewer = await currentViewer(companyId);
  return (
    <FlagDetail
      companyId={companyId}
      data={flagDetail(viewer, companyId, flagId)}
      dataKind={company.kind}
      timezone={company.timezone}
    />
  );
}
