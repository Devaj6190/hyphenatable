"use client";

import {
  ArrowRight,
  CircleCheck,
  CirclePause,
  Flag as GateIcon,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { Button } from "@/components/ui/button";
import { checkTitle } from "@/lib/checks";
import { affectsLabel, infoFor } from "@/lib/home";
import type { Flag } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FlagInfo } from "@/lib/view-types";

/** A choice made on this screen. `saved` is false in fixture mode: nothing reaches Convex. */
export type Decision = {
  kind: "approved" | "denied";
  /** Pick a match: the job the owner linked, or null when they chose to ask instead. */
  job?: string | null;
  saved: boolean;
};

const LIMIT = 3;

// "What we need from you": one card per item with one primary action. A decided card folds into a
// one-line confirmation with Undo while its neighbours move up (--dur-archive; instant with reduced motion).
export function NeedsYouList({
  items,
  info,
  decisions,
  onDecide,
  pendingIds,
  errors,
  dataKind,
  companyId,
  total,
  gate,
}: {
  /** Items that need the owner, plus the ones decided on this screen (kept in place). */
  items: Flag[];
  info: Record<string, FlagInfo>;
  decisions: Record<string, Decision>;
  onDecide: (flag: Flag, decision: Omit<Decision, "saved"> | null) => void;
  /** Flags with a save in flight, and the error from a save that failed. */
  pendingIds: ReadonlySet<string>;
  errors: Record<string, string>;
  dataKind: DataKind;
  companyId: string;
  /** Every problem this cycle, for the "see all" link. */
  total: number;
  /** The gate the cycle waits at, if any. Shown first: nothing moves until the owner approves it. */
  gate: { label: string; hint: string } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const pending = items.filter((f) => !decisions[f.id]);
  const things = pending.length + (gate ? 1 : 0);
  const hidden = new Set(expanded ? [] : pending.slice(LIMIT).map((f) => f.id));

  return (
    <section aria-labelledby="needs-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="needs-title" className="text-xl font-semibold">
          What we need from you
        </h2>
        <span className="text-muted-foreground">
          {things === 0
            ? "all done"
            : `${things} ${things === 1 ? "thing" : "things"}`}
        </span>
        <Link
          href={`/c/${companyId}/inputs`}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          See all {total} problems
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      {gate && <GateCard gate={gate} companyId={companyId} />}
      {items.length === 0 ? (
        !gate && <AllClear />
      ) : (
        <ul className="flex flex-col">
          {items
            .filter((f) => !hidden.has(f.id))
            .map((f) => (
              <Item
                key={f.id}
                flag={f}
                info={infoFor(info, f.id)}
                decision={decisions[f.id]}
                onDecide={(d) => onDecide(f, d)}
                pending={pendingIds.has(f.id)}
                error={errors[f.id]}
                dataKind={dataKind}
              />
            ))}
        </ul>
      )}
      {things === 0 && items.length > 0 && <AllClear />}
      {hidden.size > 0 && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setExpanded(true)}
        >
          Show {hidden.size} more
        </Button>
      )}
    </section>
  );
}

function GateCard({
  gate,
  companyId,
}: {
  gate: { label: string; hint: string };
  companyId: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-hold bg-hold-soft p-5">
      <GateIcon aria-hidden className="size-5 shrink-0 text-hold" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold">{gate.label} is waiting on you</p>
        <p className="text-muted-foreground">
          {gate.hint}. Nothing moves past it until you approve.
        </p>
      </div>
      <Link
        href={`/c/${companyId}/workbook`}
        className="inline-flex items-center gap-1 font-medium text-link underline-offset-4 hover:underline"
      >
        Review in the workbook
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

function AllClear() {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-dashed bg-card/60 p-6">
      <p className="font-semibold">Nothing needs you right now.</p>
      <p className="text-muted-foreground">
        New problems, replies and rules to approve show up here first. Held
        items stay listed below until you decide.
      </p>
    </div>
  );
}

const ASK = "ask";

function Item({
  flag,
  info,
  decision,
  onDecide,
  pending,
  error,
  dataKind,
}: {
  flag: Flag;
  info: FlagInfo;
  decision: Decision | undefined;
  onDecide: (d: Omit<Decision, "saved"> | null) => void;
  pending: boolean;
  error: string | undefined;
  dataKind: DataKind;
}) {
  const router = useRouter();
  const undo = useRef<HTMLButtonElement>(null);
  const { question: q, recipient: who, reply } = info;
  const detail = `/c/${flag.companyId}/flags/${flag.id}`;
  // A reply came in (the flag is answered), a purchase needs a job (pick a match), or a drafted text waits
  // for approval. `flag` keeps its status from the source; this screen's decision lives in `decision`.
  const jobs = (q?.options ?? []).filter((o) => o !== "not sure");
  const kind: "reply" | "match" | "draft" | "decide" = reply
    ? "reply"
    : flag.checkId === "CHK-14" && q?.status === "draft" && jobs.length > 0
      ? "match"
      : q?.status === "draft"
        ? "draft"
        : "decide";
  const [pick, setPick] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);

  // Keep keyboard focus on the item: the folded side goes inert, so focus moves to Undo and,
  // after Undo, back to the card's first visible button (source chips in the closed details are hidden).
  const card = useRef<HTMLDivElement>(null);
  const decided = useRef(false);
  useEffect(() => {
    if (decision) {
      decided.current = true;
      undo.current?.focus({ preventScroll: true });
    } else if (decided.current) {
      [...(card.current?.querySelectorAll("button") ?? [])]
        .find((b) => b.checkVisibility())
        ?.focus({ preventScroll: true });
    }
  }, [decision]);

  const fold =
    "grid transition-[grid-template-rows,opacity] duration-(--dur-archive) ease-out-soft";

  function approve() {
    if (kind === "decide") return router.push(detail);
    if (kind === "match") {
      if (!pick) return setNudge(true);
      return onDecide({ kind: "approved", job: pick === ASK ? null : pick });
    }
    onDecide({ kind: "approved" });
  }

  // Saved decisions say what happens next; fixture ones only say what was chosen on this screen.
  const here = decision?.saved ? "" : " on this screen";
  const confirm =
    decision?.kind === "denied"
      ? kind === "reply"
        ? `Correction not approved${here}.`
        : `Held${here}. Only this item waits until you decide.`
      : decision?.job
        ? `Linked to job ${decision.job}${here}.`
        : kind === "reply"
          ? decision?.saved
            ? "Correction approved. It goes into the workbook."
            : "Correction approved on this screen."
          : decision?.saved
            ? `Approved. Goes to ${who} next.`
            : "Approved on this screen.";

  return (
    <li className="flex flex-col">
      <div
        className={cn(
          fold,
          decision ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
        )}
        inert={Boolean(decision)}
      >
        <div className="-m-2 min-h-0 overflow-hidden p-2">
          <div ref={card} className="pb-4">
            <FlagCard
              flag={flag}
              dataKind={dataKind}
              headline={
                kind === "match"
                  ? "Pick a match: which job is this purchase for?"
                  : kind === "draft"
                    ? `Send this question to ${who}?`
                    : kind === "reply"
                      ? `${who} replied. Approve the fix?`
                      : checkTitle(flag.checkId)
              }
              affectsLabel={affectsLabel(flag.checkId)}
              agents={info.agents}
              approveLabel={
                kind === "match"
                  ? pick === ASK
                    ? "Approve and send"
                    : pick
                      ? `Link to job ${pick}`
                      : "Link to the job"
                  : kind === "draft"
                    ? "Approve and send"
                    : kind === "reply"
                      ? "Approve correction"
                      : "Open and decide"
              }
              onApprove={approve}
              onEdit={kind === "draft" ? () => router.push(detail) : undefined}
              onDeny={
                kind === "decide"
                  ? undefined
                  : () => onDecide({ kind: "denied" })
              }
              pending={pending}
              href={kind === "decide" ? null : detail}
            >
              {kind === "match" && q && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm text-muted-foreground">
                    Pick the job, or ask {who}. QuickBooks is not changed.
                  </legend>
                  {[...jobs, ASK].map((o) => (
                    <label
                      key={o}
                      className="flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2 has-checked:border-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring"
                    >
                      <input
                        type="radio"
                        name={`match-${flag.id}`}
                        value={o}
                        checked={pick === o}
                        onChange={() => {
                          setPick(o);
                          setNudge(false);
                        }}
                        className="accent-foreground"
                      />
                      {o === ASK
                        ? `Not sure. Ask ${who} instead`
                        : o === "overhead"
                          ? "Overhead, no job"
                          : `Job ${o}`}
                    </label>
                  ))}
                  {pick === ASK && (
                    <blockquote className="rounded-card rounded-tl-sm bg-muted px-4 py-3 leading-snug">
                      {q.text}
                    </blockquote>
                  )}
                  {nudge && (
                    <p className="text-sm font-medium text-hold">
                      Pick one first.
                    </p>
                  )}
                </fieldset>
              )}
              {kind === "draft" && q && (
                <figure className="flex flex-col gap-2">
                  <figcaption className="text-sm text-muted-foreground">
                    Text to {who}
                    {q.kind === "poll" && " · sent as a poll"}
                  </figcaption>
                  <blockquote className="rounded-card rounded-tl-sm bg-muted px-4 py-3 leading-snug">
                    {q.text}
                  </blockquote>
                  <p className="text-sm text-muted-foreground">
                    Nothing is sent until you approve.
                  </p>
                </figure>
              )}
              {kind === "reply" && reply && (
                <figure className="flex flex-col gap-2">
                  <figcaption className="text-sm text-muted-foreground">
                    {who} replied by text
                  </figcaption>
                  <blockquote className="self-start rounded-card rounded-tl-sm bg-ask-soft px-4 py-2 font-medium text-ask">
                    {reply.text}
                  </blockquote>
                  {reply.interpretation && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        Messenger read it as:{" "}
                      </span>
                      {reply.interpretation}
                    </p>
                  )}
                </figure>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-3 text-sm font-medium text-destructive"
                >
                  {error}
                </p>
              )}
            </FlagCard>
          </div>
        </div>
      </div>

      <div
        className={cn(
          fold,
          decision ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0",
        )}
        inert={!decision}
      >
        <div className="min-h-0 overflow-hidden">
          <output
            className={cn(
              "mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border px-4 py-3",
              decision?.kind === "denied"
                ? "border-hold bg-hold-soft"
                : "bg-card",
            )}
          >
            {decision?.kind === "denied" ? (
              <CirclePause aria-hidden className="size-5 shrink-0 text-hold" />
            ) : (
              <CircleCheck
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-medium">{confirm}</span>
              {decision && !decision.saved && (
                <span className="text-muted-foreground">
                  {" "}
                  Not saved (fixture mode): nothing was sent or changed.
                </span>
              )}
            </span>
            {decision && !decision.saved && (
              <Button
                ref={undo}
                variant="quiet"
                size="sm"
                onClick={() => onDecide(null)}
              >
                <Undo2 aria-hidden />
                Undo
              </Button>
            )}
          </output>
        </div>
      </div>
    </li>
  );
}
