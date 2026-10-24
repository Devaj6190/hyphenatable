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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AUDIT_PREFIXES,
  cycleLabel,
  eventSource,
  forViewerEvents,
  isSimulated,
  typePrefix,
} from "@/lib/audit";
import {
  AUDIT_FIXTURE_SOURCE,
  fixtureAudit,
  fixtureFlags,
} from "@/lib/fixtures";
import type { AuditEvent } from "@/lib/types";

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

function Refs({ event }: { event: AuditEvent }) {
  const knownFlags = new Set(fixtureFlags.map((f) => f.id));
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
  companyId,
  dataKind,
}: {
  companyId: string;
  dataKind: DataKind;
}) {
  const { role } = useRole();
  const [prefix, setPrefix] = useState<string>("all");
  const [cycle, setCycle] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [simulatedOnly, setSimulatedOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);

  const visible = useMemo(
    () =>
      forViewerEvents(
        fixtureAudit.filter((e) => e.companyId === companyId),
        role,
      ),
    [companyId, role],
  );
  const cycles = useMemo(
    () => [...new Set(visible.map((e) => e.cycleId).filter(Boolean))].sort(),
    [visible],
  ) as string[];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = visible.filter(
      (e) =>
        (prefix === "all" || typePrefix(e) === prefix) &&
        (cycle === "all" || e.cycleId === cycle) &&
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
              {cycleLabel(c)}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead>Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                  {when.format(new Date(e.at))}
                  <div className="text-xs">{cycleLabel(e.cycleId)}</div>
                </TableCell>
                <TableCell className="align-top">
                  <AgentChip actor={e.actor} />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <Badge
                    variant="secondary"
                    className="h-auto rounded-lg text-left whitespace-normal"
                  >
                    {eventSource(e)}
                  </Badge>
                  <div className="mt-1">
                    <DataLabel kind={dataKind} />
                  </div>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
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
                  {role === "owner" && e.data?.effectPayCents != null && (
                    <div className="text-sm">
                      Effect on pay: <Money cents={e.data.effectPayCents} />{" "}
                      <span className="text-muted-foreground">
                        ({dataKind}, from the workbook)
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <Refs event={e} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
