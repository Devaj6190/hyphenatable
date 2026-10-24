"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Counts } from "@/components/Counts";
import { FlagsSource } from "@/components/FlagsList";
import { LiveFeed } from "@/components/LiveFeed";
import { type Decision, NeedsYouList } from "@/components/NeedsYouList";
import { StageTracker } from "@/components/StageTracker";
import { flagStatus, StatusBadge } from "@/components/StatusBadge";
import { SyncStrip } from "@/components/SyncStrip";
import { checkTitle } from "@/lib/checks";
import { companies } from "@/lib/companies";
import { fixtureQuestions } from "@/lib/fixtures";
import { countFlags, homeFixture, questionFor, recipient } from "@/lib/home";
import type { AuditEvent, Flag } from "@/lib/types";

// Answered first (a reply is the fastest thing to finish), then drafted texts, then the rest.
const order: Partial<Record<Flag["status"], number>> = { answered: 0, open: 1 };

// The owner home (boards 1 and 1b). Decisions made here stay on this screen until B's
// questions.approve / corrections.approve are live; each one is labelled as not saved.
export function HomeBoard({ companyId }: { companyId: string }) {
  const company = companies[companyId];
  const fx = homeFixture(companyId);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [extra, setExtra] = useState<AuditEvent[]>([]);

  function decide(flag: Flag, d: Decision | null) {
    setDecisions(({ [flag.id]: _, ...rest }) =>
      d ? { ...rest, [flag.id]: d } : rest,
    );
    setExtra((prev) => [
      ...(d ? [ownEvent(flag, d)] : []),
      ...prev.filter((e) => e.refs.flagId !== flag.id),
    ]);
  }

  return (
    <FlagsSource companyId={companyId}>
      {(raw, source) => {
        const flags = raw.map((f) => applyDecision(f, decisions[f.id]));
        const counts = countFlags(flags, fx?.syncRuns ?? []);
        const items = raw
          .filter((f) => f.status === "open" || f.status === "answered")
          .sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
        const waiting = flags.filter(
          (f) => f.status === "asked" || f.status === "held",
        );
        const asked =
          fixtureQuestions.filter(
            (q) =>
              q.cycleId === fx?.cycle.id &&
              !["draft", "approved", "denied"].includes(q.status),
          ).length +
          Object.entries(decisions).filter(
            ([id, d]) =>
              d === "approved" &&
              raw.find((f) => f.id === id)?.status === "open",
          ).length;

        return (
          <div className="flex flex-col gap-8">
            <Hero
              needsYou={counts.needsYou}
              waiting={counts.waiting}
              held={counts.held}
              hasCycle={Boolean(fx)}
              questions={
                fx && fx.cycle.number >= 2
                  ? { now: asked, last: fx.previous?.questionsAsked ?? null }
                  : null
              }
            />

            <section
              aria-label="Where this payroll is"
              className="flex flex-col gap-5 rounded-card border bg-card p-5 shadow-card"
            >
              {fx ? (
                <StageTracker stage={fx.cycle.stage} />
              ) : (
                <p className="text-muted-foreground">
                  No pay cycle is loaded for {company.label} yet. Stages show
                  here once the first sync runs.
                </p>
              )}
              <div className="border-t pt-4">
                <SyncStrip
                  runs={fx?.syncRuns ?? []}
                  timeZone={company.timezone}
                  companyId={companyId}
                />
              </div>
            </section>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-8">
                <NeedsYouList
                  items={items}
                  decisions={decisions}
                  onDecide={decide}
                  dataKind={company.kind}
                  companyId={companyId}
                  total={raw.length}
                />
                {waiting.length > 0 && <Waiting flags={waiting} />}
              </div>
              <aside className="flex flex-col gap-8">
                <Counts
                  counts={counts}
                  source={`flags from ${source}; records from data/fixtures/a/syncRuns.json`}
                />
                <Learns
                  companyId={companyId}
                  proposed={fx?.rulesProposed ?? 0}
                />
                <LiveFeed
                  companyId={companyId}
                  cycleId={fx?.cycle.id ?? ""}
                  timeZone={company.timezone}
                  extra={extra}
                />
              </aside>
            </div>

            <p className="text-sm text-muted-foreground">
              Draft only. PayrollPilot never submits payroll.
            </p>
          </div>
        );
      }}
    </FlagsSource>
  );
}

function applyDecision(f: Flag, d: Decision | undefined): Flag {
  if (!d) return f;
  if (d === "denied") return { ...f, status: "held" };
  return { ...f, status: f.status === "answered" ? "corrected" : "asked" };
}

function ownEvent(flag: Flag, d: Decision): AuditEvent {
  const who = recipient(questionFor(flag));
  const title = checkTitle(flag.checkId).toLowerCase();
  const reply = flag.status === "answered";
  return {
    id: `local-${flag.id}`,
    companyId: flag.companyId,
    cycleId: flag.cycleId,
    at: new Date().toISOString(),
    actor: { kind: "user", id: "you", agent: null },
    type: reply ? `correction.${d}` : `message.${d}`,
    summary:
      d === "denied"
        ? `You held "${title}" instead of approving it. Nothing else waits on it.`
        : reply
          ? `You approved the correction for "${title}".`
          : `You approved the question to ${who}.`,
    refs: { flagId: flag.id },
    data: { source: "This screen" },
  };
}

function Hero({
  needsYou,
  waiting,
  held,
  hasCycle,
  questions,
}: {
  needsYou: number;
  waiting: number;
  held: number;
  hasCycle: boolean;
  questions: { now: number; last: number | null } | null;
}) {
  const rest = [
    waiting && `${waiting} waiting on a reply`,
    held && `${held} held`,
  ].filter(Boolean);
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-5xl">
        {!hasCycle
          ? "No payroll in progress"
          : needsYou === 0
            ? "Nothing needs you right now"
            : `${needsYou} ${needsYou === 1 ? "thing needs" : "things need"} you`}
      </h1>
      <p className="max-w-2xl text-lg text-muted-foreground">
        {rest.length > 0 && `${rest.join(", ")}. `}
        {hasCycle
          ? "Everything else is on track."
          : "Connect Jobber, QuickBooks and Gusto in onboarding to start a cycle."}
      </p>
      {questions && (
        <p className="text-sm text-muted-foreground">
          Questions this cycle:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {questions.now}
          </span>
          {questions.last !== null && ` (last cycle: ${questions.last})`}
          {" · "}from the cycle fixtures, synthetic
        </p>
      )}
    </header>
  );
}

function Waiting({ flags }: { flags: Flag[] }) {
  return (
    <section aria-labelledby="waiting-title" className="flex flex-col gap-3">
      <h2 id="waiting-title" className="text-xl font-semibold">
        Waiting and held
      </h2>
      <ul className="flex flex-col overflow-hidden rounded-card border bg-card">
        {flags.map((f) => {
          const s = flagStatus[f.status];
          const q = questionFor(f);
          return (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0"
            >
              <StatusBadge status={s.status} label={s.label} />
              <Link
                href={`/c/${f.companyId}/flags/${f.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {checkTitle(f.checkId)}
              </Link>
              <span className="text-sm text-muted-foreground">
                {f.status === "held"
                  ? "Only this item waits. Payroll keeps moving."
                  : `Asked ${recipient(q)}.`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Learns({
  companyId,
  proposed,
}: {
  companyId: string;
  proposed: number;
}) {
  return (
    <section
      aria-labelledby="learns-title"
      className="flex flex-col gap-2 rounded-card border bg-card p-4"
    >
      <h2
        id="learns-title"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <Sparkles aria-hidden className="size-4" />
        Learns and improves
      </h2>
      <p className="text-lg leading-snug font-semibold">
        {proposed === 0
          ? "No rules waiting on you."
          : `${proposed} ${proposed === 1 ? "rule" : "rules"} proposed, waiting on you`}
      </p>
      <p className="text-sm text-muted-foreground">
        Learned from past cycles and your answers. None applies until you
        approve it. Source: rules fixture, synthetic.
      </p>
      <Link
        href={`/c/${companyId}/rules`}
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-link underline-offset-4 hover:underline"
      >
        Review rules
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
