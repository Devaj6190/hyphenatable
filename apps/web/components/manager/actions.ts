"use client";

import { DEMO_MODE } from "@/lib/demo";
import { LOCAL_SOURCE, recordLocal } from "@/lib/demoLocal";
import type { AuditEvent } from "@/lib/types";
import type { ManagerItem } from "@/lib/view-types/manager";
import { EV } from "./inboxState";

// What the inbox's buttons do. ponytail: fixture mode only, recorded in this browser (lib/demoLocal). The live
// plug is here and nowhere else: "I updated it" becomes Devaj's re-pull of item.sources (need (a)), and an
// answer becomes the dashboard answer mutation (need (b)). Until then nothing is saved to Convex.
type Base = Omit<AuditEvent, "id" | "at" | "type" | "summary" | "refs">;

const SIM_DELAY_MS = 1300;

export function inboxActions({
  companyId,
  cycleId,
  managerId,
  ownerName,
}: {
  companyId: string;
  cycleId: string | null;
  managerId: string;
  ownerName: string;
}) {
  const base: Base = {
    companyId,
    cycleId,
    actor: { kind: "user", id: managerId, agent: null },
    data: { source: `Manager inbox, ${LOCAL_SOURCE}` },
  };
  const refs = (item: ManagerItem) => ({
    flagId: item.flagId,
    ...(item.sources[0]?.system === "Jobber"
      ? { entryId: item.sources[0].recordId }
      : {}),
  });
  const ids = (item: ManagerItem) =>
    item.sources.map((s) => s.recordId).join(", ");

  return {
    /** The manager says it is fixed in Jobber. A claim, not a check: only a re-check can close the item. */
    updated(item: ManagerItem, tries: number) {
      recordLocal({
        event: {
          ...base,
          type: EV.marked,
          summary: `Manager says ${ids(item)} is fixed in Jobber. Waiting for a re-check.`,
          refs: refs(item),
        },
      });
      // Outside demo mode there is no sync to run, so the item waits (JobberRecheck "waiting").
      if (!DEMO_MODE) return;
      const outcome =
        item.demoRecheck[Math.min(tries, item.demoRecheck.length) - 1];
      setTimeout(() => {
        recordLocal({
          event: {
            ...base,
            actor: { kind: "system", id: "demo", agent: null },
            type: outcome === "fixed" ? EV.fixed : EV.still,
            summary:
              outcome === "fixed"
                ? `Simulated re-check: ${item.checkId} no longer finds ${ids(item)}.`
                : `Simulated re-check: ${item.checkId} still finds ${ids(item)}.`,
            refs: refs(item),
            data: {
              source: `Simulated re-check (demo), ${LOCAL_SOURCE}`,
              simulated: true,
            },
          },
        });
      }, SIM_DELAY_MS);
    },
    /** One tap answer. It goes to the owner as a proposal; nothing changes in Jobber or in pay. */
    answer(item: ManagerItem, option: number) {
      recordLocal({
        event: {
          ...base,
          type: EV.answered,
          summary: `Manager answered “${item.question}”: ${item.options[option]}. Goes to ${ownerName} to approve.`,
          refs: { ...refs(item), option: String(option) },
        },
      });
    },
    undo(item: ManagerItem) {
      recordLocal({
        event: {
          ...base,
          type: EV.undone,
          summary: `Manager reopened ${item.flagId}.`,
          refs: refs(item),
        },
      });
    },
  };
}
