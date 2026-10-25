"use client";

import { useQuery } from "convex/react";
import type { ComponentProps } from "react";
import { CompanyView } from "@/components/company/CompanyView";
import { errorReason, LiveBoundary } from "@/components/LiveBoundary";
import { useLive } from "@/components/LiveProvider";
import { useRole } from "@/components/RoleProvider";
import { api } from "@/convex/_generated/api";
import { companies } from "@/lib/companies";
import { toRule } from "@/lib/live/adapt";
import type { LiveContext } from "@/lib/live/ids";
import { ruleWords } from "@/lib/rules";
import type { RulesViewData } from "@/lib/view-types";

type Props = ComponentProps<typeof CompanyView>;

// rules.list takes no viewer and returns params as stored (rates included), so only the owner subscribes.
export const RULES_MANAGER_NOTE =
  "Convex rules.list, owner only until it redacts pay for the manager";

const withRulesSource = (
  rules: RulesViewData,
  source: string,
): RulesViewData => ({
  ...rules,
  sources: { ...rules.sources, rules: source },
});

function LiveRules({
  ctx,
  note,
  ...props
}: Props & { ctx: LiveContext; note: string | null }) {
  const docs = useQuery(api.rules.list, { companyId: ctx.ids.companyId });
  // CompanyView seeds its rule store once, so it renders only after rules.list has answered.
  if (docs === undefined)
    return <p className="text-muted-foreground">Loading…</p>;
  const nameOf = (id: string) => ctx.names[id] ?? id;
  const rules: RulesViewData = {
    ...withRulesSource(
      props.rules,
      `Convex rules.list${note ? ` (${note})` : ""}`,
    ),
    rules: docs.map((doc) => {
      const rule = toRule(doc, ctx.companyKey);
      // Owner only, so the words may state amounts; params never leave this component.
      return {
        ...rule,
        params: {},
        words: ruleWords(rule, true, nameOf),
        evidence: null,
        summary: null,
      };
    }),
    ownerId: ctx.ids.ownerId || null,
    names: ctx.names,
  };
  return <CompanyView {...props} rules={rules} />;
}

// The company page from the fixture the server sent, or, for a company with no fixtures (Company R), its rules
// from Convex rules.list as the owner. A manager on such a company sees no rules and a note that says why.
export function CompanySource(props: Props) {
  const { companyId } = props;
  const state = useLive();
  const { role } = useRole();
  const fixture = (note?: string) => (
    <CompanyView
      {...props}
      rules={
        note
          ? withRulesSource(
              props.rules,
              `${props.rules.sources.rules} (${note})`,
            )
          : props.rules
      }
    />
  );
  if (companies[companyId]?.cycle !== null) return fixture();
  if (state.status === "off") return fixture("Convex not configured");
  if (state.status === "loading")
    return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === "unavailable")
    return fixture(`live Convex unavailable: ${state.reason}`);
  if (state.ctx.companyKey !== companyId)
    return fixture(`no live data for company ${companyId.toUpperCase()}`);
  if (role !== "owner")
    return (
      <CompanyView
        {...props}
        rules={withRulesSource(props.rules, RULES_MANAGER_NOTE)}
      />
    );
  return (
    <LiveBoundary
      fallback={(e) => fixture(`live Convex failed: ${errorReason(e)}`)}
    >
      <LiveRules {...props} ctx={state.ctx} note={state.note} />
    </LiveBoundary>
  );
}
