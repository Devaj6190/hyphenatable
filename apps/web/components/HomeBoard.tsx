"use client";

import { useAction, useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AgentActivity } from "@/components/AgentActivity";
import { DataLabel } from "@/components/DataLabel";
import { FlagsSource } from "@/components/FlagsList";
import {
  BareCard,
  type CardDecision,
  FoldedCard,
  OwnerCard,
} from "@/components/home/Card";
import { DakotaCard } from "@/components/home/DakotaCard";
import { DemoBar } from "@/components/home/DemoBar";
import { GateConfirm } from "@/components/home/GateConfirm";
import {
  Banner,
  FILL_END,
  FillPanel,
  RECON_END,
  ReconPanel,
  RUN_END,
  RunPanel,
  StartPanel,
} from "@/components/home/Panels";
import { Progress } from "@/components/home/Progress";
import { ManagerProgress, MoneyCard, UpNext } from "@/components/home/Rail";
import {
  DonePanel,
  NextReview,
  ReviewCommissions,
  ReviewDraft,
} from "@/components/home/Reviews";
import {
  GustoBanner,
  type SyncBannerState,
  SyncIncompleteBanner,
} from "@/components/home/States";
import { LiveFeed } from "@/components/LiveFeed";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { checkTitle } from "@/lib/checks";
import { companies, isRealPayroll, REAL_PAYROLL_NOTE } from "@/lib/companies";
import { DEMO_MODE } from "@/lib/demo";
import {
  affectsLabel,
  BOARD_ORDER,
  type BoardStage,
  boardStageOf,
  flagKey,
  STAGES,
  stepOf,
} from "@/lib/home";
import type { AuditEvent, Flag } from "@/lib/types";
import type { CarryItem, HomeBoardData, HomeCard } from "@/lib/view-types/home";

// B's functions by name, so this builds before the generated api has them (B-05, B-08, B-10, B-11, B-12).
const correctionsApprove = makeFunctionReference<
  "mutation",
  { correctionId: string; userId: string }
>("corrections:approve");
const correctionsReject = makeFunctionReference<
  "mutation",
  { correctionId: string; userId: string; reason: string }
>("corrections:reject");
const approveGate = makeFunctionReference<
  "mutation",
  { cycleId: string; stage: 1 | 2; userId: string }
>("drafts:approveGate");
const fillGusto = makeFunctionReference<
  "action",
  { cycleId: string; stage: 1 | 2 }
>("drafts:fillGusto");
const syncRun = makeFunctionReference<
  "mutation",
  { companyId: string; cycleId: string; sources: string[] }
>("sync:run");

const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function useLiveMutations() {
  return {
    correctionsApprove: useMutation(correctionsApprove),
    correctionsReject: useMutation(correctionsReject),
    approveGate: useMutation(approveGate),
    fillGusto: useAction(fillGusto),
    syncRun: useMutation(syncRun),
  };
}
type Mutations = ReturnType<typeof useLiveMutations>;
// hasConvex never changes at runtime, so the same hooks run on every render.
const useMutations: () => Mutations | null = hasConvex
  ? useLiveMutations
  : () => null;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Counts 0..end every `ms`, then calls onDone. Reduced motion jumps straight to the end. */
function useTicker(
  running: boolean,
  end: number,
  ms: number,
  onDone: () => void,
) {
  const [t, setT] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!running) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(end);
      done.current();
      return;
    }
    let n = 0;
    setT(0);
    const id = setInterval(() => {
      n += 1;
      setT(n);
      if (n >= end) {
        clearInterval(id);
        done.current();
      }
    }, ms);
    return () => clearInterval(id);
  }, [running, end, ms]);
  return [t, setT] as const;
}

const STAGE_NAME: Record<BoardStage, string> = {
  start: "Not started",
  run: "Collecting and checking",
  asking: "Asking",
  review: "Gate 1 · review",
  fill1: "Draft filling",
  filled1: "Draft filled",
  reconRun: "Reconciling",
  recon: "Reconciling · cards",
  review2: "Gate 2 · review",
  fill2: "Off-cycle filling",
  done: "Done",
};

// Home V5 (C plan PR 3 and PR 8). One board through all eight stages: start → run → your cards and the manager's
// text → review the draft → Gate 1 → fill → reconcile → Stage 2 cards → review commissions → Gate 2 → done.
// Live: Convex flags fold the cards they match (by check and source records), corrections approve through B's
// mutations, and the gates and the run call B's functions first. Anything not live yet falls back to this
// screen's own state, and says so. Nothing here computes pay: every amount is engine cents from the server.
export function HomeBoard({
  companyId,
  viewerId,
  data,
}: {
  companyId: string;
  /** The owner's worker id, sent as userId with each approval. */
  viewerId: string;
  /** Built and checked on the server for the owner (lib/server/views/home.ts homeBoardView). */
  data: HomeBoardData;
}) {
  const company = companies[companyId];
  const dataKind = company.kind;
  const realPayroll = isRealPayroll(companyId);
  const m = useMutations();
  const initial: BoardStage = data.cycle
    ? boardStageOf[data.cycle.stage]
    : "start";
  const [stage, setStage] = useState<BoardStage>(initial);
  const [decisions, setDecisions] = useState<Record<string, CardDecision>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [fills, setFills] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [sent, setSent] = useState(false);
  const [replies, setReplies] = useState(0);
  const [held, setHeld] = useState(false);
  const [modal, setModal] = useState<1 | 2 | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<AuditEvent[]>([]);
  const [syncDemo, setSyncDemo] = useState<SyncBannerState | null>(null);
  const [gustoDemo, setGustoDemo] = useState<boolean | null>(null);
  const [next, setNext] = useState<null | "start" | "review">(null);
  const [nextHeld, setNextHeld] = useState(false);
  const [nextApproved, setNextApproved] = useState(false);
  // One question at a time: which card the focus deck shows. ← → move; the Up next list jumps.
  const [focusIdx, setFocusIdx] = useState(0);
  const deckLen = useRef(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      )
        return;
      if (e.key === "ArrowRight")
        setFocusIdx((i) => Math.min(deckLen.current - 1, i + 1));
      if (e.key === "ArrowLeft") setFocusIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function feed(
    summary: string,
    actor: AuditEvent["actor"] = { kind: "user", id: "you", agent: null },
    simulated = false,
  ) {
    setExtra((prev) => [
      {
        id: `local-${Date.now()}-${prev.length}`,
        companyId,
        cycleId: data.cycle?.id ?? null,
        at: new Date().toISOString(),
        actor,
        type: "home.local",
        summary,
        refs: {},
        data: { source: "This screen", simulated },
      },
      ...prev,
    ]);
  }
  const agent = (
    id: "auditor" | "messenger" | null,
    name = "controller",
  ): AuditEvent["actor"] => ({
    kind: id ? "agent" : "system",
    id: name,
    agent: id,
  });

  const [t, setT] = useTicker(stage === "run", RUN_END, 80, () => {
    setStage("asking");
    feed(
      `${data.run.checks} checks done: ${data.run.found} problems held, nothing guessed.`,
      agent("auditor", "auditor"),
    );
  });
  const [rt] = useTicker(stage === "reconRun", RECON_END, 80, () => {
    setStage("recon");
    feed(
      `Reconciled ${data.stage2?.jobs.length ?? 0} jobs.`,
      agent("auditor", "auditor"),
    );
  });
  const [ft] = useTicker(
    stage === "fill1" || stage === "fill2",
    FILL_END,
    90,
    () => {
      if (stage === "fill1") {
        setStage("filled1");
        feed("Filled the regular Gusto draft (demo). Not submitted.");
      } else {
        setStage("done");
        feed("Filled the off-cycle draft (demo). Not submitted.");
      }
    },
  );

  // The manager's simulated replies, one every 1.4 s once the text is sent (fixture mode only).
  // Only the ticked items go to the manager; unticked ones stay with the owner.
  const hasManager = data.dakota.items.length > 0;
  const total = data.dakota.items.length - excluded.size;
  const demoReplies = data.dakota.demoReplies.filter(
    (r) => !excluded.has(r.flagId),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: feed only appends; the timer runs once per reply
  useEffect(() => {
    if (!sent || replies >= total) return;
    const id = setTimeout(() => {
      const r = demoReplies[replies];
      setReplies((n) => n + 1);
      if (r)
        feed(
          r.text,
          { kind: "user", id: "persona:manager", agent: null },
          true,
        );
    }, 1400);
    return () => clearTimeout(id);
  }, [sent, replies, total, demoReplies]);

  const gustoDown = gustoDemo ?? !data.states.gusto.connected;
  const short = syncDemo
    ? [
        {
          source: "jobber",
          system: "Jobber" as const,
          object: "timeSheetEntries",
          pulled: 79,
          expected: 85,
          error: null,
        },
      ]
    : data.states.incomplete;
  const syncState: SyncBannerState = syncDemo ?? "partial";
  const syncBlocks = short.length > 0 && syncState !== "full";
  const gateLock = realPayroll
    ? REAL_PAYROLL_NOTE
    : gustoDown
      ? "Locked until Gusto is reconnected"
      : syncBlocks
        ? "Locked until the sync is complete"
        : null;

  function reset() {
    setStage(initial);
    setT(0);
    setDecisions({});
    setPicks({});
    setFills({});
    setErrors({});
    setExcluded(new Set());
    setSent(false);
    setReplies(0);
    setHeld(false);
    setModal(null);
    setNotes({});
    setExtra([]);
    setNext(null);
    setNextHeld(false);
    setNextApproved(false);
  }

  async function run() {
    setNotes((n) => ({ ...n, run: "" }));
    if (m && data.cycle)
      try {
        await m.syncRun({
          companyId,
          cycleId: data.cycle.id,
          sources: ["jobber", "qbo", "gusto"],
        });
      } catch (e) {
        setNotes((n) => ({
          ...n,
          run: `sync.run is not live yet (${message(e)}). Showing this cycle's last pull.`,
        }));
      }
    setStage("run");
  }

  // Opened from a plain button, not a Dialog trigger: open after this click has finished, or Base UI reads the
  // same click as a press outside the new dialog and closes it at once.
  // A real company never reaches "Approve and fill": no dialog, no approveGate, no fillGusto.
  const openGate = (n: 1 | 2) => {
    if (!realPayroll) setTimeout(() => setModal(n), 0);
  };

  async function gate(n: 1 | 2) {
    setModal(null);
    if (realPayroll) return;
    feed(`You approved Gate ${n}.`);
    let note =
      "Fixture mode: nothing was recorded or filled in Gusto. Showing the demo fill.";
    if (m && data.cycle)
      try {
        await m.approveGate({
          cycleId: data.cycle.id,
          stage: n,
          userId: viewerId,
        });
        await m.fillGusto({ cycleId: data.cycle.id, stage: n });
        note = "";
      } catch (e) {
        note = `Not connected yet (${message(e)}): Gate ${n} stays unapproved in Convex. Showing the demo fill.`;
      }
    setNotes((x) => ({ ...x, [`g${n}`]: note }));
    setStage(n === 1 ? "fill1" : "fill2");
  }

  function finish2() {
    if (held || !data.stage2?.readyCents) {
      setStage("done");
      feed("Held the ready commission for the next payroll.");
    } else openGate(2);
  }

  function nextStage() {
    if (next) return setNext(next === "start" ? "review" : "start");
    if (stage === "asking") {
      setSent(true);
      setReplies(total);
      const all: Record<string, CardDecision> = {
        "dakota-text": { label: "Sent", action: "primary", saved: false },
      };
      for (const c of data.cards.filter((x) => x.stage === 1))
        all[c.id] = {
          label:
            c.kind === "pick" ? (c.options[0]?.value ?? c.primary) : c.primary,
          action: "primary",
          saved: false,
        };
      setDecisions((d) => ({ ...all, ...d }));
      return setStage("review");
    }
    if (stage === "recon") {
      const all: Record<string, CardDecision> = {};
      for (const c of data.cards.filter((x) => x.stage === 2))
        all[c.id] = {
          label:
            c.kind === "pick" ? (c.options[0]?.value ?? c.primary) : c.primary,
          action: "primary",
          saved: false,
        };
      setDecisions((d) => ({ ...all, ...d }));
      return setStage("review2");
    }
    if (stage === "review2") return setStage(held ? "done" : "fill2");
    const i = BOARD_ORDER.indexOf(stage);
    setStage(BOARD_ORDER[Math.min(BOARD_ORDER.length - 1, i + 1)]);
  }
  function prevStage() {
    if (next) return setNext(next === "review" ? "start" : null);
    const back: Partial<Record<BoardStage, BoardStage>> = {
      run: "start",
      asking: "start",
      review: "asking",
      fill1: "review",
      filled1: "review",
      reconRun: "filled1",
      recon: "filled1",
      review2: "recon",
      fill2: "review2",
      done: "review2",
    };
    setStage(back[stage] ?? "start");
  }

  return (
    <FlagsSource companyId={companyId} fixtureFlags={data.flags}>
      {(raw, source) => {
        const live = source.startsWith("Convex");
        const byKey = new Map<string, Flag>();
        if (live) for (const f of raw) byKey.set(flagKey(f), f);
        const matched = (keys: string[]) =>
          keys.map((k) => byKey.get(k)).filter((f): f is Flag => Boolean(f));
        const resolved = (keys: string[]) => {
          const fs = matched(keys);
          return (
            live &&
            fs.length > 0 &&
            fs.every(
              (f) => f.status === "corrected" || f.status === "dismissed",
            )
          );
        };

        // Manager progress: live flags that have moved on, or the demo's simulated replies.
        const liveReplies = live
          ? data.dakota.items
              .filter((i) =>
                ["answered", "corrected", "dismissed"].includes(
                  byKey.get(i.flagKey)?.status ?? "",
                ),
              )
              .map((i) => ({
                text: `${i.title}: ${byKey.get(i.flagKey)?.status}`,
                kind: "answered" as const,
              }))
          : null;
        const shownReplies = liveReplies ?? demoReplies.slice(0, replies);
        const answered = new Set(
          live
            ? matched(data.dakota.items.map((i) => i.flagKey))
                .filter((f) => f.status === "answered" || f.correctionId)
                .map(flagKey)
            : demoReplies
                .slice(0, replies)
                .map(
                  (r) =>
                    data.dakota.items.find((i) => i.flagId === r.flagId)
                      ?.flagKey ?? "",
                ),
        );

        const want = stage === "recon" ? 2 : 1;
        const list: (HomeCard | "dakota")[] =
          stage === "asking" || stage === "recon"
            ? [
                ...(want === 1 && hasManager ? (["dakota"] as const) : []),
                ...data.cards.filter(
                  (c) =>
                    c.stage === want &&
                    (!c.afterManager ||
                      c.flagKeys.some((k) => answered.has(k))),
                ),
              ]
            : [];
        const idOf = (c: HomeCard | "dakota") =>
          c === "dakota" ? "dakota-text" : c.id;
        const isDone = (c: HomeCard | "dakota") =>
          Boolean(decisions[idOf(c)]) ||
          (c !== "dakota" && resolved(c.flagKeys));
        const open = list.filter((c) => !isDone(c));
        const doneCount = list.length - open.length;

        // Live flags no card covers still need the owner: shown with the generic card.
        const covered = new Set([
          ...data.cards.flatMap((c) => c.flagKeys),
          ...data.dakota.items.map((i) => i.flagKey),
        ]);
        const loose =
          live && stage === "asking"
            ? raw.filter(
                (f) =>
                  (f.status === "open" || f.status === "answered") &&
                  !covered.has(flagKey(f)),
              )
            : [];
        // Items the owner unticked before sending stay with them, as their own problems.
        const kept =
          sent && stage === "asking"
            ? data.flags.filter((f) => excluded.has(f.id))
            : [];

        async function decide(
          c: HomeCard,
          action: "primary" | "secondary",
          label: string,
        ) {
          setErrors(({ [c.id]: _, ...rest }) => rest);
          const target =
            c.kind === "diff"
              ? matched(c.flagKeys).find((f) => f.correctionId)
              : undefined;
          if (!m || !target?.correctionId) {
            setDecisions((d) => ({
              ...d,
              [c.id]: { label, action, saved: false },
            }));
            feed(`${c.title}: ${label}.`);
            return;
          }
          setPendingIds((s) => new Set(s).add(c.id));
          try {
            const args = {
              correctionId: target.correctionId,
              userId: viewerId,
            };
            await (action === "primary"
              ? m.correctionsApprove(args)
              : m.correctionsReject({
                  ...args,
                  reason: "Denied from the home screen",
                }));
            setDecisions((d) => ({
              ...d,
              [c.id]: { label, action, saved: true },
            }));
          } catch (e) {
            setErrors((x) => ({
              ...x,
              [c.id]: `Not saved: ${message(e)}. Nothing was sent or changed.`,
            }));
          } finally {
            setPendingIds((s) => {
              const n = new Set(s);
              n.delete(c.id);
              return n;
            });
          }
        }
        const undo = (id: string) =>
          setDecisions(({ [id]: _, ...rest }) => rest);

        const asked = sent ? total : 0;
        const askDone =
          stage === "asking" && open.length === 0 && (live || replies >= total);
        const recDone = stage === "recon" && open.length === 0;
        const corrections = data.cards
          .filter(
            (c) => c.kind === "diff" && decisions[c.id]?.action === "primary",
          )
          .map(
            (c) =>
              `${c.title.match(/([A-Z][a-z]+)'s/)?.[1] ?? c.title} ${c.diff.at(-1)?.after ?? ""}`,
          );
        const carry: CarryItem[] = [
          ...(held && data.stage2
            ? data.stage2.commissions
                .filter((c) => c.state === "ready")
                .map((c) => ({
                  id: `held-${c.id}`,
                  title: c.title,
                  why: "You held it",
                  amountCents: c.amountCents,
                }))
            : []),
          ...data.carry,
          ...data.cards
            .filter((c) => c.carry && decisions[c.id]?.action === c.carry.on)
            .map((c) => ({
              id: `carry-${c.id}`,
              title: c.carry?.title ?? "",
              why: c.carry?.why ?? "",
              amountCents: null,
            })),
        ];

        const step = stepOf(stage, t >= 22);
        const caption =
          stage === "run"
            ? t < 22
              ? "Pulling from 3 apps"
              : `Running ${data.run.checks} checks`
            : stage === "asking"
              ? `${doneCount} of ${list.length} answered · ${data.dakota.managerName.split(" ")[0]} ${shownReplies.length}/${total}`
              : stage === "recon"
                ? `${doneCount} of ${list.length} answered`
                : stage === "review" || stage === "review2"
                  ? "Waiting on you"
                  : stage === "fill1" || stage === "fill2"
                    ? "Filling the draft"
                    : stage === "filled1"
                      ? "Filled · not submitted"
                      : stage === "reconRun"
                        ? "Matching payments and expenses"
                        : "";
        const fraction =
          stage === "run"
            ? t < 22
              ? t / 22
              : (t - 22) / (RUN_END - 22)
            : stage === "asking"
              ? (doneCount / Math.max(1, list.length)) * 0.85 +
                (shownReplies.length / Math.max(1, total)) * 0.15
              : stage === "recon"
                ? 0.5 + (doneCount / Math.max(1, list.length)) * 0.5
                : stage === "reconRun"
                  ? (rt / 60) * 0.5
                  : stage === "fill1" || stage === "fill2"
                    ? ft / FILL_END
                    : stage === "review" || stage === "review2"
                      ? 0.4
                      : 1;

        const stage2Money = [
          "reconRun",
          "recon",
          "review2",
          "fill2",
          "done",
        ].includes(stage);
        const r1 = data.review;

        deckLen.current = Math.max(1, list.length);
        const deckIdx = Math.min(focusIdx, Math.max(0, list.length - 1));
        const pagerBtn =
          "grid size-9 place-items-center rounded-full border bg-card text-foreground transition-colors duration-(--dur-hover) hover:border-muted-foreground/60 disabled:opacity-40 disabled:hover:border-border";
        // The focus card shows one question at a time. Every card is still built (so every handler and decision
        // stays); only the current one shows, without its own frame (BareCard).
        const focusDeck = (cards: ReactNode[]) => (
          <BareCard.Provider value={true}>
            <div key={deckIdx} id="focus-question" aria-live="polite">
              {cards[deckIdx]}
            </div>
          </BareCard.Provider>
        );

        const cardsCol = (
          <section
            aria-labelledby="todo-title"
            className="flex min-w-0 flex-col gap-6"
          >
            {/* Prototype focus card: progress ring, title, pager, then the current question. */}
            <article className="flex flex-col gap-[22px] overflow-hidden rounded-[20px] border bg-card p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="relative grid size-11 shrink-0 place-items-center">
                  <svg
                    viewBox="0 0 44 44"
                    className="size-11 -rotate-90"
                    aria-hidden="true"
                  >
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="3.2"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="var(--ring)"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeDasharray="113.1"
                      strokeDashoffset={(
                        113.1 *
                        (1 - doneCount / Math.max(1, list.length))
                      ).toFixed(1)}
                      className="transition-[stroke-dashoffset] duration-1000 ease-out-soft"
                    />
                  </svg>
                  <span className="absolute text-xs font-semibold tabular-nums">
                    {doneCount}/{list.length}
                  </span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <h2 id="todo-title" className="font-medium">
                    {stage === "recon"
                      ? "Before commissions"
                      : "What we need from you"}
                  </h2>
                  <span className="text-[13px] text-muted-foreground">
                    {open.length ? "Answer in any order" : "All done"}
                  </span>
                </span>
                {list.length > 1 && (
                  <span className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      className={pagerBtn}
                      aria-label="Previous item"
                      aria-controls="focus-question"
                      disabled={deckIdx === 0}
                      onClick={() => setFocusIdx(Math.max(0, deckIdx - 1))}
                    >
                      <ChevronLeft aria-hidden className="size-4" />
                    </button>
                    <span className="min-w-[52px] text-center text-[13px] text-muted-foreground tabular-nums">
                      {deckIdx + 1} of {list.length}
                    </span>
                    <button
                      type="button"
                      className={pagerBtn}
                      aria-label="Next item"
                      aria-controls="focus-question"
                      disabled={deckIdx >= list.length - 1}
                      onClick={() =>
                        setFocusIdx(Math.min(list.length - 1, deckIdx + 1))
                      }
                    >
                      <ChevronRight aria-hidden className="size-4" />
                    </button>
                  </span>
                )}
              </div>
              {open.length === 0 && (
                <Banner
                  tone="ok"
                  kicker={
                    askDone
                      ? "Ready for Gate 1"
                      : recDone
                        ? "Ready for Gate 2"
                        : "All done on your side"
                  }
                  text={
                    stage === "recon"
                      ? "All answered. Review job profit and commissions, then approve Gate 2."
                      : replies < total && !live
                        ? `Waiting on ${data.dakota.managerName.split(" ")[0]} (${shownReplies.length} of ${total}). Corrections show up here.`
                        : "Everything is answered. Review the draft, then approve Gate 1."
                  }
                  action={
                    askDone ? (
                      <Button size="lg" onClick={() => setStage("review")}>
                        Review the draft
                      </Button>
                    ) : recDone ? (
                      <Button size="lg" onClick={() => setStage("review2")}>
                        Review commissions
                      </Button>
                    ) : undefined
                  }
                />
              )}
              {focusDeck(
                list.map((c, i) => {
                  const id = idOf(c);
                  const position = `${i + 1} of ${list.length}`;
                  const d = decisions[id];
                  if (c === "dakota") {
                    return d ? (
                      <FoldedCard
                        key={id}
                        title={`Send ${data.dakota.managerName.split(" ")[0]} ${asked} job questions`}
                        value={d.label}
                        note={`Fixture mode: nothing was texted.${excluded.size ? ` ${excluded.size} unticked ${excluded.size === 1 ? "item stays" : "items stay"} with you.` : ""}`}
                        onUndo={sent ? undefined : () => undo(id)}
                      />
                    ) : (
                      <div key={id} id={`card-${id}`}>
                        <DakotaCard
                          review={data.dakota}
                          position={position}
                          excluded={excluded}
                          onToggle={(fid) =>
                            setExcluded((s) => {
                              const n = new Set(s);
                              if (n.has(fid)) n.delete(fid);
                              else n.add(fid);
                              return n;
                            })
                          }
                          onSend={(n) => {
                            setDecisions((x) => ({
                              ...x,
                              [id]: {
                                label: `Sent ${n} · not texted (fixture)`,
                                action: "primary",
                                saved: false,
                              },
                            }));
                            setSent(true);
                            feed(
                              `You approved the text to ${data.dakota.managerName.split(" ")[0]}: ${n} items.`,
                            );
                          }}
                          pending={false}
                          error={undefined}
                        />
                      </div>
                    );
                  }
                  if (d || isDone(c))
                    return (
                      <FoldedCard
                        key={id}
                        title={c.title}
                        value={
                          d
                            ? d.action === "primary"
                              ? c.done
                              : d.label
                            : "Resolved in Convex"
                        }
                        note={
                          d && !d.saved
                            ? "On this screen only: not saved."
                            : undefined
                        }
                        onUndo={d && !d.saved ? () => undo(id) : undefined}
                      />
                    );
                  return (
                    <div key={id} id={`card-${id}`}>
                      <OwnerCard
                        card={c}
                        position={position}
                        picked={picks[id]}
                        onPick={(k) => setPicks((p) => ({ ...p, [id]: k }))}
                        fill={fills[id] ?? ""}
                        onFill={(v) => setFills((f) => ({ ...f, [id]: v }))}
                        onAction={(a, label) => decide(c, a, label)}
                        pending={pendingIds.has(id)}
                        error={errors[id]}
                      />
                    </div>
                  );
                }),
              )}
            </article>
            {list.length > 0 && (
              <UpNext
                items={list.map((c) => ({
                  id: idOf(c),
                  title:
                    c === "dakota"
                      ? `Send ${data.dakota.managerName.split(" ")[0]} the list`
                      : c.title,
                  done: isDone(c),
                  tone: c === "dakota" ? "text" : c.tone,
                }))}
                onGo={(id) => {
                  setFocusIdx(
                    Math.max(
                      0,
                      list.findIndex((c) => idOf(c) === id),
                    ),
                  );
                  document
                    .getElementById("focus-question")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            )}
            {loose.length + kept.length > 0 && (
              // Owner-routed flags outside the deck: one compact list instead of stacked cards. Each row says what
              // it affects; a loose flag opens its page, a kept one stays here.
              <section
                aria-label="Also with you"
                className="rounded-card border bg-card"
              >
                <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs">
                  <span className="font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Also with you · {loose.length + kept.length}
                  </span>
                  <DataLabel kind={dataKind} />
                </header>
                <ul className="divide-y">
                  {loose.map((f) => (
                    <li key={f.id}>
                      <Link
                        href={`/c/${companyId}/flags/${f.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted"
                      >
                        <span className="truncate">
                          {checkTitle(f.checkId)}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {affectsLabel(f.checkId)} ›
                        </span>
                      </Link>
                    </li>
                  ))}
                  {kept.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <span className="truncate">
                        Kept with you: {checkTitle(f.checkId)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {affectsLabel(f.checkId)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        );

        // Money, the manager's progress and the live feed: below the questions, two across on wider screens.
        const rail = (
          <aside
            aria-label="This payroll"
            className="grid gap-4 md:grid-cols-2"
          >
            {stage2Money && data.stage2 ? (
              <MoneyCard
                label="Stage 2 · job profit"
                big={<Money cents={data.stage2.knownRevenueCents} />}
                delta={`Revenue on ${data.stage2.jobs.filter((j) => j.revenueCents !== null).length} jobs with revenue`}
                bars={[]}
                rows={[
                  {
                    label: "Ready to pay now",
                    value:
                      recDone || stage !== "recon" ? (
                        <Money cents={data.stage2.readyCents} />
                      ) : (
                        `after ${open.length} answers`
                      ),
                  },
                  {
                    label: "Waiting on customers",
                    value: data.stage2.commissions.filter(
                      (c) => c.state === "waiting",
                    ).length,
                  },
                ]}
                link={{
                  href: `/c/${companyId}/workbook`,
                  label: "See the workbook",
                }}
                dataKind={dataKind}
              />
            ) : r1 ? (
              <MoneyCard
                label={
                  stage === "filled1"
                    ? "Regular draft · not submitted"
                    : "Payroll so far"
                }
                big={<Money cents={r1.grossCents} />}
                delta={
                  r1.deltaCents === null ? (
                    "First payroll"
                  ) : (
                    <>
                      <Money cents={r1.deltaCents} signed /> vs last payroll,
                      before holds
                    </>
                  )
                }
                bars={[
                  {
                    label: "This payroll",
                    value: <Money cents={r1.grossCents} />,
                    width: 100,
                    now: true,
                  },
                  ...(r1.lastGrossCents === null
                    ? []
                    : [
                        {
                          label: "Last payroll",
                          value: <Money cents={r1.lastGrossCents} />,
                          width: Math.round(
                            (r1.lastGrossCents /
                              Math.max(r1.grossCents, r1.lastGrossCents)) *
                              100,
                          ),
                          now: false,
                        },
                      ]),
                ]}
                rows={[
                  {
                    label: "People",
                    value: `${data.people.total} · ${data.people.gusto} in Gusto`,
                  },
                  { label: "Venmo", value: <Money cents={r1.venmoCents} /> },
                ]}
                link={{
                  href: `/c/${companyId}/workbook`,
                  label: "Review payroll",
                }}
                dataKind={dataKind}
              />
            ) : null}
            {hasManager && (
              <ManagerProgress
                name={data.dakota.managerName}
                total={total}
                replies={shownReplies}
                sent={sent || live}
                live={live}
                inboxHref={`/c/${companyId}/manager`}
              />
            )}
            <div className="md:col-span-2">
              <LiveFeed
                companyId={companyId}
                cycleId={data.cycle?.id ?? ""}
                timeZone={company.timezone}
                fixtureEvents={data.audit}
                visibleFlagIds={new Set(raw.map((f) => f.id))}
                extra={extra}
              />
            </div>
          </aside>
        );

        // Prototype home: one centered column; the review, fill and done screens get more width for their tables.
        const narrow =
          !next &&
          (stage === "start" || stage === "asking" || stage === "recon");
        const needYou =
          (stage === "asking" || stage === "recon") && open.length > 0
            ? ` · ${open.length} ${open.length === 1 ? "item needs" : "items need"} review before Gate ${stage === "recon" ? 2 : 1}`
            : "";
        // Engine figures only: gross from the workbook preview, hours as each person's engine hours added up.
        const kpis =
          r1 && !next
            ? [
                {
                  label: "Gross pay (draft)",
                  value: <Money cents={r1.grossCents} />,
                },
                { label: "People", value: data.people.total },
                {
                  label: "Hours",
                  value: r1.people
                    .reduce((n, x) => n + (x.hours ?? 0), 0)
                    .toFixed(1),
                },
                data.cutoffLabel
                  ? { label: "Hours cutoff", value: data.cutoffLabel }
                  : { label: "Venmo", value: <Money cents={r1.venmoCents} /> },
              ]
            : [];

        return (
          <div
            className={`mx-auto flex w-full flex-col gap-[26px] ${narrow ? "max-w-[720px]" : "max-w-[1040px]"}`}
          >
            {DEMO_MODE && (
              <DemoBar
                stageName={next ? `Next payroll · ${next}` : STAGE_NAME[stage]}
                onBack={prevStage}
                onNext={nextStage}
                onReset={() => {
                  reset();
                  setSyncDemo(null);
                  setGustoDemo(null);
                }}
                sync={syncDemo !== null}
                onSync={() => setSyncDemo((s) => (s ? null : "partial"))}
                gustoDown={gustoDemo === true}
                onGusto={() => setGustoDemo((g) => (g ? null : true))}
                nextOn={next !== null}
                onNextPayroll={() => setNext((n) => (n ? null : "start"))}
              />
            )}

            <header className="flex flex-col gap-2">
              <h1 className="text-[clamp(30px,4vw,42px)] leading-[1.08]">
                <Greeting timeZone={company.timezone} />
                {data.ownerFirstName && `, ${data.ownerFirstName}`}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
                <span>
                  {data.cycle
                    ? `Pay period ${next && data.next ? data.next.periodLabel : data.periodLabel}`
                    : "No payroll in progress"}
                  {needYou}
                </span>
                <DataLabel
                  kind={dataKind}
                  detail={
                    data.cycle
                      ? `${company.label}, cycle ${(data.cycleNumber ?? 0) + (next ? 1 : 0)}${next ? " (example)" : ""}`
                      : company.label
                  }
                />
              </p>
            </header>

            {kpis.length > 0 && (
              <dl
                aria-label="Run summary"
                className="grid grid-cols-2 border-y sm:flex"
              >
                {kpis.map((k) => (
                  <div
                    key={k.label}
                    className="flex min-w-0 flex-1 flex-col gap-1 py-3 pr-4 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
                  >
                    <dt className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                      {k.label}
                    </dt>
                    <dd className="truncate font-medium tabular-nums">
                      {k.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {next && data.next ? (
              <>
                <Progress
                  companyId={companyId}
                  step={next === "start" ? -1 : 6}
                  caption={next === "review" ? "Waiting on you" : ""}
                  fraction={0.4}
                />
                {next === "start" ? (
                  <StartPanel
                    data={{
                      ...data,
                      periodLabel: data.next.periodLabel,
                      cutoffLabel: null,
                      last: null,
                    }}
                    dataKind={dataKind}
                    companyId={companyId}
                    onRun={() => setNext("review")}
                    running={false}
                    carried={data.next.carried.filter(
                      (c) => !c.id.startsWith("held-") || held,
                    )}
                    carriedFrom={data.next.fromLabel}
                  />
                ) : (
                  <NextReview
                    next={{
                      ...data.next,
                      rows: data.next.rows.filter(
                        (r) => r.tag !== "held" || held,
                      ),
                    }}
                    dataKind={dataKind}
                    held={nextHeld}
                    onHold={(h) => {
                      setNextHeld(h);
                      setNextApproved(false);
                    }}
                    approved={nextApproved}
                    onApprove={() => setNextApproved(true)}
                  />
                )}
                <p className="text-sm text-muted-foreground">
                  Example next payroll: cycle {(data.cycleNumber ?? 0) + 1} has
                  no records yet. Releases are worked out by the engine on a
                  synthetic payment.{" "}
                  {held
                    ? ""
                    : "Hold the ready commission in this payroll to see it come back here."}
                </p>
              </>
            ) : (
              <>
                <Progress
                  companyId={companyId}
                  step={step}
                  allDone={stage === "done"}
                  caption={caption}
                  fraction={fraction}
                  open={
                    stage === "asking" || stage === "recon" ? open.length : 0
                  }
                />

                {short.length > 0 && (
                  <SyncIncompleteBanner
                    problems={short}
                    example={syncDemo !== null}
                    state={syncState}
                    note={notes.sync || null}
                    onRetry={async () => {
                      if (syncDemo) {
                        setSyncDemo("busy");
                        setTimeout(() => setSyncDemo("full"), 1400);
                        return;
                      }
                      try {
                        if (!m || !data.cycle)
                          throw new Error("Convex not configured");
                        await m.syncRun({
                          companyId,
                          cycleId: data.cycle.id,
                          sources: [short[0].source],
                        });
                      } catch (e) {
                        setNotes((n) => ({
                          ...n,
                          sync: `sync.run is not live yet (${message(e)}).`,
                        }));
                      }
                    }}
                  />
                )}
                {(gustoDown || gustoDemo === false) && (
                  <GustoBanner
                    connected={!gustoDown}
                    example={gustoDemo !== null}
                    error={gustoDemo ? null : data.states.gusto.error}
                    onReconnect={() =>
                      gustoDemo
                        ? setGustoDemo(false)
                        : window.open("https://app.gusto.com", "_blank")
                    }
                  />
                )}

                {stage === "start" && !data.cycle && (
                  <Banner
                    tone="ask"
                    kicker="No pay cycle loaded"
                    text={`No pay cycle is loaded for ${company.label} yet. Stages, cards and reviews show here once the first sync runs.`}
                  />
                )}
                {stage === "start" && data.cycle && (
                  <StartPanel
                    data={data}
                    dataKind={dataKind}
                    companyId={companyId}
                    onRun={run}
                    running={false}
                    disabledReason={
                      data.cycle
                        ? null
                        : `No pay cycle is loaded for ${company.label} yet.`
                    }
                  />
                )}
                {notes.run && (
                  <p className="text-sm text-muted-foreground">{notes.run}</p>
                )}
                {stage === "run" && (
                  <RunPanel
                    run={data.run}
                    t={t}
                    onSkip={() => setT(RUN_END - 1)}
                  />
                )}

                {stage === "filled1" && (
                  <Banner
                    tone="ok"
                    kicker="Gusto draft filled · not submitted"
                    text={notes.g1 || "Next, check job profit for commissions."}
                    action={
                      <Button
                        size="lg"
                        onClick={() => setStage("reconRun")}
                        disabled={!data.stage2}
                      >
                        Start Stage 2
                      </Button>
                    }
                  />
                )}

                {(stage === "asking" || stage === "recon") && (
                  <>
                    {cardsCol}
                    {rail}
                  </>
                )}

                {stage === "review" &&
                  (r1 ? (
                    <ReviewDraft
                      review={r1}
                      dataKind={dataKind}
                      companyId={companyId}
                      onApprove={() => openGate(1)}
                      locked={gateLock}
                    />
                  ) : (
                    <Banner
                      tone="ask"
                      kicker="No draft"
                      text={`No workbook fixture for ${company.label} yet.`}
                    />
                  ))}
                {(stage === "fill1" || stage === "fill2") && (
                  <FillPanel
                    ft={ft}
                    note={notes[stage === "fill1" ? "g1" : "g2"] || null}
                    steps={
                      stage === "fill2"
                        ? [
                            "Prepare the off-cycle Bonus payroll",
                            `Add ${data.stage2?.commissions.filter((c) => c.state === "ready").length ?? 0} line from the engine`,
                            "Calculate in Gusto",
                          ]
                        : [
                            "Prepare the regular draft",
                            `Update ${r1?.people.filter((p) => p.group === "hourly" || p.group === "salary").length ?? 0} employees from the workbook`,
                            "Calculate in Gusto",
                          ]
                    }
                  />
                )}
                {stage === "reconRun" && data.stage2 && (
                  <ReconPanel stage2={data.stage2} cards={data.cards} rt={rt} />
                )}
                {stage === "review2" && data.stage2 && (
                  <ReviewCommissions
                    stage2={data.stage2}
                    dataKind={dataKind}
                    held={held}
                    onHold={setHeld}
                    onApprove={finish2}
                  />
                )}
                {stage === "done" && (
                  <DonePanel
                    periodLabel={data.periodLabel}
                    grossCents={r1?.grossCents ?? null}
                    offCycleCents={held ? 0 : (data.stage2?.readyCents ?? 0)}
                    held={held || !data.stage2?.readyCents}
                    asked={asked}
                    corrections={corrections}
                    carry={carry}
                    companyId={companyId}
                    onNext={data.next ? () => setNext("start") : null}
                    dataKind={dataKind}
                  />
                )}

                {stage === "filled1" && rail}
              </>
            )}

            <GateConfirm
              open={modal !== null}
              onOpenChange={(o) => !o && setModal(null)}
              title={
                modal === 1
                  ? "Approve wages and fill the Gusto draft?"
                  : "Approve commissions and fill the off-cycle draft?"
              }
              rows={
                modal === 1 && r1
                  ? [
                      {
                        label: "Gusto gross (engine preview)",
                        value: <Money cents={r1.grossCents} />,
                      },
                      {
                        label: "Employees",
                        value: r1.people.filter(
                          (p) => p.group === "hourly" || p.group === "salary",
                        ).length,
                      },
                      {
                        label: "Venmo, listed outside Gusto",
                        value: <Money cents={r1.venmoCents} />,
                      },
                    ]
                  : [
                      {
                        label: "Off-cycle draft",
                        value: <Money cents={data.stage2?.readyCents ?? 0} />,
                      },
                      {
                        label: "Lines",
                        value:
                          data.stage2?.commissions.filter(
                            (c) => c.state === "ready",
                          ).length ?? 0,
                      },
                      {
                        label: "Held until paid",
                        value: `${data.stage2?.commissions.filter((c) => c.state === "waiting").length ?? 0} commissions`,
                      },
                    ]
              }
              onConfirm={() => gate(modal ?? 1)}
            />

            <AgentActivity companyId={companyId} timezone={company.timezone} />

            <p className="text-sm text-muted-foreground">
              Draft only. RollPay never submits payroll. Steps:{" "}
              {STAGES.map((s) => s.label).join(" → ")}.
            </p>
          </div>
        );
      }}
    </FlagsSource>
  );
}

/** "Good evening" in the company's zone; the server and browser can disagree near the hour, so it's client-checked. */
function Greeting({ timeZone }: { timeZone: string }) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(new Date()),
  );
  return (
    <span suppressHydrationWarning>
      {hour < 5
        ? "Good evening"
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening"}
    </span>
  );
}
