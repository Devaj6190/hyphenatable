import Link from "next/link";
import { Suspense } from "react";
import { DataLabel } from "@/components/DataLabel";
import { Nav } from "@/components/Nav";
import { companies, SEATS_LINE } from "@/lib/companies";

// Known companies are prerendered; cacheComponents requires params to be known or inside Suspense.
export function generateStaticParams() {
  return Object.keys(companies).map((companyId) => ({ companyId }));
}

export default async function CompanyLayout({
  children,
  params,
}: LayoutProps<"/c/[companyId]">) {
  const { companyId } = await params;
  const company = companies[companyId];
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Nav companyId={companyId} />
      <div className="flex-1 pb-20 lg:pb-0">
        <header className="border-b bg-card px-4 py-4 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="text-lg font-semibold text-primary">
              PayrollPilot
            </span>
            <span className="font-medium">
              {company?.name ?? "Unknown company"}
            </span>
            {company && <DataLabel kind={company.kind} />}
            <div className="ml-auto flex gap-3 text-sm">
              {Object.keys(companies).map((id) => (
                <Link
                  key={id}
                  href={`/c/${id}`}
                  className={
                    id === companyId
                      ? "font-semibold text-primary"
                      : "text-muted-foreground hover:underline"
                  }
                >
                  {id.toUpperCase()}
                </Link>
              ))}
            </div>
          </div>
          <p className="mx-auto mt-1 max-w-6xl text-sm text-muted-foreground">
            {SEATS_LINE}
          </p>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
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
