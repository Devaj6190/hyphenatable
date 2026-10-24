"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { useRole } from "@/components/RoleProvider";
import { PlainRuleBox } from "@/components/rules/PlainRuleBox";
import { RuleCard } from "@/components/rules/RuleCard";
import { PreviewNote, RulesEmpty } from "@/components/rules/RulesBits";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MISSED_SOURCE,
  type MissedQuestion,
  missedQuestions,
} from "@/lib/onboardingQuestions";
import { useRuleStore } from "@/lib/ruleStore";
import {
  closedCycles,
  groupRules,
  incompleteSyncs,
  ownerId,
  RULES_SOURCE,
  shortDate,
  syncWords,
} from "@/lib/rules";
import { cn } from "@/lib/utils";

function Section({
  n,
  title,
  description,
  children,
}: {
  n: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`step-${n}`}>
      <div className="flex gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-link"
        >
          {n}
        </span>
        <div>
          <h2 id={`step-${n}`} className="text-xl font-semibold">
            {title}
          </h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function MissedCard({
  q,
  store,
  canAnswer,
  by,
}: {
  q: MissedQuestion;
  store: ReturnType<typeof useRuleStore>;
  canAnswer: boolean;
  by: string;
}) {
  const saved = store.answers[q.id];
  const [choice, setChoice] = useState(saved?.choice ?? "");
  const [note, setNote] = useState(saved?.note ?? "");
  const [editing, setEditing] = useState(!saved);
  const name = useId();
  return (
    <article className="rounded-card border bg-card p-4 shadow-card sm:p-5">
      <p className="text-[1.0625rem] leading-snug font-medium text-pretty">
        {q.text}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        From
        {q.evidence.map((id) => (
          <SourceChip key={id} system="Gusto" recordId={id} />
        ))}
      </div>
      {saved && !editing ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="closed" label="Answered" />
            <span className="font-medium">{saved.choice}</span>
            {canAnswer && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setEditing(true)}
                className="ml-auto"
              >
                Change
              </Button>
            )}
          </div>
          {saved.note && <p className="text-sm">“{saved.note}”</p>}
          <p className="text-sm text-muted-foreground">
            Saved {shortDate(saved.at)}. The Analyst turns this into a proposed
            rule. You answered it, so someone else approves that rule.
          </p>
        </div>
      ) : canAnswer ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!choice) return;
            store.answer(q.id, { choice, note: note.trim(), by });
            setEditing(false);
          }}
        >
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Your answer</legend>
            {q.options.map((o) => (
              <label
                key={o}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-colors duration-(--dur-hover) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                  choice === o
                    ? "border-primary-edge bg-accent text-link"
                    : "border-input hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={o}
                  checked={choice === o}
                  onChange={() => setChoice(o)}
                  className="sr-only"
                />
                {o}
              </label>
            ))}
          </fieldset>
          <Textarea
            aria-label="Anything to add (optional)"
            placeholder="Anything to add (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-12 bg-card"
            maxLength={400}
          />
          <div>
            <Button type="submit" size="sm" disabled={!choice}>
              Save answer
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Only the owner answers these.
        </p>
      )}
    </article>
  );
}

export function OnboardingView({
  companyId,
  dataKind,
  label,
}: {
  companyId: string;
  dataKind: DataKind;
  label: string;
}) {
  const { role } = useRole();
  const store = useRuleStore(companyId);
  const owner = ownerId(companyId);
  const approverId = role === "owner" ? owner : null;
  const past = closedCycles(companyId);
  const learned = store.rules.filter((r) => r.source !== "owner_stated");
  const stated = store.rules.filter((r) => r.source === "owner_stated");
  const checked = learned.filter((r) => r.status !== "proposed").length;
  const questions = missedQuestions.filter((q) => q.companyId === companyId);
  const gaps = incompleteSyncs(companyId);

  if (!learned.length) return <RulesEmpty label={label} />;

  const first = past[0];
  const last = past.at(-1);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DataLabel kind={dataKind} detail={`${label}, onboarding`} />
          <span className="text-sm text-muted-foreground">
            Rules: {RULES_SOURCE}
          </span>
        </div>
        <p className="max-w-2xl">
          We read {past.length} past payrolls from Gusto
          {first && last
            ? ` (${shortDate(first.periodStart)} – ${shortDate(last.periodEnd)})`
            : ""}
          , with the matching hours from Jobber and expenses from QuickBooks.
        </p>
        {gaps.map((g) => (
          <div
            key={g.id}
            className="flex max-w-2xl flex-wrap items-center gap-2 rounded-control border border-destructive/40 bg-destructive-soft p-3 text-sm"
          >
            <StatusBadge status="sync-incomplete" label={syncWords(g)} />
            <span>
              Cycle {past.find((c) => c.id === g.cycleId)?.number} is still
              listed as evidence, marked incomplete. Nothing was filled in.
            </span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="h-2 w-40 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-link transition-[width] duration-(--dur-tab) ease-out-soft"
              style={{ width: `${(checked / learned.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium">
            {checked} of {learned.length} rules checked
          </span>
        </div>
        <PreviewNote />
      </div>

      <Section
        n={1}
        title="Rules we found"
        description="The Analyst proposed these. Confirm what’s right and fix what isn’t. We only use rules you confirm, and checks never change pay on their own."
      >
        {groupRules(learned).map((g) => {
          const sure = g.rules.filter(
            (r) => r.status === "proposed" && r.confidence >= 0.85,
          );
          return (
            <div key={g.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.title}
                </h3>
                {approverId && sure.length > 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      for (const r of sure)
                        store.decide(r, "active", "Approved", approverId);
                    }}
                  >
                    Confirm the {sure.length} at 85%+ sure
                  </Button>
                )}
              </div>
              {g.rules.map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  companyId={companyId}
                  store={store}
                  viewer={role}
                  approverId={approverId}
                  approveLabel="Confirm"
                />
              ))}
            </div>
          );
        })}
      </Section>

      <Section
        n={2}
        title="What did we miss?"
        description="A few things in your past payrolls we couldn’t explain. Your answer helps, and nothing changes until you approve a rule."
      >
        <p className="-mt-2 text-sm text-muted-foreground">
          Questions: {MISSED_SOURCE}
        </p>
        {questions.map((q) => (
          <MissedCard
            key={q.id}
            q={q}
            store={store}
            canAnswer={approverId !== null}
            by={approverId ?? ""}
          />
        ))}
      </Section>

      <Section
        n={3}
        title="Add a rule in your own words"
        description="We’ll restate it, label it as yours, and check it against your past payrolls."
      >
        {approverId && (
          <div className="rounded-card border bg-card p-4 shadow-card sm:p-5">
            <PlainRuleBox onSubmit={(text) => store.addStated(text, null)} />
          </div>
        )}
        {stated.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              We read your rules as
            </h3>
            {stated.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                companyId={companyId}
                store={store}
                viewer={role}
                approverId={approverId}
                approveLabel="Confirm"
              />
            ))}
          </div>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Link href={`/c/${companyId}/rules`} className={buttonVariants()}>
          Continue to Rules
        </Link>
        <span className="text-sm text-muted-foreground">
          You can change any rule later.
        </span>
      </div>
    </div>
  );
}
