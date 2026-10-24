import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { HomeBoard } from "@/components/HomeBoard";
import { companies } from "@/lib/companies";
import { currentViewer, homeView } from "@/lib/server/fixtures";

// Next 16 instant navigation: the page shell must not await params; read them inside a Suspense child.
export default function OwnerHome({ params }: PageProps<"/c/[companyId]">) {
  return (
    <Suspense>
      <Home params={params} />
    </Suspense>
  );
}

async function Home({ params }: Pick<PageProps<"/c/[companyId]">, "params">) {
  const { companyId } = await params;
  if (!companies[companyId]) notFound();
  // Fixture mode: the server picks the viewer from the role cookie and strips pay before anything is sent.
  const viewer = await currentViewer(companyId);
  // The home holds the owner's approve actions; a manager works from their own inbox.
  if (viewer.role === "manager") redirect(`/c/${companyId}/manager`);
  return (
    <HomeBoard
      companyId={companyId}
      viewerId={viewer.workerId}
      data={homeView(viewer, companyId)}
    />
  );
}
