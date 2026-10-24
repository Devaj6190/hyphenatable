import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HomeBoard } from "@/components/HomeBoard";
import { companies } from "@/lib/companies";
import { currentViewer } from "@/lib/server/fixtures";
import { homeView } from "@/lib/server/home";

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
  return <HomeBoard companyId={companyId} data={homeView(viewer, companyId)} />;
}
