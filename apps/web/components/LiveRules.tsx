"use client";

import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { LiveCompany } from "@/components/LiveCompany";
import { useRole } from "@/components/RoleProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toRule } from "@/lib/live/adapt";
import type { LiveContext } from "@/lib/live/ids";
import { ruleInWords } from "@/lib/rules";
import type { RulesViewData } from "@/lib/view-types";

function Body({
  ctx,
  note,
  children,
}: {
  ctx: LiveContext;
  note: string | null;
  children: (data: RulesViewData) => ReactNode;
}) {
  const { role } = useRole();
  const owner = role === "owner";
  // rules.list returns every rule's params, and pay rules hold cents. It takes no viewer yet, so only the owner's
  // browser asks for it.
  const docs = useQuery(
    api.rules.list,
    owner ? { companyId: ctx.ids.companyId as Id<"companies"> } : "skip",
  );
  if (!owner)
    return (
      <p className="rounded-card border bg-card p-5 text-muted-foreground">
        Live rules are owner only for now: Convex returns them with their pay
        amounts, and no rule screen strips those for a manager yet.
      </p>
    );
  if (docs === undefined)
    return <p className="text-muted-foreground">Loading…</p>;

  const nameOf = (id: string) => ctx.names[id] ?? id;
  const source = `Convex rules.list, as the owner${note ? ` (${note})` : ""}`;
  const data: RulesViewData = {
    rules: docs.map((d) => {
      const rule = toRule(d, ctx.companyKey);
      // params stay out of the view, as in the fixture path: the words carry what the owner may read.
      return {
        ...rule,
        params: {},
        words: ruleInWords(rule, true, nameOf),
        evidence: null,
        summary: null,
      };
    }),
    ownerId: ctx.ids.ownerId,
    names: ctx.names,
    // Convex has no dashboard query for past cycles' evidence, sync runs or questions yet.
    cycles: [],
    incompleteSyncs: [],
    pastQuestions: [],
    missedQuestions: [],
    connected: { jobber: false, qbo: false, gusto: false },
    sources: {
      rules: source,
      cycles: "not available from Convex yet",
      questions: "not available from Convex yet",
      missed: "not available from Convex yet",
    },
  };
  return <>{children(data)}</>;
}

// Rules for a company with no fixtures (Company R), from Convex rules.list, handed to the same rule screens.
export function LiveRules({
  companyId,
  label,
  children,
}: {
  companyId: string;
  label: string;
  children: (data: RulesViewData) => ReactNode;
}) {
  return (
    <LiveCompany companyId={companyId} label={label}>
      {(ctx, note) => (
        <Body ctx={ctx} note={note}>
          {children}
        </Body>
      )}
    </LiveCompany>
  );
}
