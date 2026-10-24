import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { ShellHeader } from "@/components/ShellHeader";
import { companies } from "@/lib/companies";

// Known companies are prerendered. The layout never awaits params (Next 16 instant navigation):
// Nav and ShellHeader read the company from useParams on the client.
export function generateStaticParams() {
  return Object.keys(companies).map((companyId) => ({ companyId }));
}

export default function CompanyLayout({
  children,
}: LayoutProps<"/c/[companyId]">) {
  return (
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
  );
}
