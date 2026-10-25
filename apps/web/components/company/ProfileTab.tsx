"use client";

import { useState } from "react";
import { AppMark, Initials, StatusDot } from "@/components/company/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRuleStore } from "@/lib/ruleStore";
import { cn } from "@/lib/utils";
import type { CompanyViewData, SettingCard } from "@/lib/view-types/company";

const GLYPH: Record<SettingCard["id"], string> = {
  schedule: "S",
  timezone: "T",
  overtime: "O",
  longShift: "L",
  payChange: "%",
  margin: "P",
};

/** What a changed setting says as an owner-stated rule. The owner's number, restated, never computed. */
const STATED: Partial<Record<SettingCard["id"], (v: string) => string>> = {
  overtime: (v) => `Overtime starts after ${v} hours in a week.`,
  longShift: (v) => `Ask about any shift longer than ${v} hours.`,
  payChange: (v) =>
    `Flag pay that changes more than ${v}% from the average of the last 3 cycles.`,
  margin: (v) => `Flag jobs under ${v}% profit margin.`,
};

const NUMBER = /^\d{1,3}(\.\d{1,2})?$/;

export function ProfileTab({
  companyId,
  data,
  canEdit,
}: {
  companyId: string;
  data: CompanyViewData;
  canEdit: boolean;
}) {
  const store = useRuleStore(companyId, []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<number | null>(null);

  const changed = data.settings.filter(
    (s) =>
      s.value !== null &&
      draft[s.id] !== undefined &&
      draft[s.id] !== String(s.value),
  );
  const invalid = changed.some((s) => !NUMBER.test(draft[s.id].trim()));

  const save = () => {
    for (const s of changed) {
      const words = STATED[s.id];
      if (words) store.addStated(words(draft[s.id].trim()), null);
    }
    setSaved(changed.length);
    setEditing(false);
    setDraft({});
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">How payroll works here</h2>
        {canEdit &&
          data.settings.length > 0 &&
          (editing ? (
            <span className="flex gap-2">
              <Button onClick={save} disabled={!changed.length || invalid}>
                Save changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft({});
                }}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
                setSaved(null);
              }}
            >
              Edit
            </Button>
          ))}
      </div>

      {saved !== null && (
        <output className="block rounded-control bg-ok-soft p-3 text-sm text-ok">
          {saved === 0
            ? "Nothing changed."
            : `Saved as ${saved} rule${saved === 1 ? "" : "s"} you stated. ${saved === 1 ? "It stays" : "They stay"} proposed until confirmed in Rules, and ${saved === 1 ? "is" : "are"} checked against past payrolls before applying. This preview keeps it in this browser tab.`}
        </output>
      )}

      {data.settings.length === 0 ? (
        <p className="rounded-card border border-dashed border-input bg-card p-6 text-muted-foreground">
          No company settings on record yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.settings.map((s) => {
            const fixed = s.value === null;
            const input = editing && !fixed;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex flex-col gap-2 rounded-card border bg-card p-4 shadow-card transition-opacity",
                  input && "border-sunset-2",
                  editing && fixed && "opacity-55",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-7.5 place-items-center rounded-[9px] text-[13px] font-extrabold",
                      fixed
                        ? "bg-muted text-muted-foreground"
                        : "bg-sunset text-sunset-ink",
                    )}
                  >
                    {GLYPH[s.id]}
                  </span>
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    {s.label}
                  </span>
                </div>
                {input ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Input
                      aria-label={s.label}
                      inputMode="decimal"
                      value={draft[s.id] ?? String(s.value)}
                      onChange={(e) =>
                        setDraft({ ...draft, [s.id]: e.target.value })
                      }
                      aria-invalid={
                        draft[s.id] !== undefined &&
                        !NUMBER.test(draft[s.id].trim())
                      }
                      className="w-20"
                    />
                    <span className="text-muted-foreground">{s.unit}</span>
                  </div>
                ) : (
                  <span className="text-[17px] font-bold">{s.text}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {s.source}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="who-answers"
          className="flex flex-col gap-3 rounded-card border bg-card p-5 shadow-card"
        >
          <h3 id="who-answers" className="font-bold">
            Who answers what
          </h3>
          {data.routing ? (
            <>
              {[
                {
                  who: data.routing.jobFacts,
                  role: "manager",
                  what: "Job facts: hours, jobs, expenses",
                },
                {
                  who: data.routing.money,
                  role: "owner",
                  what: "Money and policy: rates, pay, approvals",
                },
              ].map(
                (r) =>
                  r.who && (
                    <div key={r.role} className="flex items-center gap-3">
                      <Initials
                        text={r.who.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">
                          {r.who.name} · {r.role}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {r.what}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {data.routing?.ruleId}
                      </span>
                    </div>
                  ),
              )}
              {data.employeesMayBeTexted !== null && (
                <p className="text-sm text-muted-foreground">
                  {data.employeesMayBeTexted
                    ? "Employees may be texted, after the manager approves each message."
                    : "Employees are never texted directly."}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No routing rule yet.</p>
          )}
        </section>

        <section
          aria-labelledby="apps"
          className="flex flex-col gap-3 rounded-card border bg-card p-5 shadow-card"
        >
          <h3 id="apps" className="font-bold">
            Connected apps
          </h3>
          {data.apps.length === 0 && (
            <p className="text-muted-foreground">No syncs on record yet.</p>
          )}
          {data.apps.map((a) => (
            <div key={a.system} className="flex items-center gap-3">
              <AppMark app={a.system} size="lg" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{a.name}</span>
                <span className="text-sm text-muted-foreground">{a.what}</span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <StatusDot
                  tone={a.complete ? "ready" : "blocked"}
                  label={a.complete ? "Complete" : "Incomplete"}
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {a.count}
                </span>
              </span>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Read-only on Jobber and QuickBooks. Gusto: fills drafts, never
            submits.
          </p>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Settings: {data.sources.settings}. Apps: sync runs for the current
        cycle.
      </p>
    </div>
  );
}
