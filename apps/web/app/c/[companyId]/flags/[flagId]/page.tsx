import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlagDetailSource } from "@/components/FlagDetailSource";
import { companies } from "@/lib/companies";
import {
  allFlagParams,
  currentViewer,
  flagDetail,
  homeFlags,
  viewerForRole,
} from "@/lib/server/fixtures";

export function generateStaticParams() {
  return allFlagParams();
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
  // Like Convex flags.get({ flagId, viewerId }) in #15: null when the flag is missing or not this viewer's.
  const viewer = await currentViewer(companyId);
  return (
    <FlagDetailSource
      companyId={companyId}
      flagId={flagId}
      data={flagDetail(viewer, companyId, flagId)}
      flagIds={homeFlags(viewer, companyId).map((f) => f.id)}
      roleOf={{
        [viewerForRole(companyId, "owner").workerId]: "owner",
        [viewerForRole(companyId, "manager").workerId]: "manager",
      }}
      dataKind={company.kind}
      timezone={company.timezone}
    />
  );
}
