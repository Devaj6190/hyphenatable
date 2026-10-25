"use client";

import { useRef, useState } from "react";
import { PeopleTab } from "@/components/company/PeopleTab";
import { ProfileTab } from "@/components/company/ProfileTab";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { useRole } from "@/components/RoleProvider";
import { LearnedView } from "@/components/rules/LearnedView";
import { RulesView } from "@/components/rules/RulesView";
import type { CompanyTab } from "@/lib/routes";
import { useRuleStore } from "@/lib/ruleStore";
import { cn } from "@/lib/utils";
import type { RulesViewData } from "@/lib/view-types";
import type { CompanyViewData } from "@/lib/view-types/company";

const TABS: { id: CompanyTab; label: string }[] = [
  { id: "people", label: "People and pay" },
  { id: "profile", label: "Profile" },
  { id: "rules", label: "Rules" },
];

/** Company: People and pay, Profile, Rules (mockup CompanyV2). The tab lives in `?tab=` so links can open one. */
export function CompanyView({
  companyId,
  name,
  label,
  dataKind,
  initialTab,
  data,
  rules,
}: {
  companyId: string;
  name: string;
  label: string;
  dataKind: DataKind;
  initialTab: CompanyTab;
  data: CompanyViewData;
  rules: RulesViewData;
}) {
  const { role } = useRole();
  const [tab, setTab] = useState<CompanyTab>(initialTab);
  const store = useRuleStore(companyId, rules.rules);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rulesOn = store.rules.filter((r) => r.status === "active").length;
  const schedule = data.settings.find((s) => s.id === "schedule")?.text;

  const select = (next: CompanyTab) => {
    setTab(next);
    // Keep the URL shareable without a server round trip (Next syncs useSearchParams with history).
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  };

  const counts: Record<CompanyTab, number> = {
    people: data.people.length,
    profile: data.settings.length,
    rules: store.rules.length,
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Company
          </span>
          <h1 className="text-[1.875rem] leading-tight font-semibold tracking-[-0.01em]">
            {name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <DataLabel kind={dataKind} detail={label} />
            {schedule && <span>Paid {schedule.toLowerCase()}</span>}
          </div>
        </div>
        <dl className="flex gap-6">
          {[
            [data.people.length, "people"],
            [data.apps.length, "apps synced"],
            [rulesOn, "rules on"],
          ].map(([n, what]) => (
            <div key={what} className="flex flex-col">
              <dd className="order-first text-2xl font-bold tabular-nums">
                {n}
              </dd>
              <dt className="text-xs text-muted-foreground">{what}</dt>
            </div>
          ))}
        </dl>
      </section>

      <div
        role="tablist"
        aria-label="Company"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = TABS.findIndex((t) => t.id === tab);
          const next =
            TABS[
              (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) %
                TABS.length
            ];
          select(next.id);
          refs.current[next.id]?.focus();
        }}
      >
        {TABS.map((t) => {
          const sel = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={sel}
              aria-controls={`panel-${t.id}`}
              tabIndex={sel ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                "inline-flex h-10.5 shrink-0 items-center gap-2 rounded-control px-4 text-[15px] transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                sel
                  ? "bg-primary font-bold text-primary-foreground"
                  : "font-semibold text-foreground/80 hover:bg-muted",
              )}
            >
              {t.id === "people" && !data.canSeePay ? "People" : t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-extrabold tabular-nums",
                  sel
                    ? "bg-primary-foreground/20"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="animate-in duration-(--dur-tab) ease-out-soft fade-in slide-in-from-bottom-2"
        key={tab}
      >
        {tab === "people" && (
          <PeopleTab
            companyId={companyId}
            data={data}
            synthetic={dataKind === "synthetic"}
          />
        )}
        {tab === "profile" && (
          <ProfileTab
            companyId={companyId}
            data={data}
            canEdit={role === "owner" && data.canSeePay}
          />
        )}
        {tab === "rules" && (
          <div className="flex flex-col gap-10">
            <RulesView
              companyId={companyId}
              dataKind={dataKind}
              label={label}
              data={rules}
            />
            <section
              aria-labelledby="learned"
              className="flex flex-col gap-4 border-t pt-8"
            >
              <div>
                <h2 id="learned" className="text-xl font-semibold">
                  What RollPay learned
                </h2>
                <p className="text-muted-foreground">
                  Questions per cycle, the rules that changed, and what it
                  learned from.
                </p>
              </div>
              <LearnedView
                companyId={companyId}
                dataKind={dataKind}
                label={label}
                data={rules}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
