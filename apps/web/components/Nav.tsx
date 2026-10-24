"use client";

import {
  BookOpen,
  Ellipsis,
  FlaskConical,
  House,
  ListChecks,
  type LucideIcon,
  ScrollText,
  Table2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DEMO_MODE } from "@/lib/demo";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Sub-routes that highlight this item (Shannin's boards: Inputs and problem detail sit under Home). */
  owns?: string[];
  /** Shown in the phone tab bar; the rest go under More. */
  tab?: boolean;
};

const items: Item[] = [
  {
    label: "Home",
    path: "",
    icon: House,
    owns: ["/inputs", "/flags"],
    tab: true,
  },
  { label: "Manager", path: "/manager", icon: Users },
  { label: "Onboarding", path: "/onboarding", icon: ListChecks },
  { label: "Rules", path: "/rules", icon: BookOpen, tab: true },
  { label: "Workbook", path: "/workbook", icon: Table2, tab: true },
  { label: "Audit", path: "/audit", icon: ScrollText, tab: true },
  ...(DEMO_MODE ? [{ label: "Demo", path: "/demo", icon: FlaskConical }] : []),
];

function isActive(pathname: string, base: string, item: Item) {
  const prefixes = [item.path, ...(item.owns ?? [])].map((p) => base + p);
  if (item.path === "")
    return (
      pathname === base || prefixes.slice(1).some((p) => pathname.startsWith(p))
    );
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Nav() {
  const { companyId } = useParams<{ companyId: string }>();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const base = `/c/${companyId}`;
  const more = items.filter((i) => !i.tab);
  const moreActive = more.some((i) => isActive(pathname, base, i));

  return (
    <>
      {/* Desktop: left rail */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r bg-card/60 px-3 py-5 lg:flex"
      >
        <Link
          href={base}
          className="mb-5 px-3 text-lg font-semibold tracking-tight text-link"
        >
          PayrollPilot
        </Link>
        {items.map((item) => {
          const active = isActive(pathname, base, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={base + item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-(--dur-hover)",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Phone: bottom tabs (Shannin's HomePhone board: Home, Rules, Workbook, Audit, More) */}
      <nav
        aria-label="Main"
        className="frosted fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items
          .filter((i) => i.tab)
          .map((item) => {
            const active = isActive(pathname, base, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={base + item.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-link" : "text-muted-foreground",
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
            moreActive ? "text-link" : "text-muted-foreground",
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
              const active = isActive(pathname, base, item);
              return (
                <li key={item.label}>
                  <Link
                    href={base + item.path}
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
