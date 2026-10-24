"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { useRole } from "@/components/RoleProvider";
import { RuleCard } from "@/components/rules/RuleCard";
import { PreviewNote, RulesEmpty } from "@/components/rules/RulesBits";
import { Segmented } from "@/components/Segmented";
import { useRuleStore } from "@/lib/ruleStore";
import { groupRules, type Rule } from "@/lib/rules";
import type { RulesViewData } from "@/lib/view-types";

type Filter = "all" | Rule["status"];

export function RulesView({
  companyId,
  dataKind,
  label,
  data,
}: {
  companyId: string;
  dataKind: DataKind;
  label: string;
  data: RulesViewData;
}) {
  const { role } = useRole();
  const store = useRuleStore(companyId, data.rules);
  const approverId = role === "owner" ? data.ownerId : null;
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<string | null>(null);

  // PrecedentBadge links to /rules#<ruleId>. Client navigation doesn't update :target, so do it here.
  useEffect(() => {
    const sync = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      setFilter("all");
      setTarget(id);
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ block: "center" }),
      );
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  if (!store.rules.length) return <RulesEmpty label={label} />;

  const count = (s: Filter) =>
    s === "all"
      ? store.rules.length
      : store.rules.filter((r) => r.status === s).length;
  const shown = store.rules.filter(
    (r) => filter === "all" || r.status === filter,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-3xl items-start gap-3 rounded-card border bg-card p-4 shadow-card">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-link" />
        <p>
          <span className="font-semibold">
            The person who answers a question never approves the rule it
            becomes.
          </span>{" "}
          PayrollPilot only uses rules a person approved, and checks never
          change pay on their own.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DataLabel kind={dataKind} detail={label} />
          <span className="text-sm text-muted-foreground">
            Source: {data.sources.rules}
          </span>
        </div>
        <PreviewNote />
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="conflicts">
        <h2 id="conflicts" className="text-xl font-semibold">
          Conflicts
        </h2>
        <div className="rounded-card border border-dashed border-input bg-card p-4">
          <p className="font-medium">No conflicts.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A conflict shows here when a new answer disagrees with an active
            rule, and you decide which one stands. Source: lessons, none yet
            (there is no lessons data in the fixture, and lessons are not live).
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show rules"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "all", label: `All ${count("all")}` },
            { value: "active", label: `Active ${count("active")}` },
            { value: "proposed", label: `Proposed ${count("proposed")}` },
            { value: "off", label: `Off ${count("off")}` },
          ]}
          className="max-w-full overflow-x-auto"
        />
      </div>

      {shown.length === 0 && (
        <p className="text-muted-foreground">No rules in this view.</p>
      )}
      {groupRules(shown).map((g) => (
        <section
          key={g.id}
          className="flex flex-col gap-3"
          aria-labelledby={`g-${g.id}`}
        >
          <h2
            id={`g-${g.id}`}
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {g.title} · {g.rules.length}
          </h2>
          {g.rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              names={data.names}
              store={store}
              viewer={role}
              approverId={approverId}
              highlight={target === r.id}
            />
          ))}
        </section>
      ))}

      <p className="border-t pt-4 text-sm text-muted-foreground">
        Once the rules functions are live, every change is written to the{" "}
        <Link
          href={`/c/${companyId}/audit`}
          className="text-link underline-offset-4 hover:underline"
        >
          audit log
        </Link>
        . Undo restores the previous version.
      </p>
    </div>
  );
}
