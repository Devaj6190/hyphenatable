import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HomeBoard } from "@/components/HomeBoard";
import { companies } from "@/lib/companies";

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
  return <HomeBoard companyId={companyId} />;
}
