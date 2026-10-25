import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { LiveProvider } from "@/components/LiveProvider";
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
  // Keyed by company, so moving between companies looks the new one up again.
  return (
    <LiveProvider key={companyId} companyKey={companyId}>
      {children}
    </LiveProvider>
  );
}

// The shell is the viewport: sidebar and top bar are fixed; only <main> scrolls, and only when a page's content is
// taller than the space left. The window itself never scrolls. The stage track lives on the home (home/Progress).
export default function CompanyLayout({
  children,
  params,
}: LayoutProps<"/c/[companyId]">) {
  // The role comes from a cookie, so everything role-dependent renders per request inside this boundary.
  return (
    <Suspense fallback={<div className="h-dvh bg-background" />}>
      <KnownCompany params={params}>
        <RoleScope>
          <div className="flex h-dvh overflow-hidden bg-background">
            <Nav />
            <div className="flex min-w-0 flex-1 flex-col">
              <ShellHeader />
              <main className="scroll-panel min-h-0 flex-1 overflow-y-auto px-4 pt-7 pb-24 lg:px-[max(16px,2.2vw)] lg:pb-10">
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
