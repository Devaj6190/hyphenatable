"use client";

import {
  BookOpen,
  FlaskConical,
  Gauge,
  ListChecks,
  type LucideIcon,
  ScrollText,
  Table2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const demoOn = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

type Item = { label: string; path: string; icon: LucideIcon; built: boolean };

const items: Item[] = [
  { label: "Home", path: "", icon: Gauge, built: true },
  { label: "Manager", path: "/manager", icon: Users, built: true },
  { label: "Onboarding", path: "/onboarding", icon: ListChecks, built: false },
  { label: "Rules", path: "/rules", icon: BookOpen, built: false },
  { label: "Workbook", path: "/workbook", icon: Table2, built: false },
  { label: "Audit", path: "/audit", icon: ScrollText, built: false },
  ...(demoOn
    ? [{ label: "Demo", path: "/demo", icon: FlaskConical, built: false }]
    : []),
];

export function Nav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const base = `/c/${companyId}`;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-card lg:static lg:w-52 lg:flex-col lg:gap-1 lg:border-t-0 lg:bg-transparent lg:p-4"
    >
      {items.map(({ label, path, icon: Icon, built }) => {
        const href = base + path;
        const active = pathname === href;
        const cls = cn(
          "flex flex-1 flex-col items-center gap-1 px-1 py-2 text-xs lg:flex-none lg:flex-row lg:gap-3 lg:rounded-lg lg:px-3 lg:text-sm",
          active
            ? "font-semibold text-primary lg:bg-muted"
            : "text-muted-foreground",
          !built && "opacity-50",
        );
        return built ? (
          <Link
            key={label}
            href={href}
            className={cls}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-5 lg:size-4" />
            {label}
          </Link>
        ) : (
          <span
            key={label}
            className={cls}
            aria-disabled="true"
            title="Not built yet"
          >
            <Icon className="size-5 lg:size-4" />
            {label}
          </span>
        );
      })}
    </nav>
  );
}
