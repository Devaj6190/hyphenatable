"use client";

import { ArrowRight, CircleCheck, CirclePause, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DataKind } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { Button } from "@/components/ui/button";
import { checkTitle } from "@/lib/checks";
import { fixtureMessages } from "@/lib/fixtures";
import { affectsLabel, flagAgents, questionFor, recipient } from "@/lib/home";
import type { Flag } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Decision = "approved" | "denied";
const LIMIT = 3;

// "What we need from you": one card per item with one primary action. A decided card folds into a
// one-line confirmation with Undo while its neighbours move up (--dur-archive; instant with reduced motion).
export function NeedsYouList({
  items,
  decisions,
  onDecide,
  dataKind,
  companyId,
  total,
}: {
  /** Items that need the owner, plus the ones decided on this screen (kept in place). */
  items: Flag[];
  decisions: Record<string, Decision>;
  onDecide: (flag: Flag, decision: Decision | null) => void;
  dataKind: DataKind;
  companyId: string;
  /** Every problem this cycle, for the "see all" link. */
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const pending = items.filter((f) => !decisions[f.id]);
  const hidden = new Set(expanded ? [] : pending.slice(LIMIT).map((f) => f.id));

  return (
    <section aria-labelledby="needs-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="needs-title" className="text-xl font-semibold">
          What we need from you
        </h2>
        <span className="text-muted-foreground">
          {pending.length === 0
            ? "all done"
            : `${pending.length} ${pending.length === 1 ? "thing" : "things"}`}
        </span>
        <Link
          href={`/c/${companyId}/inputs`}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          See all {total} problems
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      {items.length === 0 ? (
        <AllClear />
      ) : (
        <ul className="flex flex-col">
          {items
            .filter((f) => !hidden.has(f.id))
            .map((f) => (
              <Item
                key={f.id}
                flag={f}
                decision={decisions[f.id]}
                onDecide={(d) => onDecide(f, d)}
                dataKind={dataKind}
              />
            ))}
        </ul>
      )}
      {pending.length === 0 && items.length > 0 && <AllClear />}
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

function Item({
  flag,
  decision,
  onDecide,
  dataKind,
}: {
  flag: Flag;
  decision: Decision | undefined;
  onDecide: (d: Decision | null) => void;
  dataKind: DataKind;
}) {
  const router = useRouter();
  const undo = useRef<HTMLButtonElement>(null);
  const q = questionFor(flag);
  const who = recipient(q);
  const detail = `/c/${flag.companyId}/flags/${flag.id}`;
  // A reply came in (the flag is answered) or a drafted text waits for approval. `flag` keeps its
  // status from the source; this screen's decision lives in `decision`.
  const reply =
    flag.status === "answered"
      ? fixtureMessages.find(
          (m) => m.questionId === q?.id && m.direction === "in",
        )
      : undefined;
  const kind: "reply" | "draft" | "decide" = reply
    ? "reply"
    : q?.status === "draft"
      ? "draft"
      : "decide";

  // Keep keyboard focus on the item: the folded side goes inert, so focus moves to Undo and,
  // after Undo, back to the card's primary action.
  const card = useRef<HTMLDivElement>(null);
  const decided = useRef(false);
  useEffect(() => {
    if (decision) {
      decided.current = true;
      undo.current?.focus({ preventScroll: true });
    } else if (decided.current) {
      card.current?.querySelector("button")?.focus({ preventScroll: true });
    }
  }, [decision]);

  const fold =
    "grid transition-[grid-template-rows,opacity] duration-(--dur-archive) ease-out-soft";

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
                kind === "draft"
                  ? `Send this question to ${who}?`
                  : kind === "reply"
                    ? `${who} replied. Approve the fix?`
                    : checkTitle(flag.checkId)
              }
              affectsLabel={affectsLabel(flag.checkId)}
              agents={flagAgents(flag.id)}
              approveLabel={
                kind === "draft"
                  ? "Approve and send"
                  : kind === "reply"
                    ? "Approve correction"
                    : "Open and decide"
              }
              onApprove={
                kind === "decide"
                  ? () => router.push(detail)
                  : () => onDecide("approved")
              }
              onEdit={kind === "draft" ? () => router.push(detail) : undefined}
              onDeny={kind === "decide" ? undefined : () => onDecide("denied")}
              href={kind === "decide" ? null : detail}
            >
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
              decision === "denied" ? "border-hold bg-hold-soft" : "bg-card",
            )}
          >
            {decision === "denied" ? (
              <CirclePause aria-hidden className="size-5 shrink-0 text-hold" />
            ) : (
              <CircleCheck aria-hidden className="size-5 shrink-0 text-ok" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-medium">
                {decision === "denied"
                  ? kind === "draft"
                    ? "Not sent."
                    : "Correction not approved."
                  : kind === "draft"
                    ? `Approved. Goes to ${who} next.`
                    : "Correction approved."}
              </span>{" "}
              <span className="text-muted-foreground">
                {decision === "denied"
                  ? "Only this item is held until you decide."
                  : kind === "draft"
                    ? "We'll show the reply here."
                    : "It goes into the workbook."}
              </span>
            </span>
            <Button
              ref={undo}
              variant="quiet"
              size="sm"
              onClick={() => onDecide(null)}
            >
              <Undo2 aria-hidden />
              Undo
            </Button>
          </output>
        </div>
      </div>
    </li>
  );
}
