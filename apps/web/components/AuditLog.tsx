"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AuditRow } from "@/components/AuditRow";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { useRole } from "@/components/RoleProvider";
import { Segmented } from "@/components/Segmented";
import { SimulatedChip } from "@/components/SimulatedChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUDIT_TYPES,
  actorKind,
  category,
  cycleLabel,
  eventSource,
  forViewerEvents,
  isLocal,
  isSimulated,
  NO_CYCLE,
} from "@/lib/audit";
import { LOCAL_SOURCE, useDemoLocal } from "@/lib/demoLocal";
import { AUDIT_FIXTURE_SOURCE } from "@/lib/sources";
import { cn } from "@/lib/utils";
import type { AuditViewData } from "@/lib/view-types";

const selectClass =
  "h-10 rounded-control border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring";

const actorWord: Record<string, string> = { simulated: "Simulated persona" };
const word = (k: string) => actorWord[k] ?? k[0].toUpperCase() + k.slice(1);

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-hover) outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
        on
          ? "bg-foreground text-background"
          : "bg-muted text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

// The server already redacted for this viewer; forViewerEvents re-applies the same policy (also to this
// browser's demo rows) for the moment after a role switch, before the refresh lands.
export function AuditLog({
  data,
  dataKind,
  timezone: tz,
  companyId,
  companyLabel,
  managerIds,
  source = AUDIT_FIXTURE_SOURCE,
}: {
  data: AuditViewData;
  dataKind: DataKind;
  timezone: string;
  companyId: string;
  companyLabel: string;
  managerIds: string[];
  /** Where the events come from; the fixture file unless the page is live. */
  source?: string;
}) {
  const { role } = useRole();
  const local = useDemoLocal();
  const [type, setType] = useState("all");
  const [actor, setActor] = useState("all");
  const [cycle, setCycle] = useState("all");
  const [day, setDay] = useState("all");
  const [item, setItem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [simulatedOnly, setSimulatedOnly] = useState(false);
  const [order, setOrder] = useState<"oldest" | "newest">("oldest");

  const dayOf = useMemo(() => {
    const d = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: tz,
    });
    return (at: string) => d.format(new Date(at));
  }, [tz]);
  const managers = useMemo(() => new Set(managerIds), [managerIds]);
  const linkable = useMemo(
    () => new Set(data.linkableFlagIds),
    [data.linkableFlagIds],
  );

  const visible = useMemo(
    () =>
      forViewerEvents(
        [
          ...data.events,
          ...local.events.filter((e) => e.companyId === companyId),
        ],
        role,
        linkable,
      ).sort((a, b) => a.at.localeCompare(b.at)),
    [data.events, companyId, role, local.events, linkable],
  );
  const options = useMemo(
    () => ({
      cycles: [...new Set(visible.map((e) => e.cycleId ?? NO_CYCLE))],
      days: [...new Set(visible.map((e) => dayOf(e.at)))],
      actors: [...new Set(visible.map((e) => actorKind(e.actor, managers)))],
    }),
    [visible, dayOf, managers],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = visible.filter(
      (e) =>
        (type === "all" || category(e) === type) &&
        (actor === "all" || actorKind(e.actor, managers) === actor) &&
        (cycle === "all" || (e.cycleId ?? NO_CYCLE) === cycle) &&
        (day === "all" || dayOf(e.at) === day) &&
        (item === null || Object.values(e.refs).includes(item)) &&
        (!simulatedOnly || isSimulated(e)) &&
        (q === "" ||
          `${e.summary} ${e.type} ${eventSource(e)} ${Object.values(e.refs).join(" ")}`
            .toLowerCase()
            .includes(q)),
    );
    return order === "newest" ? rows.reverse() : rows;
  }, [
    visible,
    type,
    actor,
    cycle,
    day,
    item,
    simulatedOnly,
    query,
    order,
    dayOf,
    managers,
  ]);

  const filtered =
    type !== "all" ||
    actor !== "all" ||
    cycle !== "all" ||
    day !== "all" ||
    item !== null ||
    simulatedOnly ||
    query !== "";
  const clear = () => {
    setType("all");
    setActor("all");
    setCycle("all");
    setDay("all");
    setItem(null);
    setSimulatedOnly(false);
    setQuery("");
  };

  const localCount = visible.filter(isLocal).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <DataLabel kind={dataKind} detail={companyLabel} />
        <span className="tabular-nums">
          {visible.length - localCount} events
          {localCount > 0 && ` + ${localCount} demo rows`}
        </span>
        <span aria-hidden>·</span>
        <span>
          Source: {source}
          {localCount > 0 &&
            `. Demo rows come from the demo panel and inbox, ${LOCAL_SOURCE}, and are not part of the log`}
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-card border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-60">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              className="h-10 pl-9"
              placeholder="Search the log"
              aria-label="Search the log"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Actor"
            className={selectClass}
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            <option value="all">Everyone</option>
            {options.actors.map((a) => (
              <option key={a} value={a}>
                {word(a)}
              </option>
            ))}
          </select>
          <select
            aria-label="Cycle"
            className={selectClass}
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
          >
            <option value="all">All cycles</option>
            {options.cycles.map((c) => (
              <option key={c} value={c}>
                {cycleLabel(c === NO_CYCLE ? null : c)}
              </option>
            ))}
          </select>
          <select
            aria-label="Day"
            className={selectClass}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            <option value="all">Any day</option>
            {options.days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <Segmented
            label="Order"
            size="sm"
            value={order}
            onValueChange={setOrder}
            options={[
              { value: "oldest", label: "Oldest first" },
              { value: "newest", label: "Newest first" },
            ]}
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <Chip on={type === "all"} onClick={() => setType("all")}>
            All
          </Chip>
          {AUDIT_TYPES.map((t) => {
            const n = visible.filter((e) => category(e) === t.value).length;
            if (n === 0) return null;
            return (
              <Chip
                key={t.value}
                on={type === t.value}
                onClick={() => setType(type === t.value ? "all" : t.value)}
              >
                {t.label}
                <span className="tabular-nums opacity-70">{n}</span>
              </Chip>
            );
          })}
          <Chip on={simulatedOnly} onClick={() => setSimulatedOnly((v) => !v)}>
            Simulated only
          </Chip>
        </div>
      </div>

      {(item || filtered) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {item && (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground py-1 pr-1 pl-3 text-background">
              Only events for {item}
              <button
                type="button"
                aria-label={`Stop filtering by ${item}`}
                onClick={() => setItem(null)}
                className="rounded-full p-0.5 outline-none hover:bg-background/20 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
              >
                <X aria-hidden className="size-4" />
              </button>
            </span>
          )}
          {filtered && (
            <Button size="sm" variant="quiet" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="overflow-clip rounded-card border bg-card shadow-card">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Audit events, {order} first. Append-only.
          </caption>
          <thead className="sticky top-0 z-10 bg-muted text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <tr className="border-b">
              <th
                scope="col"
                className="w-24 py-2.5 pr-2 pl-4 text-left md:w-36 md:pr-3"
              >
                Time
              </th>
              <th
                scope="col"
                className="hidden w-40 px-3 text-left md:table-cell"
              >
                Actor
              </th>
              <th
                scope="col"
                className="hidden w-28 px-3 text-left md:table-cell"
              >
                Type
              </th>
              <th scope="col" className="px-3 text-left">
                What happened
              </th>
              <th
                scope="col"
                className="hidden w-52 pr-4 pl-3 text-left md:table-cell"
              >
                Record
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <AuditRow
                key={e.id}
                event={e}
                timezone={tz}
                actor={actorKind(e.actor, managers)}
                linkable={linkable}
                showPay={role === "owner"}
                dataKind={dataKind}
                item={item}
                onItem={setItem}
              />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-4 py-10 text-center text-muted-foreground">
            No events match these filters.
          </p>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          Showing {shown.length} of {visible.length}
          {localCount > 0 && ` (${localCount} demo rows, this browser only)`} ·{" "}
          {order} first
        </span>
        {visible.some(isSimulated) && (
          <>
            <span aria-hidden>·</span>
            <SimulatedChip /> rows were written by the demo persona, not a
            person.
          </>
        )}
      </p>
    </div>
  );
}
