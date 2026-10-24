"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { Money } from "@/components/Money";
import { useRole } from "@/components/RoleProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUDIT_PREFIXES,
  cycleLabel,
  eventSource,
  forViewerEvents,
  isSimulated,
  NO_CYCLE,
  typePrefix,
} from "@/lib/audit";
import { AUDIT_FIXTURE_SOURCE } from "@/lib/sources";
import type { AuditEvent } from "@/lib/types";
import type { AuditViewData } from "@/lib/view-types";

const when = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

const refLabel: Record<string, string> = {
  flagId: "flag",
  questionId: "question",
  correctionId: "correction",
  entryId: "entry",
  expenseId: "purchase",
  syncRunId: "sync run",
  draftId: "draft",
  ruleId: "rule",
};

function Refs({
  event,
  knownFlags,
}: {
  event: AuditEvent;
  knownFlags: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(event.refs).map(([k, v]) =>
        k === "flagId" && knownFlags.has(v) ? (
          <Link
            key={k}
            href={`/c/${event.companyId}/flags/${v}`}
            className="text-sm text-primary hover:underline"
          >
            flag {v}
          </Link>
        ) : (
          <span key={k} className="text-sm text-muted-foreground">
            {refLabel[k] ?? k} {v}
          </span>
        ),
      )}
    </div>
  );
}

// Everything shown comes from the events passed through forViewerEvents, so manager mode never holds pay.
export function AuditLog({
  data,
  dataKind,
}: {
  data: AuditViewData;
  dataKind: DataKind;
}) {
  const { role } = useRole();
  const [prefix, setPrefix] = useState<string>("all");
  const [cycle, setCycle] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [simulatedOnly, setSimulatedOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);

  const knownFlags = useMemo(
    () => new Set(data.linkableFlagIds),
    [data.linkableFlagIds],
  );
  // The server already redacted for this viewer; forViewerEvents re-applies the same policy for the moment
  // after an owner switches to manager, before the refreshed data arrives.
  const visible = useMemo(
    () => forViewerEvents(data.events, role, knownFlags),
    [data.events, role, knownFlags],
  );
  // Options come from the events themselves: each real cycle, plus Onboarding for events outside any cycle.
  const cycles = useMemo(
    () => [...new Set(visible.map((e) => e.cycleId ?? NO_CYCLE))].sort(),
    [visible],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = visible.filter(
      (e) =>
        (prefix === "all" || typePrefix(e) === prefix) &&
        (cycle === "all" || (e.cycleId ?? NO_CYCLE) === cycle) &&
        (!simulatedOnly || isSimulated(e)) &&
        (q === "" ||
          `${e.summary} ${e.type} ${eventSource(e)}`.toLowerCase().includes(q)),
    );
    rows.sort((a, b) => a.at.localeCompare(b.at));
    return newestFirst ? rows.reverse() : rows;
  }, [visible, prefix, cycle, query, simulatedOnly, newestFirst]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {["all", ...AUDIT_PREFIXES].map((p) => (
          <Button
            key={p}
            size="sm"
            variant={prefix === p ? "default" : "outline"}
            aria-pressed={prefix === p}
            onClick={() => setPrefix(p)}
          >
            {p === "all" ? "All" : p}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search the log"
          aria-label="Search the log"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Cycle"
          className="h-8 rounded-lg border bg-card px-2 text-sm"
          value={cycle}
          onChange={(e) => setCycle(e.target.value)}
        >
          <option value="all">All cycles</option>
          {cycles.map((c) => (
            <option key={c} value={c}>
              {cycleLabel(c === NO_CYCLE ? null : c)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={simulatedOnly}
            onChange={(e) => setSimulatedOnly(e.target.checked)}
          />
          Simulated only
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNewestFirst((v) => !v)}
        >
          {newestFirst ? "Newest first" : "Oldest first"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {shown.length} of {visible.length} events · Source:{" "}
        {AUDIT_FIXTURE_SOURCE} · {dataKind}
      </p>

      {shown.length === 0 ? (
        <p>No events match.</p>
      ) : (
        <div>
          <div className="hidden grid-cols-[8rem_8rem_1fr_9rem] gap-4 border-b px-2 pb-2 text-sm font-medium text-muted-foreground lg:grid">
            <span>Time</span>
            <span>Who</span>
            <span>What happened</span>
            <span>Links</span>
          </div>
          {/* One layout for every width: stacked on a phone, a four-column grid from lg. */}
          <ol>
            {shown.map((e) => (
              <li
                key={e.id}
                data-audit-row
                className="grid gap-2 border-b px-2 py-3 lg:grid-cols-[8rem_8rem_1fr_9rem] lg:gap-4"
              >
                <div className="flex items-center justify-between gap-2 lg:contents">
                  <div className="text-sm text-muted-foreground lg:col-start-1 lg:row-start-1">
                    {when.format(new Date(e.at))}
                    <div className="text-xs">{cycleLabel(e.cycleId)}</div>
                  </div>
                  <div className="lg:col-start-2 lg:row-start-1">
                    <AgentChip actor={e.actor} />
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1 lg:col-start-3 lg:row-start-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{e.summary}</span>
                    {isSimulated(e) && (
                      <Badge
                        variant="outline"
                        className="border-destructive text-destructive"
                      >
                        Simulated
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{e.type}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="h-auto rounded-lg text-left whitespace-normal"
                    >
                      {eventSource(e)}
                    </Badge>
                    <DataLabel kind={dataKind} />
                  </div>
                  {role === "owner" && e.data?.effectPayCents != null && (
                    <div className="text-sm">
                      Effect on pay: <Money cents={e.data.effectPayCents} />{" "}
                      <span className="text-muted-foreground">
                        ({dataKind}, from the workbook)
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 lg:col-start-4 lg:row-start-1">
                  <Refs event={e} knownFlags={knownFlags} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
