"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { managerText } from "@/lib/home";
import { cn } from "@/lib/utils";
import type { DakotaReview } from "@/lib/view-types/home";
import { CardShell, SystemMark } from "./Card";

// "Approve a text": the one text to the manager, with every item it covers listed for review first. Unticking an
// item keeps it with the owner and rebuilds the text and its counts. The tick is screen state only: the courier
// takes the full list until the backend accepts an item list (C plan section 6 (c)).
export function DakotaCard({
  review,
  position,
  excluded,
  onToggle,
  onSend,
  pending,
  error,
}: {
  review: DakotaReview;
  position: string;
  excluded: ReadonlySet<string>;
  onToggle: (flagId: string) => void;
  onSend: (count: number) => void;
  pending: boolean;
  error: string | undefined;
}) {
  const first = review.managerName.split(" ")[0];
  const on = review.items.filter((i) => !excluded.has(i.flagId));
  const text = managerText(review.groups, on, review.period);
  const chips = review.groups
    .map((g) => ({ g, n: on.filter((i) => i.group === g.key).length }))
    .filter((c) => c.n > 0);
  return (
    <CardShell
      tone="text"
      icon="✉"
      kicker={`${position} · Approve a text · start here`}
      title={`Send ${first} ${review.items.length} job questions`}
      sub={`${first} fixes job facts in Jobber and taps I updated it. We re-check each one.`}
      actions={
        <>
          <Button
            size="lg"
            disabled={pending || on.length === 0}
            onClick={() => onSend(on.length)}
          >
            Approve and send {on.length}
          </Button>
          <span className="text-sm text-muted-foreground">
            No names or pay in the text
          </span>
          {error && (
            <p
              role="alert"
              className="w-full text-sm font-medium text-destructive"
            >
              {error}
            </p>
          )}
        </>
      }
    >
      <section
        aria-label="Review before sending"
        className="overflow-hidden rounded-[14px] border"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-muted/60 px-4 py-3">
          <b className="font-semibold">Review before sending</b>
          <span className="text-sm text-muted-foreground">
            Untick anything you'd rather handle yourself
          </span>
          <span className="ml-auto text-sm font-semibold tabular-nums">
            {on.length} of {review.items.length}
          </span>
        </div>
        <ul>
          {review.items.map((q) => {
            const off = excluded.has(q.flagId);
            const main = q.sources[0];
            return (
              <li
                key={q.flagId}
                className={cn(
                  "flex items-start gap-3 border-t px-4 py-3",
                  off && "opacity-55",
                )}
              >
                <label className="mt-0.5 grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md has-focus-visible:outline-2 has-focus-visible:outline-ring">
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={() => onToggle(q.flagId)}
                    className="peer sr-only"
                    aria-label={`Include ${q.title} in the text`}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[22px] place-items-center rounded-md",
                      off
                        ? "border-[1.5px] border-muted-foreground/40 bg-card"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {!off && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </label>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[11px] font-extrabold tracking-[0.07em] text-ask uppercase">
                      {q.category}
                    </span>
                    <span className="font-semibold">{q.title}</span>
                  </span>
                  <span className="text-sm">
                    <b className="font-semibold">Why:</b> {q.why}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {main && <SystemMark system={main.system} size={16} />}
                    {main?.system} ·{" "}
                    {q.sources.map((s) => s.recordId).join(", ")}
                    {off && (
                      <span className="font-medium text-hold">
                        {" "}
                        · stays with you
                      </span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(({ g, n }) => (
          <span
            key={g.key}
            className="rounded-full bg-ask-soft px-2.5 py-0.5 text-sm text-ask"
          >
            <b>{n}</b> {n === 1 ? g.one : g.many}
          </span>
        ))}
      </div>
      <figure className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-sunset text-[11px] font-extrabold text-sunset-ink"
        >
          RP
        </span>
        <blockquote className="rounded-[16px] rounded-tl-sm bg-muted px-4 py-3 leading-snug">
          {text}
        </blockquote>
        <figcaption className="sr-only">The text {first} gets</figcaption>
      </figure>
    </CardShell>
  );
}
