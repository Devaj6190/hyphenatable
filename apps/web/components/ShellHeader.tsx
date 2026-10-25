"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DataLabel } from "@/components/DataLabel";
import { RoleNotice, RoleSwitch } from "@/components/RoleSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { companies, cyclePeriod } from "@/lib/companies";
import { DEMO_MODE } from "@/lib/demo";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Page header for every /c/[companyId] route: RollPay mark (phone), fake company name, cycle period, DataLabel
// and company switcher. The Owner / Manager switch and the theme toggle are demo-mode tools; outside demo mode the
// role comes from login and the theme follows the system.
export function ShellHeader() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = companies[companyId];
  const detail = company?.cycle
    ? `${company.label}, cycle ${company.cycle.number}`
    : company?.label;

  return (
    <header className="border-b bg-card/70 px-4 py-3 lg:px-8 lg:py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={routes.home(companyId)}
          className="text-base font-semibold tracking-tight text-link lg:hidden"
        >
          RollPay
        </Link>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">
            {company?.name ?? "Unknown company"}
          </span>
          {company && (
            <span className="text-sm text-muted-foreground">
              {cyclePeriod(company)}
            </span>
          )}
        </div>
        {company && <DataLabel kind={company.kind} detail={detail} />}
        <div className="ml-auto flex items-center gap-3">
          {DEMO_MODE && <RoleSwitch />}
          <nav
            aria-label="Company"
            className="flex rounded-full bg-muted p-1 text-sm"
          >
            {Object.keys(companies).map((id) => (
              <Link
                key={id}
                href={routes.home(id)}
                aria-current={id === companyId ? "page" : undefined}
                aria-label={companies[id].label}
                className={cn(
                  "grid size-7 place-items-center rounded-full font-medium",
                  id === companyId
                    ? "bg-card text-foreground shadow-card ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {id.toUpperCase()}
              </Link>
            ))}
          </nav>
          {DEMO_MODE && <ThemeToggle />}
        </div>
      </div>
      <div className="mx-auto max-w-6xl empty:hidden">
        <RoleNotice />
      </div>
    </header>
  );
}
