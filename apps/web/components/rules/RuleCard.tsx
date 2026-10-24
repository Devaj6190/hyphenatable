"use client";

import { ChevronDown, Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { BacktestBadge } from "@/components/rules/BacktestBadge";
import { PlainRuleBox } from "@/components/rules/PlainRuleBox";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { blockedApprover, type useRuleStore } from "@/lib/ruleStore";
import { type RuleView, shortDate, sourceWords, syncWords } from "@/lib/rules";
import type { ViewerRole } from "@/lib/types";
import { cn } from "@/lib/utils";

type Store = ReturnType<typeof useRuleStore>;

/** Expands with the tab/disclosure timing; content is inert while closed. */
export function Disclosure({
  open,
  id,
  children,
}: {
  open: boolean;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-(--dur-tab) ease-out-soft",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function RuleStatus({ rule, store }: { rule: RuleView; store: Store }) {
  if (rule.status === "proposed")
    return <StatusBadge status="needs-you" label="Proposed" />;
  if (rule.status === "active")
    return <StatusBadge status="verified" label="Active" />;
  const rejected = store.lastChange(rule.id)?.label === "Rejected";
  return <StatusBadge status="closed" label={rejected ? "Rejected" : "Off"} />;
}

/** On/off for a rule that was approved once. Turning it back on is an approval, so it checks who. */
function RuleSwitch({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="group inline-flex items-center gap-2 rounded-full text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-10 rounded-full border transition-colors duration-(--dur-hover)",
          on ? "border-primary-edge bg-primary" : "border-input bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4.5 rounded-full bg-card shadow-card transition-transform duration-(--dur-tab) ease-out-soft",
            on && "translate-x-4",
          )}
        />
      </span>
      {on ? "On" : "Off"}
    </button>
  );
}

export function RuleCard({
  rule,
  names,
  store,
  viewer,
  approverId,
  approveLabel = "Approve",
  highlight = false,
}: {
  rule: RuleView;
  /** Display names by worker id, from the server. */
  names: Record<string, string>;
  store: Store;
  viewer: ViewerRole;
  /** The person approving in this session (the owner). */
  approverId: string | null;
  approveLabel?: string;
  /** The rule a precedent link pointed at. */
  highlight?: boolean;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const evidenceId = useId();
  const stated = rule.source === "owner_stated";
  const owner = viewer === "owner" && approverId !== null;
  const words = rule.words;
  const change = store.lastChange(rule.id);
  const sodBlocked = approverId !== null && blockedApprover(rule, approverId);
  const evidence = rule.summary;
  const { answeredBy, approvedBy, approvedAt } = rule.provenance;
  const wasApproved = change
    ? change.label !== "Rejected"
    : rule.status !== "proposed";

  const approve = () =>
    approverId && store.decide(rule, "active", "Approved", approverId);

  return (
    <article
      id={rule.id}
      className={cn(
        "scroll-mt-24 rounded-card border bg-card p-4 shadow-card transition-[box-shadow,opacity] duration-(--dur-hover) target:ring-2 target:ring-ring sm:p-5",
        highlight && "ring-2 ring-ring",
        stated && "border-dashed border-input",
        rule.status === "off" && "bg-muted/60 shadow-none",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <RuleStatus rule={rule} store={store} />
            <AgentChip
              agent={
                stated
                  ? "you"
                  : rule.source === "answer"
                    ? "manager"
                    : "analyst"
              }
              label={
                stated ? "You" : rule.source === "answer" ? "Answer" : "Analyst"
              }
            />
            <span className="text-sm text-muted-foreground">
              {sourceWords[rule.source]}
            </span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {rule.id}
            </span>
          </div>

          <p
            className={cn(
              "mt-3 text-[1.0625rem] leading-snug font-medium text-pretty",
              rule.status === "off" && "text-muted-foreground",
            )}
          >
            {words}
          </p>
          {stated && rule.type === null && (
            <p className="mt-1 text-sm text-muted-foreground">
              Your wording. The Analyst restates it once rules.stateInPlainWords
              is live.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {evidence ? (
              <button
                type="button"
                aria-expanded={evidenceOpen}
                aria-controls={evidenceId}
                onClick={() => setEvidenceOpen((o) => !o)}
                className="inline-flex h-6 items-center gap-2 rounded-full pr-1 text-sm text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {evidence.seen !== null && evidence.of && (
                  <span
                    aria-hidden
                    className="h-1.5 w-12 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className="block h-full rounded-full bg-link"
                      style={{
                        width: `${(evidence.seen / evidence.of) * 100}%`,
                      }}
                    />
                  </span>
                )}
                {evidence.text}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 transition-transform duration-(--dur-tab) ease-out-soft",
                    evidenceOpen && "rotate-180",
                  )}
                />
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">
                Not seen in past payrolls
              </span>
            )}
            <BacktestBadge backtest={rule.backtest} />
            {rule.status === "proposed" && !stated && (
              <ConfidenceBadge confidence={rule.confidence} />
            )}
          </div>

          {(approvedBy || answeredBy || change || !owner) && (
            <p className="mt-3 text-sm text-muted-foreground">
              {answeredBy
                ? `Answered by ${names[answeredBy] ?? answeredBy} · `
                : ""}
              {approvedBy
                ? `Approved by ${names[approvedBy] ?? approvedBy}${approvedAt ? `, ${shortDate(approvedAt)}` : ""}`
                : rule.status === "proposed"
                  ? "Needs the owner’s approval"
                  : "Not approved"}
              {change?.status === "off" &&
                ` · ${change.label} ${shortDate(change.at)}`}
            </p>
          )}
        </div>
        {owner && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {rule.status === "proposed" && (
              <>
                <Button size="sm" onClick={approve} disabled={sodBlocked}>
                  {approveLabel}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing((e) => !e)}
                  aria-expanded={editing}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    approverId &&
                    store.decide(rule, "off", "Rejected", approverId)
                  }
                >
                  Reject
                </Button>
              </>
            )}
            {rule.status !== "proposed" && wasApproved && (
              <RuleSwitch
                on={rule.status === "active"}
                disabled={rule.status === "off" && sodBlocked}
                label={`Use rule ${rule.id}`}
                onChange={() =>
                  approverId &&
                  (rule.status === "active"
                    ? store.decide(rule, "off", "Turned off", approverId)
                    : store.decide(
                        rule,
                        "active",
                        "Turned back on",
                        approverId,
                      ))
                }
              />
            )}
            {change && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => store.undo(rule.id)}
              >
                <Undo2 aria-hidden />
                Undo
              </Button>
            )}
          </div>
        )}
      </div>
      {evidence && (
        <Disclosure open={evidenceOpen} id={evidenceId}>
          <ul className="mt-3 flex flex-col gap-1.5 rounded-control bg-muted/70 p-3 text-sm">
            {rule.evidence?.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                {e.kind === "payroll" ? (
                  <SourceChip system="Gusto" recordId={e.id} />
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.id}
                  </span>
                )}
                <span>{e.label}</span>
                {e.incomplete.map((r) => (
                  <StatusBadge
                    key={r.id}
                    status="sync-incomplete"
                    label={syncWords(r)}
                  />
                ))}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {owner && sodBlocked && (
        <p className="mt-2 text-sm text-hold">
          You answered the question behind this rule, so someone else approves
          it.
        </p>
      )}

      {owner && (
        <Disclosure open={editing} id={`${rule.id}-edit`}>
          {editing && (
            <div className="mt-4 border-t pt-4">
              <PlainRuleBox
                initial={words}
                label="Change it in your own words"
                submitLabel="Save as my rule"
                onCancel={() => setEditing(false)}
                onSubmit={(text) => {
                  store.addStated(text, rule.id);
                  if (approverId)
                    store.decide(
                      rule,
                      "off",
                      "Replaced by your edit",
                      approverId,
                    );
                  setEditing(false);
                }}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Your version is added as a rule stated by you. This one turns
                off.
              </p>
            </div>
          )}
        </Disclosure>
      )}
    </article>
  );
}
