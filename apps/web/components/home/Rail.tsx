"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { cn } from "@/lib/utils";
import type { CardTone } from "@/lib/view-types/home";
import { TONE } from "./Card";

export function RailCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-card p-4 shadow-card",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The card list as a queue: tap one to jump to it. */
export function UpNext({
  items,
  onGo,
}: {
  items: { id: string; title: string; done: boolean; tone: CardTone }[];
  onGo: (id: string) => void;
}) {
  return (
    <RailCard>
      <span className="text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
        Up next
      </span>
      <ul className="flex flex-col">
        {items.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onGo(q.id)}
              disabled={q.done}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:hover:bg-transparent"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-md text-white",
                  q.done && "bg-ok",
                )}
                style={
                  q.done
                    ? undefined
                    : { background: TONE[q.tone].grad, opacity: 0.85 }
                }
              >
                {q.done && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  q.done ? "text-muted-foreground line-through" : "",
                )}
              >
                {q.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

/** Money so far: a big number, this vs last, and a few facts. Every amount is engine cents. */
export function MoneyCard({
  label,
  big,
  delta,
  bars,
  rows,
  link,
  dataKind,
}: {
  label: string;
  big: ReactNode;
  delta: ReactNode;
  bars: { label: string; value: ReactNode; width: number; now: boolean }[];
  rows: { label: string; value: ReactNode }[];
  link: { href: string; label: string };
  dataKind: DataKind;
}) {
  return (
    <RailCard>
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full bg-sunset" />
        {label}
        <DataLabel kind={dataKind} className="ml-auto" />
      </span>
      <span className="text-3xl font-bold tabular-nums">{big}</span>
      <span className="text-sm font-semibold text-muted-foreground">
        {delta}
      </span>
      <div className="flex flex-col gap-1.5">
        {bars.map((b) => (
          <div
            key={b.label}
            className="grid grid-cols-[84px_1fr_auto] items-center gap-2 text-xs"
          >
            <span className="text-muted-foreground">{b.label}</span>
            <span className="block h-2 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  b.now ? "bg-sunset" : "bg-muted-foreground/35",
                )}
                style={{ width: `${b.width}%` }}
              />
            </span>
            <span className="font-semibold tabular-nums">{b.value}</span>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t pt-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="text-right font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={link.href}
        className="text-sm font-medium text-link underline-offset-4 hover:underline"
      >
        {link.label} ›
      </Link>
    </RailCard>
  );
}

/** The manager's progress on their list: fixed in Jobber, answered, waiting. */
export function ManagerProgress({
  name,
  total,
  replies,
  sent,
  live,
  inboxHref,
}: {
  name: string;
  total: number;
  replies: { text: string; kind: "fixed" | "answered" }[];
  sent: boolean;
  /** Replies come from Convex flags (true) or the demo's simulated replies (false). */
  live: boolean;
  inboxHref: string;
}) {
  const done = replies.length;
  const status = !sent ? "Not sent" : done < total ? "Working" : "Done";
  const fixed = replies.filter((r) => r.kind === "fixed").length;
  return (
    <RailCard>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-full bg-ask-soft text-xs font-extrabold text-ask"
        >
          {name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground">
            Job manager · fixes job facts
          </span>
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold",
            !sent
              ? "bg-hold-soft text-hold"
              : done < total
                ? "bg-ask-soft text-ask"
                : "bg-ok-soft text-ok",
          )}
        >
          {status}
        </span>
      </div>
      <span className="text-2xl font-bold tabular-nums">
        {done}{" "}
        <span className="text-sm font-medium text-muted-foreground">
          of {total} sorted
        </span>
      </span>
      <div
        aria-hidden
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, total)}, 1fr)` }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length progress segments
            key={i}
            className={cn(
              "h-1.5 rounded-sm transition-colors duration-300",
              i < fixed ? "bg-ok" : i < done ? "bg-ask" : "bg-border",
            )}
          />
        ))}
      </div>
      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full bg-ok" />
          Fixed in Jobber
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full bg-ask" />
          Answered
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full bg-border" />
          Waiting
        </span>
      </span>
      {done === 0 ? (
        <p className="text-sm text-muted-foreground">
          {!sent
            ? `Not sent yet. ${name.split(" ")[0]} fixes things in Jobber; we re-check.`
            : "Replies arrive here."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {replies
            .slice(-3)
            .reverse()
            .map((r) => (
              <li key={r.text} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    r.kind === "fixed" ? "bg-ok" : "bg-ask",
                  )}
                />
                <span className="truncate">{r.text}</span>
              </li>
            ))}
        </ul>
      )}
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {live ? "From Convex flags" : "Replies simulated on this screen"}
        <Link
          href={inboxHref}
          className="text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          Open the inbox ›
        </Link>
      </span>
    </RailCard>
  );
}
