"use client";

import Link from "next/link";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { useRole } from "@/components/RoleProvider";
import { RuleCard } from "@/components/rules/RuleCard";
import { PreviewNote, RulesEmpty } from "@/components/rules/RulesBits";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { useRuleStore } from "@/lib/ruleStore";
import { CYCLES_SOURCE, closedOf, type RulesViewData } from "@/lib/rules";

export function LearnedView({
  companyId,
  dataKind,
  label,
  data,
}: {
  companyId: string;
  dataKind: DataKind;
  label: string;
  data: RulesViewData;
}) {
  const { role } = useRole();
  const store = useRuleStore(companyId, data.rules);
  const approverId = role === "owner" ? data.ownerId : null;
  const past = closedOf(data.cycles);
  const current = data.cycles.find((c) => c.stage !== "closed");

  if (!past.length) return <RulesEmpty label={label} />;

  const last = past[past.length - 1];
  const prev = past[past.length - 2];
  const max = Math.max(1, ...past.map((c) => c.questionsAsked));
  const changed = store.rules.filter(
    (r) => store.changedIds.includes(r.id) || r.source === "owner_stated",
  );
  const proposed = store.rules.filter((r) => r.status === "proposed").length;
  const asked = data.pastQuestions;
  const delta = prev ? last.questionsAsked - prev.questionsAsked : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DataLabel
          kind={dataKind}
          detail={`${label}, cycles ${past[0].number}–${last.number}`}
        />
        <Link
          href={`/c/${companyId}/rules`}
          className="text-sm text-link underline-offset-4 hover:underline"
        >
          All {store.rules.length} rules
        </Link>
      </div>

      <section className="grid gap-6 rounded-card border bg-card p-5 shadow-card sm:p-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2">
          <p className="text-[2.5rem] leading-none font-semibold tracking-[-0.02em]">
            {last.questionsAsked}{" "}
            <span className="text-2xl font-medium">
              question{last.questionsAsked === 1 ? "" : "s"} in cycle{" "}
              {last.number}
            </span>
          </p>
          {prev && (
            <p className="text-muted-foreground">
              {delta < 0
                ? `Down from ${prev.questionsAsked} in cycle ${prev.number}.`
                : delta > 0
                  ? `Up from ${prev.questionsAsked} in cycle ${prev.number}.`
                  : `Same as cycle ${prev.number}.`}{" "}
              Approved rules answer things the next cycle would otherwise ask.
            </p>
          )}
          <p className="mt-auto text-sm text-muted-foreground">
            Source: Cycle.questionsAsked, {CYCLES_SOURCE}
          </p>
        </div>
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm font-medium">
            Questions asked per cycle
          </figcaption>
          <ul className="flex flex-col gap-2">
            {past.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">Cycle {c.number}</span>
                <span className="h-3 rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-link"
                    style={{ width: `${(c.questionsAsked / max) * 100}%` }}
                  />
                </span>
                <span className="text-right font-medium">
                  {c.questionsAsked}
                </span>
              </li>
            ))}
            {current && (
              <li className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  Cycle {current.number}
                </span>
                <span className="text-muted-foreground">
                  Not counted yet. It’s in {current.stage}.
                </span>
              </li>
            )}
          </ul>
        </figure>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="new-rules">
        <h2 id="new-rules" className="text-xl font-semibold">
          New since last cycle
        </h2>
        <PreviewNote />
        {changed.length === 0 ? (
          <div className="rounded-card border bg-card p-5 shadow-card">
            <p>No rule changes yet.</p>
            {proposed > 0 && (
              <p className="mt-1 text-muted-foreground">
                {proposed} proposed rules wait for your approval.
              </p>
            )}
            <Link
              href={`/c/${companyId}/onboarding`}
              className={buttonVariants({
                size: "sm",
                variant: "secondary",
                className: "mt-3",
              })}
            >
              Review proposed rules
            </Link>
          </div>
        ) : (
          changed.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              names={data.names}
              store={store}
              viewer={role}
              approverId={approverId}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="applied">
        <h2 id="applied" className="text-xl font-semibold">
          Applied your approved rules
        </h2>
        <div className="rounded-card border border-dashed border-input bg-card p-5">
          <p>
            This fills in after checks run on cycle {current?.number ?? "next"}:
            each change a rule made, and what passed every check.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing here is estimated. Checks never trim hours or change pay on
            their own.
          </p>
        </div>
      </section>

      {asked.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="asked">
          <h2 id="asked" className="text-xl font-semibold">
            What it learned from: {asked.length} answered questions
          </h2>
          <ul className="divide-y rounded-card border bg-card shadow-card">
            {asked.map((q) => {
              const cycle = past.find((c) => c.id === q.cycleId);
              return (
                <li
                  key={q.id}
                  className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-start sm:gap-4"
                >
                  <span className="w-20 shrink-0 text-sm text-muted-foreground">
                    Cycle {cycle?.number ?? "?"}
                  </span>
                  <p className="flex-1">{q.text}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      to the {q.toRole}
                    </span>
                    <StatusBadge status="closed" label="Answered" />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted-foreground">
            Source: data/fixtures/a/questions.json
          </p>
        </section>
      )}
    </div>
  );
}
