"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { DataLabel } from "@/components/DataLabel";
import { useLive } from "@/components/LiveProvider";
import { RoleNotice, RoleSwitch } from "@/components/RoleSwitch";
import { RollPayLogo } from "@/components/RollPayLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { companies, cyclePeriod } from "@/lib/companies";
import { DEMO_MODE } from "@/lib/demo";
import { headerCycle, pageHasLiveCycle } from "@/lib/live/adapt";
import { useLiveCycle } from "@/lib/live/hooks";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Slim 56px top bar for every /c/[companyId] route: company name and pay period, the DataLabel pill, the A/B/R
// switcher, and the demo-only role and theme switches. The Owner / Manager switch and the theme toggle are demo-mode
// tools; outside demo mode the role comes from login and the theme follows the system.
export function ShellHeader() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = companies[companyId];
  // The header names the same cycle as the page under it: Convex's newest on a live page, the fixture's elsewhere.
  const pathname = usePathname();
  const live = useLive();
  const liveCycle = useLiveCycle(
    live.status === "ready" &&
      live.ctx.companyKey === companyId &&
      pageHasLiveCycle(pathname)
      ? live.ctx
      : null,
  );
  const cycle = company ? headerCycle(company.cycle, liveCycle) : null;
  const detail = cycle
    ? `${company?.label}, cycle ${cycle.number}`
    : company?.label;

  return (
    <header className="shrink-0 border-b bg-background">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Link
          href={routes.home(companyId)}
          aria-label="RollPay home"
          className="lg:hidden"
        >
          <RollPayLogo height={18} />
        </Link>
        <div className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="truncate font-medium">
            {company?.name ?? "Unknown company"}
          </span>
          {company && (
            <span className="hidden truncate text-muted-foreground sm:inline">
              ·{" "}
              {liveCycle.status === "loading"
                ? "Loading cycle…"
                : cyclePeriod({ timezone: company.timezone, cycle })}
            </span>
          )}
        </div>
        {company && (
          <DataLabel
            kind={company.kind}
            detail={detail}
            className="hidden md:inline-flex"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {DEMO_MODE && <RoleSwitch />}
          <nav
            aria-label="Company"
            className="flex rounded-full border bg-card p-0.5 text-xs"
          >
            {Object.keys(companies).map((id) => (
              <Link
                key={id}
                href={routes.home(id)}
                aria-current={id === companyId ? "page" : undefined}
                aria-label={companies[id].label}
                className={cn(
                  "grid size-6 place-items-center rounded-full font-medium",
                  id === companyId
                    ? "bg-foreground text-background"
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
      <div className="px-4 empty:hidden lg:px-6">
        <RoleNotice />
      </div>
    </header>
  );
}
