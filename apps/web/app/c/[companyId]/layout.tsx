import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { RoleScope } from "@/components/RoleScope";
import { ShellHeader } from "@/components/ShellHeader";
import { companies } from "@/lib/companies";

// Known companies are prerendered. Nav and ShellHeader read the company from useParams on the client.
export function generateStaticParams() {
  return Object.keys(companies).map((companyId) => ({ companyId }));
}

// Unknown company ids 404 instead of rendering a shell with no DataLabel. (`dynamicParams = false` is not
// allowed with cacheComponents, so the check runs here, inside the Suspense boundary.)
async function KnownCompany({
  params,
  children,
}: {
  params: LayoutProps<"/c/[companyId]">["params"];
  children: ReactNode;
}) {
  const { companyId } = await params;
  if (!companies[companyId]) notFound();
  return children;
}

export default function CompanyLayout({
  children,
  params,
}: LayoutProps<"/c/[companyId]">) {
  // The role comes from a cookie, so everything role-dependent renders per request inside this boundary.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <KnownCompany params={params}>
        <RoleScope>
          <div className="grain flex min-h-dvh">
            <Nav />
            <div className="min-w-0 flex-1 pb-24 lg:pb-0">
              <ShellHeader />
              <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
                <Suspense
                  fallback={<p className="text-muted-foreground">Loading…</p>}
                >
                  {children}
                </Suspense>
              </main>
            </div>
          </div>
        </RoleScope>
      </KnownCompany>
    </Suspense>
  );
}
