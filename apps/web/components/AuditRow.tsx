"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { AgentChip, type AgentKind } from "@/components/AgentChip";
import { Money } from "@/components/Money";
import { SimulatedChip } from "@/components/SimulatedChip";
import { SourceChip } from "@/components/SourceChip";
import {
  categoryLabel,
  cycleLabel,
  eventSource,
  isSimulated,
  sourceRecord,
} from "@/lib/audit";
import { formatWhen } from "@/lib/time";
import type { AuditEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  item,
  onItem,
  linkable,
}: {
  event: AuditEvent;
  item: string | null;
  onItem: (id: string | null) => void;
  linkable: ReadonlySet<string>;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {Object.entries(event.refs).map(([k, v]) => (
        <li key={k} className="inline-flex items-center gap-0.5">
          <button
            type="button"
            aria-pressed={item === v}
            title={item === v ? "Show every event" : "Show only this item"}
            onClick={() => onItem(item === v ? null : v)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs whitespace-nowrap transition-colors duration-(--dur-hover) outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              item === v
                ? "border-foreground bg-foreground text-background"
                : "border-input bg-card text-foreground hover:bg-muted",
            )}
          >
            <span
              className={
                item === v ? "text-background/80" : "text-muted-foreground"
              }
            >
              {refLabel[k] ?? k}
            </span>{" "}
            {v}
          </button>
          {k === "flagId" && linkable.has(v) && (
            <Link
              href={`/c/${event.companyId}/flags/${v}`}
              aria-label={`Open flag ${v}`}
              className="rounded-full p-0.5 text-link outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

// One append-only line: time, who, what, where it came from, the records it touches.
// `showPay` is true only for the owner; managers get events with the pay effect already removed.
export function AuditRow({
  event: e,
  timezone,
  actor,
  linkable,
  showPay,
  dataKind,
  item,
  onItem,
}: {
  event: AuditEvent;
  timezone: string;
  actor: AgentKind;
  linkable: ReadonlySet<string>;
  showPay: boolean;
  dataKind: string;
  item: string | null;
  onItem: (id: string | null) => void;
}) {
  const source = sourceRecord(e);
  const pay = showPay ? e.data?.effectPayCents : undefined;
  const chip = <AgentChip agent={actor} />;
  return (
    <tr className="border-b align-top transition-colors duration-(--dur-hover) last:border-0 hover:bg-muted/40">
      <td className="py-3 pr-2 pl-4 text-muted-foreground tabular-nums md:pr-3 md:whitespace-nowrap">
        <time dateTime={e.at}>{formatWhen(e.at, timezone)}</time>
        <div className="text-xs">{cycleLabel(e.cycleId)}</div>
      </td>
      <td className="hidden px-3 py-3 md:table-cell">{chip}</td>
      <td className="hidden px-3 py-3 whitespace-nowrap md:table-cell">
        {categoryLabel(e)}
      </td>
      <td className="px-3 py-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
          {chip}
          <span className="text-xs text-muted-foreground">
            {categoryLabel(e)}
          </span>
        </div>
        <p className="text-[0.9375rem] text-foreground">
          {e.summary}
          {isSimulated(e) && <SimulatedChip className="ml-2 align-middle" />}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <code className="font-mono">{e.type}</code>
          <span aria-hidden>·</span>
          {source ? (
            <SourceChip system={source.system} recordId={source.recordId} />
          ) : (
            <span>via {eventSource(e)}</span>
          )}
        </p>
        {pay != null && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span>
              Effect on pay: <Money cents={pay} className="font-medium" />
            </span>
            <span className="text-muted-foreground">
              {dataKind}, from the workbook
            </span>
            {e.refs.flagId && (
              <button
                type="button"
                onClick={() => onItem(e.refs.flagId)}
                className="font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Trace this number
              </button>
            )}
          </p>
        )}
        <div className="mt-2 md:hidden">
          <Refs event={e} item={item} onItem={onItem} linkable={linkable} />
        </div>
      </td>
      <td className="hidden py-3 pr-4 pl-3 md:table-cell">
        <Refs event={e} item={item} onItem={onItem} linkable={linkable} />
      </td>
    </tr>
  );
}
