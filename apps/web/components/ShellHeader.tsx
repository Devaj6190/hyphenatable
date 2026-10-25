"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DataLabel } from "@/components/DataLabel";
import { RoleNotice, RoleSwitch } from "@/components/RoleSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { companies, cyclePeriod, SEATS_LINE } from "@/lib/companies";
import { DEMO_MODE } from "@/lib/demo";
import { cn } from "@/lib/utils";

// Page header for every /c/[companyId] route: fake company name, cycle period, DataLabel, seats line,
// company switcher, theme toggle, and (demo mode) the Owner / Manager switch.
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
          href={`/c/${companyId}`}
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
                href={`/c/${id}`}
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
          <ThemeToggle />
        </div>
      </div>
      <div className="mx-auto mt-1 flex max-w-6xl flex-wrap gap-x-4 text-xs text-muted-foreground sm:text-sm">
        <p>{SEATS_LINE}</p>
        <RoleNotice />
      </div>
    </header>
  );
}
