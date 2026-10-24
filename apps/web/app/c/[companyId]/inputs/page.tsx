import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlagsList } from "@/components/FlagsList";
import { PageHeader } from "@/components/PageHeader";
import { SyncStrip } from "@/components/SyncStrip";
import { WorkersTable } from "@/components/WorkersTable";
import { companies } from "@/lib/companies";
import { currentViewer } from "@/lib/server/fixtures";
import { homeView, rosterView } from "@/lib/server/home";

// Board 2, reached from the home's sync strip ("See every input") and "See all problems".
export default function InputsPage({
  params,
}: PageProps<"/c/[companyId]/inputs">) {
  return (
    <Suspense>
      <Inputs params={params} />
    </Suspense>
  );
}

async function Inputs({
  params,
}: Pick<PageProps<"/c/[companyId]/inputs">, "params">) {
  const { companyId } = await params;
  const company = companies[companyId];
  if (!company) notFound();
  // Fixture mode: filtered and redacted on the server for the viewer in the role cookie.
  const viewer = await currentViewer(companyId);
  const fx = homeView(viewer, companyId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/c/${companyId}`}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Home
        </Link>
        <PageHeader
          title="Inputs and problems"
          description="Everything we pulled for this payroll, and every problem we found in it."
        />
      </div>

      <section aria-labelledby="sources-title" className="flex flex-col gap-3">
        <h2 id="sources-title" className="text-xl font-semibold">
          What we pulled
        </h2>
        <p className="text-muted-foreground">
          Each pull is counted against what the app itself reports. A pull that
          comes up short is red and holds everything it covers.
        </p>
        <SyncStrip
          runs={fx.syncRuns}
          timeZone={company.timezone}
          companyId={companyId}
          detailed
        />
        <p className="text-xs text-muted-foreground">
          Source: placeholder fixture, data/fixtures/a/syncRuns.json,{" "}
          {company.kind}.
        </p>
      </section>

      <section aria-labelledby="problems-title" className="flex flex-col gap-3">
        <h2 id="problems-title" className="text-xl font-semibold">
          Problems found
        </h2>
        <FlagsList
          companyId={companyId}
          flags={fx.flags}
          info={fx.info}
          viewerId={viewer.workerId}
        />
      </section>

      <section aria-labelledby="workers-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="workers-title" className="text-xl font-semibold">
            Workers and rates
          </h2>
          <Link
            href={`/c/${companyId}/workbook`}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            Hours and pay are in the workbook
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <WorkersTable
          companyId={companyId}
          workers={rosterView(viewer, companyId)}
          flags={fx.flags}
        />
        <p className="text-xs text-muted-foreground">
          Source: data/fixtures/a/workers.json, {company.kind}. Rates are shown
          as each system holds them, side by side.
        </p>
      </section>
    </div>
  );
}
