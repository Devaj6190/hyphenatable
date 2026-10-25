"use client";

import type { ReactNode } from "react";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { useLive } from "@/components/LiveProvider";
import type { LiveContext } from "@/lib/live/ids";

/** Shown instead of a page body when a company with no fixtures has no live data either. */
export function NoLiveData({ label, why }: { label: string; why: string }) {
  return (
    <p className="rounded-card border bg-card p-5 text-muted-foreground">
      {label}&apos;s data is real and lives only in Convex, so nothing here
      comes from fixtures. Not available right now: {why}.
    </p>
  );
}

// For a company with no fixtures (Company R): the page body from live Convex, or the reason it can't be shown.
// Never falls back to another company's fixtures.
export function LiveCompany({
  companyId,
  label,
  children,
}: {
  companyId: string;
  label: string;
  children: (ctx: LiveContext, note: string | null) => ReactNode;
}) {
  const state = useLive();
  const none = (why: string) => <NoLiveData label={label} why={why} />;
  if (state.status === "off")
    return none("live Convex is not configured (NEXT_PUBLIC_CONVEX_URL)");
  if (state.status === "loading")
    return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === "unavailable")
    return none(`live Convex unavailable: ${state.reason}`);
  if (state.ctx.companyKey !== companyId)
    return none(
      `live data is set up for Company ${state.ctx.companyKey.toUpperCase()} (NEXT_PUBLIC_LIVE_COMPANY_KEY)`,
    );
  return (
    <LiveBoundary
      fallback={(e) => none(`live Convex failed: ${errorReason(e)}`)}
    >
      {children(state.ctx, state.note)}
    </LiveBoundary>
  );
}
