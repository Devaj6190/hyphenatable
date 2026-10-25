"use client";

import { useQuery } from "convex/react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { LiveCompany } from "@/components/LiveCompany";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useLiveCycle } from "@/lib/live/hooks";
import type { LiveContext } from "@/lib/live/ids";

const statusWords = {
  computed: "Computed, not yet approved",
  approved: "Gate 1 approved",
  filled: "Gusto draft filled",
  calculated: "Gusto draft calculated",
} as const;

type Line = Doc<"drafts">["lines"][number];
const hoursOf = (line: Line, name: Line["hourly"][number]["name"]) =>
  line.hourly.find((h) => h.name === name)?.hours ?? 0;

function Body({
  ctx,
  note,
  dataKind,
  realPayroll,
}: {
  ctx: LiveContext;
  note: string | null;
  dataKind: DataKind;
  realPayroll: boolean;
}) {
  const cycle = useLiveCycle(ctx);
  const cycleId =
    cycle.status === "ready" && cycle.cycle
      ? (cycle.cycle.id as Id<"cycles">)
      : null;
  // Pay, so the owner's id only: drafts.get refuses anyone else, and the page never renders this for a manager.
  const draft = useQuery(
    api.drafts.get,
    cycleId
      ? { cycleId, stage: 1, viewerId: ctx.ids.ownerId as Id<"workers"> }
      : "skip",
  );
  if (cycle.status === "loading" || (cycleId && draft === undefined))
    return <p className="text-muted-foreground">Loading…</p>;
  if (!cycleId)
    return (
      <p className="text-muted-foreground">
        Convex has no cycle for this company yet.
      </p>
    );
  if (!draft)
    return (
      <p className="text-muted-foreground">
        No Stage 1 draft yet for this cycle.
      </p>
    );

  const name = (id: string) => ctx.names[id] ?? id;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          status={draft.status === "computed" ? "needs-you" : "verified"}
          label={statusWords[draft.status]}
        />
        <span className="text-sm text-muted-foreground">
          Workbook version {draft.workbookVersion}
        </span>
        <DataLabel kind={dataKind} />
      </div>
      <p>
        {draft.lines.length} {draft.lines.length === 1 ? "worker" : "workers"},{" "}
        <span className="tabular-nums">{draft.totals.hours}</span> hours,{" "}
        <Money cents={draft.totals.grossCents} /> gross wages
      </p>
      <div className="overflow-x-auto rounded-card border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Worker</th>
              <th className="px-3 py-2 text-right font-medium">Regular h</th>
              <th className="px-3 py-2 text-right font-medium">Overtime h</th>
              <th className="px-3 py-2 text-right font-medium">Double OT h</th>
              <th className="px-3 py-2 font-medium">Fixed pay</th>
              <th className="px-3 py-2 font-medium">Held</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((line) => (
              <tr
                key={line.workerId}
                className={
                  line.excluded ? "border-t text-muted-foreground" : "border-t"
                }
              >
                <td className="px-3 py-2">
                  {name(line.workerId)}
                  {line.excluded && " (left out of the draft)"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hoursOf(line, "Regular Hours")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hoursOf(line, "Overtime")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hoursOf(line, "Double Overtime")}
                </td>
                <td className="px-3 py-2">
                  {line.fixed.length === 0
                    ? "None"
                    : line.fixed.map((f) => (
                        <span key={f.name} className="mr-3 inline-block">
                          {f.name} <Money cents={f.amountCents} />
                        </span>
                      ))}
                </td>
                <td className="px-3 py-2 text-hold">
                  {line.heldFlagIds.length > 0
                    ? `${line.heldFlagIds.length} item${line.heldFlagIds.length === 1 ? "" : "s"} held`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft.venmoList.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            Paid by Venmo, outside Gusto
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {draft.venmoList.map((v) => (
              <li key={v.workerId}>
                {name(v.workerId)}:{" "}
                <span className="tabular-nums">{v.hours}</span> h at{" "}
                <Money cents={v.rateCents} /> an hour,{" "}
                <Money cents={v.amountCents} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        Draft only. RollPay never submits payroll.
        {realPayroll &&
          " This is real payroll, so RollPay never fills its Gusto draft either."}
      </p>
      <p className="text-xs text-muted-foreground">
        Source: Convex drafts.get, Stage 1, as the owner
        {note ? ` (${note})` : ""}. Amounts are the draft&apos;s own; nothing
        here is computed.
      </p>
    </div>
  );
}

// The workbook for a company with no fixtures (Company R): the Stage 1 draft exactly as Convex holds it. Owner only.
// The fixture workbook's per-worker rates, weeks and job profit need data drafts.get does not return.
export function LiveWorkbook({
  companyId,
  label,
  dataKind,
}: {
  companyId: string;
  label: string;
  dataKind: DataKind;
}) {
  return (
    <>
      <PageHeader title="Workbook" />
      <LiveCompany companyId={companyId} label={label}>
        {(ctx, note) => (
          <Body
            ctx={ctx}
            note={note}
            dataKind={dataKind}
            realPayroll={dataKind === "real, anonymized"}
          />
        )}
      </LiveCompany>
    </>
  );
}
