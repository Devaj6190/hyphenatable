"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { DenyReason } from "@/components/DenyReason";
import { Money } from "@/components/Money";
import { SourceChip } from "@/components/SourceChip";
import { type Status, StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type Correction,
  isMoneyField,
  targetInWords,
} from "@/lib/corrections";
import type { ViewerRole } from "@/lib/types";

const sourceWord: Record<Correction["source"], string> = {
  reply: "From the reply",
  owner: "From you",
  rule: "From a rule",
};

const statusBadge: Record<
  Correction["status"],
  { status: Status; label: string }
> = {
  proposed: { status: "needs-you", label: "Correction waiting for you" },
  approved: { status: "verified", label: "Approved" },
  applied: { status: "verified", label: "Applied to workbook" },
  rejected: { status: "closed", label: "Denied" },
};

function Value({
  value,
  field,
  viewerRole,
}: {
  value: Correction["before"];
  field: string;
  viewerRole: ViewerRole;
}) {
  if (value === null) return <>{field === "jobId" ? "No job" : "None"}</>;
  if (isMoneyField(field) && typeof value === "number")
    return viewerRole === "owner" ? <Money cents={value} /> : <>hidden</>;
  return <>{String(value)}</>;
}

// Before → after → effect. The engine supplies both effects; this component never computes pay.
// Pay and profit are owner-only: a manager sees what changes, never what it costs.
export function CorrectionDiff({
  correction,
  dataKind,
  viewerRole,
  onDecided,
}: {
  correction: Correction;
  dataKind: DataKind;
  viewerRole: ViewerRole;
  onDecided?: (summary: string) => void;
}) {
  const [status, setStatus] = useState(correction.status);
  const [after, setAfter] = useState(correction.after);
  const [draft, setDraft] = useState(String(correction.after ?? ""));
  const [mode, setMode] = useState<"view" | "edit" | "deny">("view");
  const owner = viewerRole === "owner";
  const edited = after !== correction.after;
  const { target } = correction;
  const badge = statusBadge[status];
  const decidable = owner && status === "proposed";

  return (
    <Card className="@container gap-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-(--card-spacing)">
        <h2 className="text-lg font-semibold">Proposed correction</h2>
        <StatusBadge
          key={status}
          status={badge.status}
          label={badge.label}
          className="animate-in duration-(--dur-success) ease-out-soft fade-in zoom-in-95"
        />
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground @lg:ml-auto">
          <Badge>{sourceWord[correction.source]}</Badge>
          <AgentChip agent="auditor" />
        </span>
      </div>

      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <SourceChip system="Jobber" recordId={target.id} />
          {targetInWords(target)}
        </p>
        {/* Projector size: one line, large type, before struck through, after in full weight. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 rounded-card bg-muted/60 px-5 py-5 @lg:gap-6 @lg:px-8">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Before
            </span>
            <span className="text-2xl break-words text-muted-foreground line-through decoration-2 @lg:text-4xl">
              <Value
                value={correction.before}
                field={target.field}
                viewerRole={viewerRole}
              />
            </span>
          </div>
          <ArrowRight
            aria-label="changes to"
            className="mb-1.5 size-6 text-muted-foreground @lg:mb-2.5 @lg:size-8"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              After
            </span>
            <span
              key={String(after)}
              className="animate-in text-2xl font-semibold break-words duration-(--dur-success) fade-in @lg:text-4xl"
            >
              <Value
                value={after}
                field={target.field}
                viewerRole={viewerRole}
              />
            </span>
          </div>
        </div>
      </div>

      {owner ? (
        edited ? (
          <p className="mx-(--card-spacing) rounded-control border border-dashed px-4 py-3 text-sm text-muted-foreground">
            You changed the value, so the effect on pay and profit is out of
            date. PayrollPilot recalculates it when the change is saved. Fixture
            mode: not recalculated.
          </p>
        ) : (
          <dl className="grid gap-3 px-(--card-spacing) @lg:grid-cols-2">
            <Effect
              label="Effect on pay"
              cents={correction.effectPayCents}
              recordId={correction.id}
              dataKind={dataKind}
              strong
            />
            <Effect
              label="Effect on job profit"
              cents={correction.effectProfitCents}
              recordId={correction.id}
              dataKind={dataKind}
            />
          </dl>
        )
      ) : (
        <p className="px-(--card-spacing) text-sm text-muted-foreground">
          The owner reviews the effect on pay and approves corrections.
        </p>
      )}

      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <p className="text-sm text-muted-foreground">
          Changes the workbook only, never Jobber.
        </p>

        {decidable && mode === "edit" && (
          <form
            className="flex animate-in flex-wrap items-end gap-2 duration-(--dur-sheet) ease-out-soft fade-in slide-in-from-top-1"
            onSubmit={(e) => {
              e.preventDefault();
              setAfter(draft.trim());
              setMode("view");
            }}
          >
            <label
              htmlFor={`${correction.id}-after`}
              className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium"
            >
              New value
              <Input
                id={`${correction.id}-after`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-10 bg-card text-base"
              />
            </label>
            <Button type="submit" disabled={draft.trim() === ""}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(String(after ?? ""));
                setMode("view");
              }}
            >
              Cancel
            </Button>
          </form>
        )}

        {decidable && mode === "deny" && (
          <DenyReason
            what="correction"
            onCancel={() => setMode("view")}
            onDeny={(reason) => {
              setStatus("rejected");
              setMode("view");
              onDecided?.(`Denied the correction. Reason: ${reason}.`);
            }}
          />
        )}

        {decidable && mode === "view" && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              onClick={() => {
                setStatus("approved");
                onDecided?.(
                  `Approved the correction${edited ? " after editing it" : ""}: ${targetInWords(target)} → ${after ?? "none"}.`,
                );
              }}
            >
              Approve correction
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setMode("edit")}
            >
              Edit
            </Button>
            <Button size="lg" variant="quiet" onClick={() => setMode("deny")}>
              Deny
            </Button>
          </div>
        )}

        {status === "approved" && (
          <p className="animate-in text-sm duration-(--dur-success) fade-in">
            Approved by you. Fixture mode: the workbook is not saved. With the
            backend running, this shows the new workbook version.
          </p>
        )}
        {status === "rejected" && (
          <p className="animate-in text-sm duration-(--dur-success) fade-in">
            Denied by you. The workbook is unchanged and the item stays open.
          </p>
        )}
      </div>
    </Card>
  );
}

function Effect({
  label,
  cents,
  recordId,
  dataKind,
  strong = false,
}: {
  label: string;
  cents: number;
  recordId: string;
  dataKind: DataKind;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? "text-3xl font-semibold tracking-tight @2xl:text-4xl"
            : "text-2xl font-semibold"
        }
      >
        {cents === 0 ? "No change" : <Money cents={cents} signed />}
      </dd>
      <dd className="flex flex-wrap items-center gap-1.5">
        <SourceChip system="Workbook" recordId={recordId} />
        <DataLabel kind={dataKind} />
      </dd>
    </div>
  );
}
