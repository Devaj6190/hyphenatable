"use client";

import { useQuery } from "convex/react";
import type { ComponentProps } from "react";
import { FlagDetail } from "@/components/FlagDetail";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { useLive } from "@/components/LiveProvider";
import { useRole } from "@/components/RoleProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  recipientLabel,
  toCorrection,
  toFlag,
  toQuestion,
} from "@/lib/live/adapt";
import { useLiveFlags, viewerIdFor } from "@/lib/live/hooks";
import { type LiveContext, looksLikeConvexId } from "@/lib/live/ids";
import { FIXTURE_SOURCE } from "@/lib/sources";
import type { FlagDetailData } from "@/lib/view-types";

type Props = Omit<ComponentProps<typeof FlagDetail>, "source"> & {
  flagId: string;
};

function LiveDetail({
  ctx,
  note,
  flagId,
  fallback,
  ...rest
}: Props & {
  ctx: LiveContext;
  note: string | null;
  fallback: (note: string) => React.ReactNode;
}) {
  const { role } = useRole();
  const viewerId = viewerIdFor(ctx, role);
  const flags = useLiveFlags(ctx, role);
  const got = useQuery(
    api.flags.get,
    viewerId ? { flagId: flagId as Id<"flags">, viewerId } : "skip",
  );
  if (!viewerId) return fallback(`Convex has no ${role} for this company`);
  if (got === undefined || flags.status === "loading")
    return <p className="text-muted-foreground">Loading…</p>;

  const question = got?.question
    ? toQuestion(got.question, ctx.companyKey)
    : null;
  // flags.get returns null for a flag that does not exist or that this viewer may not see.
  const data: FlagDetailData | null = got
    ? {
        flag: toFlag(got.flag, ctx.companyKey),
        question,
        correction: got.correction
          ? toCorrection(got.correction, ctx.companyKey)
          : null,
        // Convex has no per-flag audit or message query for the dashboard yet.
        events: [],
        thread: null,
        recipientName: question ? recipientLabel(question, ctx.names) : null,
      }
    : null;
  return (
    <FlagDetail
      {...rest}
      data={data}
      flagIds={flags.status === "ready" ? flags.flags.map((f) => f.id) : []}
      roleOf={{
        [ctx.ids.ownerId]: "owner",
        ...(ctx.ids.managerId ? { [ctx.ids.managerId]: "manager" } : {}),
      }}
      source={`Convex flags.get as the ${role}${note ? ` (${note})` : ""}`}
    />
  );
}

// One flag: from Convex flags.get when the page is live and the id is a Convex id, else from the fixture the server
// sent. A fixture id ("a-flag-04") never goes to Convex.
export function FlagDetailSource(props: Props) {
  const { flagId, companyId } = props;
  const state = useLive();
  const fixture = (note?: string) => (
    <FlagDetail
      {...props}
      source={note ? `${FIXTURE_SOURCE} (${note})` : FIXTURE_SOURCE}
    />
  );
  if (state.status === "off" || !looksLikeConvexId(flagId)) return fixture();
  if (state.status === "loading")
    return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === "unavailable")
    return fixture(`live Convex unavailable: ${state.reason}`);
  if (state.ctx.companyKey !== companyId)
    return fixture(`no live data for company ${companyId.toUpperCase()}`);
  return (
    <LiveBoundary
      fallback={(e) => fixture(`live Convex failed: ${errorReason(e)}`)}
    >
      <LiveDetail
        {...props}
        ctx={state.ctx}
        note={state.note}
        fallback={fixture}
      />
    </LiveBoundary>
  );
}
