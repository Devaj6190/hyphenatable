"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Re-check states. Everything past "waiting" comes from a SyncRun the backend reports, never from a timer. */
export type Recheck =
  | { state: "idle" }
  | { state: "waiting" }
  | { state: "syncing"; pulled: number; expected: number }
  | { state: "incomplete"; pulled: number; expected: number }
  | { state: "fixed" | "still-there"; at: string; expected: number };

const when = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));

// "Mark fixed in Jobber": a person's claim, not a check. The page says "waiting" until a sync reports back,
// shows only the pulled/expected counts the sync records, and shows the result only once the check has re-run.
export function JobberRecheck({
  recordIds,
  checkId,
  timeZone,
  initial = { state: "idle" },
  onMarked,
}: {
  recordIds: string[];
  checkId: string;
  timeZone: string;
  initial?: Recheck;
  onMarked?: (marked: boolean) => void;
}) {
  const [recheck, setRecheck] = useState<Recheck>(initial);
  const records = recordIds.join(" and ");

  return (
    <Card size="sm" className="gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-(--card-spacing)">
        <h2 className="text-base font-semibold">Fix it in Jobber too</h2>
        <span
          key={recheck.state}
          className="animate-in duration-(--dur-success) fade-in"
        >
          {recheck.state === "waiting" && (
            <StatusBadge status="asked" label="Waiting for next sync" />
          )}
          {recheck.state === "syncing" && (
            <StatusBadge status="asked" label="Syncing Jobber" />
          )}
          {recheck.state === "incomplete" && (
            <StatusBadge status="sync-incomplete" />
          )}
          {recheck.state === "fixed" && (
            <StatusBadge status="verified" label="Re-checked: fixed" />
          )}
          {recheck.state === "still-there" && (
            <StatusBadge status="needs-you" label="Still in Jobber" />
          )}
        </span>
      </div>

      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-3 px-(--card-spacing)"
      >
        <p className="max-w-prose flex-[999_1_20rem] text-sm text-muted-foreground">
          {recheck.state === "idle" &&
            `Change ${records} in Jobber so it doesn't come back. The next sync re-checks it.`}
          {recheck.state === "waiting" &&
            `You marked ${records} fixed. Nothing is re-checked until the next Jobber sync reports back. Fixture mode: no sync runs here.`}
          {recheck.state === "syncing" &&
            `Pulled ${recheck.pulled} of ${recheck.expected} Jobber records so far. ${checkId} re-runs once the pull is complete.`}
          {recheck.state === "incomplete" &&
            `The sync pulled ${recheck.pulled} of ${recheck.expected} records, so ${checkId} can't re-run. The item stays held.`}
          {recheck.state === "fixed" &&
            `Sync at ${when(recheck.at, timeZone)} pulled ${recheck.expected} of ${recheck.expected} records. ${checkId} no longer finds this.`}
          {recheck.state === "still-there" &&
            `Sync at ${when(recheck.at, timeZone)} pulled ${recheck.expected} of ${recheck.expected} records and ${checkId} still finds this, so the item stays open.`}
        </p>
        {recheck.state === "idle" && (
          <Button
            variant="secondary"
            onClick={() => {
              setRecheck({ state: "waiting" });
              onMarked?.(true);
            }}
          >
            Mark fixed in Jobber
          </Button>
        )}
        {recheck.state === "waiting" && (
          <Button
            variant="quiet"
            onClick={() => {
              setRecheck({ state: "idle" });
              onMarked?.(false);
            }}
          >
            Undo
          </Button>
        )}
      </div>
    </Card>
  );
}
