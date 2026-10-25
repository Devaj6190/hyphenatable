"use client";

import {
  Building2,
  Ellipsis,
  FlaskConical,
  House,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Table2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RollPayLogo, RollPayMonogram } from "@/components/RollPayLogo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DEMO_MODE } from "@/lib/demo";
import { routes } from "@/lib/routes";
import { useStageState } from "@/lib/stageStore";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  href: (companyId: string) => string;
  icon: LucideIcon;
  /** Sub-routes that highlight this item (Inputs and problem detail sit under Home; Onboarding and the old
   * Rules URLs under Company). */
  owns?: string[];
  /** Shown in the phone tab bar; the rest go under More. */
  tab?: boolean;
};

// Mockup nav: Home, Company, Workbook, Audit, Manager, Demo. Phone tabs: Home, Company, Workbook, Audit, More.
const items: Item[] = [
  {
    label: "Home",
    href: routes.home,
    icon: House,
    owns: ["/inputs", "/flags"],
    tab: true,
  },
  {
    label: "Company",
    href: (id) => routes.company(id),
    icon: Building2,
    owns: ["/onboarding", "/rules"],
    tab: true,
  },
  { label: "Workbook", href: routes.workbook, icon: Table2, tab: true },
  { label: "Audit", href: routes.audit, icon: ScrollText, tab: true },
  { label: "Manager", href: routes.manager, icon: Users },
  ...(DEMO_MODE
    ? [{ label: "Demo", href: routes.demo, icon: FlaskConical }]
    : []),
];

function isActive(pathname: string, companyId: string, item: Item) {
  const base = routes.home(companyId);
  const own = item.href(companyId);
  const prefixes = (item.owns ?? []).map((p) => base + p);
  if (own === base)
    return pathname === base || prefixes.some((p) => pathname.startsWith(p));
  return [own, ...prefixes].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

const COLLAPSED_KEY = "pp_nav_collapsed";

export function Nav() {
  const { companyId } = useParams<{ companyId: string }>();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // Expanded on the server and first paint; the saved choice applies after mount so hydration matches.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };
  const more = items.filter((i) => !i.tab);
  const moreActive = more.some((i) => isActive(pathname, companyId, i));
  // Items still waiting on the owner, as the home last published them for this company.
  const stage = useStageState();
  const open = stage && stage.companyId === companyId ? stage.open : 0;

  return (
    <>
      {/* Desktop: light sidebar, 216px, collapsible to 64px (prototype side nav: text items, soft active fill) */}
      <nav
        aria-label="Main"
        data-collapsed={collapsed || undefined}
        className={cn(
          "hidden h-full shrink-0 flex-col gap-8 border-r bg-background pt-[26px] transition-[width] duration-(--dur-tab) ease-out-soft lg:flex",
          collapsed ? "w-16 px-2" : "w-[216px] px-3.5",
        )}
      >
        <Link
          href={routes.home(companyId)}
          aria-label="RollPay home"
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "px-2.5",
          )}
        >
          {collapsed ? (
            <RollPayMonogram size={28} />
          ) : (
            <RollPayLogo height={22} />
          )}
        </Link>
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, companyId, item);
            const Icon = item.icon;
            const badge = item.href === routes.home && open > 0 ? open : null;
            return (
              <li key={item.label}>
                <Link
                  href={item.href(companyId)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-[10px] text-[15px] transition-[color,background-color,transform] duration-(--dur-hover) ease-out-soft",
                    collapsed ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:translate-x-1 hover:text-foreground",
                  )}
                >
                  {collapsed ? (
                    <Icon aria-hidden className="size-4 shrink-0" />
                  ) : (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {badge !== null && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background tabular-nums">
                          <span className="sr-only">, </span>
                          {badge}
                          <span className="sr-only"> waiting on you</span>
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-col gap-2 pb-3">
          {!collapsed && (
            <p className="px-3 text-xs leading-normal text-muted-foreground">
              Draft only. RollPay never submits payroll.
            </p>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-9 items-center gap-3 rounded-control text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed ? "justify-center" : "px-2.5",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <>
                <PanelLeftClose aria-hidden className="size-4" />
                Collapse
              </>
            )}
          </button>
        </div>
      </nav>

      {/* Phone: bottom tabs (mockup HomePhone board: Home, Company, Workbook, Audit, More) */}
      <nav
        aria-label="Main"
        className="frosted fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items
          .filter((i) => i.tab)
          .map((item) => {
            const active = isActive(pathname, companyId, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href(companyId)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            );
          })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={cn(
            "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
            moreActive ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Ellipsis aria-hidden className="size-5" />
          More
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <ul className="flex flex-col gap-1 px-3 pb-6">
            {more.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, companyId, item);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href(companyId)}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-control px-3 font-medium",
                      active ? "bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
