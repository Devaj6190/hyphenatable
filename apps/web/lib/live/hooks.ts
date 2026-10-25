"use client";

import { useQueries, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  currentCycleId,
  infoOf,
  toCycle,
  toFlag,
  toQuestion,
} from "@/lib/live/adapt";
import type { LiveContext } from "@/lib/live/ids";
import type { Flag, ViewerRole } from "@/lib/types";
import type { Cycle, FlagInfo } from "@/lib/view-types";

// Live reads, each taking the viewerId for the role looking (owner id for the owner, the manager's worker id for the
// manager). Convex redacts pay for a manager on the server (convex/lib/viewer.ts), so what comes back is already
// the right version for that viewer. Call these inside a LiveBoundary: a server error throws.
export const viewerIdFor = (
  ctx: LiveContext,
  role: ViewerRole,
): Id<"workers"> | null =>
  role === "manager" ? ctx.ids.managerId : ctx.ids.ownerId;

export type LiveFlags =
  | { status: "loading" }
  | { status: "no-viewer" }
  | {
      status: "ready";
      viewerId: Id<"workers">;
      /** The cycle the flags belong to; null when Convex has no cycles for this company yet. */
      cycle: Cycle | null;
      flags: Flag[];
    };

const NO_FLAGS: Flag[] = [];

/** flags.list for the viewer, narrowed to the current cycle. */
export function useLiveFlags(ctx: LiveContext, role: ViewerRole): LiveFlags {
  const viewerId = viewerIdFor(ctx, role);
  const { companyId } = ctx.ids;
  const cycles = useQuery(api.cycles.list, { companyId });
  const docs = useQuery(
    api.flags.list,
    viewerId ? { companyId, viewerId } : "skip",
  );
  const cycleId = cycles && docs ? currentCycleId(cycles, docs) : null;
  // Stable between renders: useLiveInfo keys its subscriptions on this array, so a new one every render would loop.
  const flags = useMemo(
    () =>
      docs
        ? docs
            .filter((f) => f.cycleId === cycleId)
            .map((f) => toFlag(f, ctx.companyKey))
        : NO_FLAGS,
    [docs, cycleId, ctx.companyKey],
  );
  if (!viewerId) return { status: "no-viewer" };
  if (cycles === undefined || docs === undefined) return { status: "loading" };
  const cycle = cycles.find((c) => c._id === cycleId);
  return {
    status: "ready",
    viewerId,
    cycle: cycle ? toCycle(cycle) : null,
    flags,
  };
}

/**
 * The question behind each flag, from flags.get as the same viewer (flags.list does not carry it). `loading` is
 * true until every one has answered; a flag whose lookup fails simply has no question.
 */
export function useLiveInfo(
  ctx: LiveContext,
  viewerId: Id<"workers">,
  flags: Flag[],
): { info: Record<string, FlagInfo>; loading: boolean } {
  const requests = useMemo(
    () =>
      Object.fromEntries(
        flags
          .filter((f) => f.questionId)
          .map((f) => [
            f.id,
            {
              query: api.flags.get,
              args: { flagId: f.id as Id<"flags">, viewerId },
            },
          ]),
      ),
    [flags, viewerId],
  );
  const results = useQueries(requests);
  const info: Record<string, FlagInfo> = {};
  let loading = false;
  for (const f of flags) {
    if (!f.questionId) continue;
    const r = results[f.id];
    if (r === undefined) loading = true;
    else if (!(r instanceof Error) && r?.question)
      info[f.id] = infoOf(toQuestion(r.question, ctx.companyKey), ctx.names);
  }
  return { info, loading };
}
