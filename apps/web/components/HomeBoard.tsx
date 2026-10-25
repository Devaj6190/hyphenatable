"use client";

import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Counts } from "@/components/Counts";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { FlagsSource } from "@/components/FlagsList";
import { LiveFeed } from "@/components/LiveFeed";
import { type Decision, NeedsYouList } from "@/components/NeedsYouList";
import { StageTracker } from "@/components/StageTracker";
import { flagStatus, StatusBadge } from "@/components/StatusBadge";
import { SyncStrip } from "@/components/SyncStrip";
import { checkTitle } from "@/lib/checks";
import { companies } from "@/lib/companies";
import { countFlags, infoFor, SOURCES, STAGES, stageIndex } from "@/lib/home";
import type { AuditEvent, Flag } from "@/lib/types";
import type { FlagInfo, HomeData } from "@/lib/view-types";

// B's approval mutations, by name so this builds before the generated api has them (B-08, B-10).
const questionsApprove = makeFunctionReference<
  "mutation",
  { questionId: string; userId: string }
>("questions:approve");
const questionsDeny = makeFunctionReference<
  "mutation",
  { questionId: string; userId: string; reason: string }
>("questions:deny");
const correctionsApprove = makeFunctionReference<
  "mutation",
  { correctionId: string; userId: string }
>("corrections:approve");
const correctionsReject = makeFunctionReference<
  "mutation",
  { correctionId: string; userId: string; reason: string }
>("corrections:reject");

const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function useLiveMutations() {
  return {
    questionsApprove: useMutation(questionsApprove),
    questionsDeny: useMutation(questionsDeny),
    correctionsApprove: useMutation(correctionsApprove),
    correctionsReject: useMutation(correctionsReject),
  };
}
type Mutations = ReturnType<typeof useLiveMutations>;
// hasConvex never changes at runtime, so the same hooks run on every render.
const useMutations: () => Mutations | null = hasConvex
  ? useLiveMutations
  : () => null;

/** Saves one decision through B's mutations. Throws when there is nothing to call, so the card says so. */
async function save(
  m: Mutations,
  flag: Flag,
  info: FlagInfo,
  d: Omit<Decision, "saved">,
  userId: string,
) {
  if (d.job)
    throw new Error("linking a purchase to a job has no Convex function yet");
  if (info.reply && flag.correctionId) {
    const args = { correctionId: flag.correctionId, userId };
    return d.kind === "approved"
      ? m.correctionsApprove(args)
      : m.correctionsReject({
          ...args,
          reason: "Not approved from the home screen",
        });
  }
  if (info.question) {
    const args = { questionId: info.question.id, userId };
    return d.kind === "approved"
      ? m.questionsApprove(args)
      : m.questionsDeny({ ...args, reason: "Held from the home screen" });
  }
  throw new Error("this item has no question or correction to approve");
}

// Answered first (a reply is the fastest thing to finish), then drafted texts, then the rest.
const order: Partial<Record<Flag["status"], number>> = { answered: 0, open: 1 };

// The owner home (boards 1 and 1b). With live Convex flags, a decision goes through B's mutations and the
// card only folds once it is saved; a failed save stays on the card with the reason. With fixture flags,
// nothing is called and every confirmation says it was not saved.
export function HomeBoard({
  companyId,
  viewerId,
  data,
}: {
  companyId: string;
  /** The owner's worker id, sent as userId with each approval. */
  viewerId: string;
  /** Filtered and redacted on the server for this viewer (lib/server/fixtures.ts homeView). */
  data: HomeData;
}) {
  const company = companies[companyId];
  const { cycle, info } = data;
  const mutations = useMutations();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [extra, setExtra] = useState<AuditEvent[]>([]);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function record(flag: Flag, d: Decision | null) {
    setDecisions(({ [flag.id]: _, ...rest }) =>
      d ? { ...rest, [flag.id]: d } : rest,
    );
    // Fixture decisions show in the feed as this screen's own; saved ones arrive through audit.list.
    setExtra((prev) => [
      ...(d && !d.saved ? [ownEvent(flag, d, infoFor(info, flag.id))] : []),
      ...prev.filter((e) => e.refs.flagId !== flag.id),
    ]);
  }

  async function decide(
    flag: Flag,
    d: Omit<Decision, "saved"> | null,
    live: boolean,
  ) {
    setErrors(({ [flag.id]: _, ...rest }) => rest);
    if (!d) return record(flag, null);
    if (!live || !mutations) return record(flag, { ...d, saved: false });
    setPendingIds((s) => new Set(s).add(flag.id));
    try {
      await save(mutations, flag, infoFor(info, flag.id), d, viewerId);
      record(flag, { ...d, saved: true });
    } catch (e) {
      setErrors((x) => ({
        ...x,
        [flag.id]: `Not saved: ${e instanceof Error ? e.message : String(e)}. Nothing was sent or changed.`,
      }));
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(flag.id);
        return next;
      });
    }
  }

  const step = cycle ? STAGES[stageIndex[cycle.stage]] : null;
  const gate =
    step && "gate" in step ? { label: step.label, hint: step.hint } : null;
  const short = data.syncRuns.filter((r) => !r.complete);

  return (
    <FlagsSource companyId={companyId} fixtureFlags={data.flags}>
      {(raw, source) => {
        const live = source.startsWith("Convex");
        const flags = raw.map((f) => applyDecision(f, decisions[f.id]));
        const counts = countFlags(flags, data.syncRuns);
        const items = raw
          .filter((f) => f.status === "open" || f.status === "answered")
          .sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
        const waiting = flags.filter(
          (f) => f.status === "asked" || f.status === "held",
        );
        const asked =
          data.questionsAsked +
          Object.entries(decisions).filter(
            ([id, d]) =>
              d.kind === "approved" &&
              d.job === undefined &&
              raw.find((f) => f.id === id)?.status === "open",
          ).length;

        return (
          <div className="flex flex-col gap-8">
            <Hero
              needsYou={counts.needsYou}
              waiting={counts.waiting}
              held={counts.held}
              hasCycle={Boolean(cycle)}
              shortPulls={short.map(
                (r) =>
                  SOURCES.find((s) => s.key === r.source)?.system ?? r.source,
              )}
              dataKind={company.kind}
              questions={
                cycle && cycle.number >= 2
                  ? { now: asked, last: data.previousQuestionsAsked }
                  : null
              }
            />

            <section
              aria-label="Where this payroll is"
              className="flex flex-col gap-5 rounded-card border bg-card p-5 shadow-card"
            >
              {cycle ? (
                <div className="flex flex-col gap-2">
                  <StageTracker stage={cycle.stage} />
                  {data.stageNote && (
                    <p className="text-xs text-muted-foreground">
                      Stage: {data.stageNote}.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No pay cycle is loaded for {company.label} yet. Stages show
                  here once the first sync runs.
                </p>
              )}
              <div className="border-t pt-4">
                <SyncStrip
                  runs={data.syncRuns}
                  timeZone={company.timezone}
                  companyId={companyId}
                />
              </div>
            </section>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-8">
                <NeedsYouList
                  items={items}
                  info={info}
                  decisions={decisions}
                  onDecide={(f, d) => decide(f, d, live)}
                  pendingIds={pendingIds}
                  errors={errors}
                  gate={gate}
                  dataKind={company.kind}
                  companyId={companyId}
                  total={raw.length}
                />
                {waiting.length > 0 && <Waiting flags={waiting} info={info} />}
              </div>
              <aside className="flex flex-col gap-8">
                <Counts
                  counts={counts}
                  dataKind={company.kind}
                  source={`flags from ${source}; records from ${data.sources.records ?? `no records fixture for ${company.label}`}`}
                />
                <Learns
                  companyId={companyId}
                  proposed={data.rulesProposed}
                  source={
                    data.sources.rules ??
                    `no rules fixture for ${company.label}`
                  }
                  dataKind={company.kind}
                />
                <LiveFeed
                  companyId={companyId}
                  cycleId={cycle?.id ?? ""}
                  timeZone={company.timezone}
                  fixtureEvents={data.audit}
                  visibleFlagIds={new Set(raw.map((f) => f.id))}
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
  if (d.kind === "denied") return { ...f, status: "held" };
  if (d.job || f.status === "answered") return { ...f, status: "corrected" };
  return { ...f, status: "asked" };
}

function ownEvent(
  flag: Flag,
  { kind: d, job }: Decision,
  info: FlagInfo,
): AuditEvent {
  const who = info.recipient;
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
        : job
          ? `You linked the purchase to job ${job}.`
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
  shortPulls,
  dataKind,
  questions,
}: {
  needsYou: number;
  waiting: number;
  held: number;
  hasCycle: boolean;
  /** Systems whose pull came up short this cycle. */
  shortPulls: string[];
  dataKind: DataKind;
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
        {!hasCycle
          ? "Connect Jobber, QuickBooks and Gusto in onboarding to start a cycle."
          : shortPulls.length === 0
            ? "Everything else is on track."
            : null}
      </p>
      {hasCycle && shortPulls.length > 0 && (
        <p className="max-w-2xl text-lg font-medium text-sync-error">
          The {[...new Set(shortPulls)].join(" and ")} pull came up short. It
          holds everything it covers until it is pulled again.
        </p>
      )}
      {questions && (
        <p className="text-sm text-muted-foreground">
          Questions this cycle:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {questions.now}
          </span>
          {questions.last !== null && ` (last cycle: ${questions.last})`}
          {" · "}from the cycle fixtures <DataLabel kind={dataKind} />
        </p>
      )}
    </header>
  );
}

function Waiting({
  flags,
  info,
}: {
  flags: Flag[];
  info: Record<string, FlagInfo>;
}) {
  return (
    <section aria-labelledby="waiting-title" className="flex flex-col gap-3">
      <h2 id="waiting-title" className="text-xl font-semibold">
        Waiting and held
      </h2>
      <ul className="flex flex-col overflow-hidden rounded-card border bg-card">
        {flags.map((f) => {
          const s = flagStatus[f.status];
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
                  : `Asked ${infoFor(info, f.id).recipient}.`}
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
  source,
  dataKind,
}: {
  companyId: string;
  proposed: number;
  source: string;
  dataKind: DataKind;
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
        approve it. Source: {source} <DataLabel kind={dataKind} />
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
