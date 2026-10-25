"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  AppMark,
  FilterChip,
  FoundIn,
  Initials,
  StatusDot,
} from "@/components/company/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { companies } from "@/lib/companies";
import { routes } from "@/lib/routes";
import { useRuleStore } from "@/lib/ruleStore";
import { cn } from "@/lib/utils";
import type { CompanyPerson, CompanyViewData } from "@/lib/view-types/company";

type Filter = "all" | "look" | CompanyPerson["kind"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "look", label: "Needs a look" },
  { id: "hourly", label: "Hourly" },
  { id: "salary", label: "Salary" },
  { id: "venmo", label: "Venmo" },
];

const matches = (p: CompanyPerson, f: Filter) =>
  f === "all" || (f === "look" ? p.needsLook : p.kind === f);

const syncedWords = (iso: string | null, timeZone: string) =>
  iso
    ? `Synced ${new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone,
      }).format(new Date(iso))}`
    : "Not synced yet";

export function PeopleTab({
  companyId,
  data,
  synthetic,
}: {
  companyId: string;
  data: CompanyViewData;
  synthetic: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const first = data.people.find((p) => p.needsLook) ?? data.people[0];
  const [selectedId, setSelectedId] = useState(first?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = data.people.find((p) => p.id === selectedId) ?? null;

  if (!data.people.length)
    return (
      <div className="rounded-card border border-dashed border-input bg-card p-6">
        <p className="font-medium">No people on record for this company yet.</p>
        <p className="mt-1 text-muted-foreground">
          People appear once Jobber and Gusto are synced.
        </p>
      </div>
    );

  // Needs a look first, then the rest, each in roster order.
  const ordered = [
    ...data.people.filter((p) => p.needsLook),
    ...data.people.filter((p) => !p.needsLook),
  ];
  const shown = ordered.filter((p) => matches(p, filter));
  const lookCount = data.people.filter((p) => p.needsLook).length;
  const readyLabel = data.canSeePay ? "Ready to pay" : "Nothing open";

  const pick = (id: string) => {
    setSelectedId(id);
    // Desktop shows the panel beside the table; on a phone it opens as a bottom sheet.
    if (!window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true);
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section
        aria-labelledby="people-title"
        className="overflow-hidden rounded-card border bg-card shadow-card"
      >
        <div className="flex flex-col gap-3 p-4 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="people-title" className="text-lg font-bold">
              People{data.canSeePay ? " and pay" : ""}
            </h2>
            <span className="text-sm text-muted-foreground">
              {data.people.length} people
            </span>
            <span className="text-sm text-muted-foreground">
              {syncedWords(
                data.syncedAt,
                companies[companyId]?.timezone ?? "UTC",
              )}
              {synthetic ? " · synthetic" : ""}
            </span>
          </div>
          <fieldset className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <legend className="sr-only">Filter people</legend>
            {FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                label={f.label}
                count={data.people.filter((p) => matches(p, f.id)).length}
                pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              />
            ))}
          </fieldset>
        </div>

        <div
          aria-hidden
          className={cn(
            "hidden gap-3 border-t px-5 py-2 text-[11px] font-bold tracking-wider text-muted-foreground md:grid",
            data.canSeePay
              ? "grid-cols-[minmax(0,2fr)_66px_minmax(0,1.3fr)_56px_minmax(0,1.2fr)]"
              : "grid-cols-[minmax(0,2fr)_66px_56px_minmax(0,1.2fr)]",
          )}
        >
          <span>PERSON</span>
          <span>FOUND IN</span>
          {data.canSeePay && <span>PAY</span>}
          <span className="text-right">HOURS</span>
          <span>STATUS</span>
        </div>

        <ul aria-label="People">
          {shown.map((p, i) => {
            const group = p.needsLook ? "look" : "ok";
            const prev = shown[i - 1];
            const showGroup = !prev || prev.needsLook !== p.needsLook;
            const sel = p.id === selectedId;
            return (
              <li key={p.id}>
                {showGroup && (
                  <p className="border-t px-5 pt-3.5 pb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    {group === "look"
                      ? `Needs a look · ${lookCount}`
                      : `${readyLabel} · ${data.people.length - lookCount}`}
                  </p>
                )}
                <button
                  type="button"
                  aria-pressed={sel}
                  onClick={() => pick(p.id)}
                  className={cn(
                    "grid min-h-15 w-full items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-left transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5",
                    "grid-cols-[minmax(0,1fr)_auto]",
                    data.canSeePay
                      ? "md:grid-cols-[minmax(0,2fr)_66px_minmax(0,1.3fr)_56px_minmax(0,1.2fr)]"
                      : "md:grid-cols-[minmax(0,2fr)_66px_56px_minmax(0,1.2fr)]",
                    sel
                      ? "bg-accent shadow-[inset_3px_0_0_var(--sunset-2)]"
                      : "hover:bg-muted/60",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Initials text={p.initials} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">
                        {p.displayName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {p.roleLabel}
                        <span className="md:hidden">
                          {p.hours !== null ? ` · ${p.hours.toFixed(1)} h` : ""}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="hidden md:flex">
                    <FoundIn foundIn={p.foundIn} />
                  </span>
                  {data.canSeePay && p.pay && (
                    <span className="hidden min-w-0 flex-col md:flex">
                      <span
                        className={cn(
                          "truncate text-sm font-bold whitespace-nowrap tabular-nums",
                          p.tone === "blocked" &&
                            p.kind === "venmo" &&
                            "text-destructive",
                        )}
                      >
                        {p.pay.main}
                      </span>
                      {p.pay.sub && (
                        <span className="truncate text-xs text-muted-foreground">
                          {p.pay.sub}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="hidden text-right text-sm tabular-nums md:block">
                    {p.hours !== null ? p.hours.toFixed(1) : "—"}
                  </span>
                  <span className="flex flex-col items-end gap-0.5 md:items-start">
                    <StatusDot tone={p.tone} label={p.label} />
                    {data.canSeePay && p.pay && (
                      <span className="text-xs font-semibold tabular-nums md:hidden">
                        {p.pay.main}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && (
          <p className="border-t p-5 text-muted-foreground">
            Nobody in this view.
          </p>
        )}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          People: {data.sources.roster}. Hours: {data.sources.hours}, summed as
          recorded, before checks. Status: {data.sources.flags}.
          {data.canSeePay ? ` Pay history: ${data.sources.payrolls}.` : ""}
        </p>
      </section>

      {selected && (
        <aside
          aria-label={`${selected.displayName} details`}
          className="sticky top-4 hidden rounded-card border bg-card p-5 shadow-card lg:block"
        >
          <PersonDetail
            key={selected.id}
            companyId={companyId}
            person={selected}
          />
        </aside>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="lg:hidden">
          <SheetHeader>
            <SheetTitle>{selected?.displayName ?? "Person"}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8">
            {selected && (
              <PersonDetail
                key={selected.id}
                companyId={companyId}
                person={selected}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const TILE_NAME = { jobber: "Jobber", gusto: "Gusto", rule: "Rule" } as const;

function PersonDetail({
  companyId,
  person: p,
}: {
  companyId: string;
  person: CompanyPerson;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Initials text={p.initials} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-bold">{p.displayName}</span>
          <span className="text-sm text-muted-foreground">{p.roleLabel}</span>
        </span>
        <StatusDot tone={p.tone} label={p.label} className="shrink-0" />
      </div>

      {p.pay && (
        <div className="grid grid-cols-3 gap-2">
          {p.pay.tiles.map((t) => (
            <div
              key={t.system}
              className={cn(
                "flex min-w-0 flex-col gap-1.5 rounded-xl border p-3",
                t.warn ? "border-link/30 bg-accent" : "bg-background",
              )}
              title={t.source ?? undefined}
            >
              <span className="flex items-center gap-1.5">
                <AppMark app={t.system} />
                <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  {TILE_NAME[t.system]}
                </span>
              </span>
              <span className="text-sm font-bold break-words tabular-nums">
                {t.value}
              </span>
              {t.source && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {t.source}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-sm">{p.note}</p>

      {p.hours !== null && (
        <p className="text-sm text-muted-foreground">
          {p.hours.toFixed(1)} h this cycle from {p.hourEntryIds.length} Jobber{" "}
          entr{p.hourEntryIds.length === 1 ? "y" : "ies"}.
        </p>
      )}

      {p.pay && (
        <div className="flex flex-col">
          <span className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground">
            PAY HISTORY
          </span>
          <ol>
            {p.pay.history.map((h, i, all) => (
              <li key={h.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < all.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-4 bottom-0 left-1.5 w-0.5",
                      i === 0
                        ? "bg-linear-to-b from-sunset-2 to-border"
                        : "bg-border",
                    )}
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 rounded-full",
                    i === 0
                      ? "bg-sunset ring-4 ring-accent"
                      : "border-2 border-input bg-card",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">{h.period}</span>
                  <span className="text-sm text-muted-foreground">
                    {h.text}
                    {h.recordIds.length > 0 && (
                      <span className="sr-only">
                        {" "}
                        (record {h.recordIds.join(", ")})
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {p.pay && (p.kind === "hourly" || p.kind === "venmo") && (
        <RateChange companyId={companyId} person={p} />
      )}

      {(p.flagIds.length > 0 || p.otherFlagIds.length > 0) && (
        <Link
          href={routes.home(companyId)}
          className="text-sm font-semibold text-link underline-offset-4 hover:underline"
        >
          Resolve on Home ›
        </Link>
      )}
    </div>
  );
}

const RATE = /^\d{1,4}(\.\d{1,2})?$/;

/** Writes an owner-stated rule (session-only until rules functions are live). Never touches Gusto or Jobber. */
function RateChange({
  companyId,
  person,
}: {
  companyId: string;
  person: CompanyPerson;
}) {
  const store = useRuleStore(companyId, []);
  const [state, setState] = useState<"closed" | "open" | "saved">("closed");
  const [value, setValue] = useState("");
  const inputId = useId();
  const valid = RATE.test(value.trim());

  if (state === "closed")
    return (
      <Button variant="secondary" onClick={() => setState("open")}>
        Change rate in your rules
      </Button>
    );
  if (state === "saved")
    return (
      <p className="rounded-control bg-ok-soft p-3 text-sm text-ok">
        ✓ Saved as a rule you stated. It stays proposed until you confirm it in{" "}
        <Link
          href={routes.company(companyId, "rules")}
          className="font-semibold underline underline-offset-4"
        >
          Rules
        </Link>
        .
      </p>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        // The owner's own words, stored as typed. RollPay restates and backtests it before it applies.
        store.addStated(
          `${person.displayName} is paid $${value.trim()} an hour${person.kind === "venmo" ? " on Venmo" : ""}.`,
          person.pay?.ruleId ?? null,
        );
        setState("saved");
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <label htmlFor={inputId} className="shrink-0">
          New rate per hour
        </label>
        <span className="flex items-center gap-1">
          $
          <Input
            id={inputId}
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={value !== "" && !valid}
            className="w-24"
          />
          /h
        </span>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid}>
          Save to rules
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setState("closed")}
        >
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes RollPay's rule only. Update Gusto and Jobber too; the next sync
        checks they match.
      </p>
    </form>
  );
}
