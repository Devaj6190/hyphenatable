"use client";

import { Check, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Money } from "@/components/Money";
import { SourceChip } from "@/components/SourceChip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardTone, HomeCard } from "@/lib/view-types/home";

// The mockup's card templates (Cards board): a tone bar, an icon tile, kicker, title, why, a body that depends on
// the kind (pick, fill, facts, bars, diff), then one primary action. An answered card folds to one line with Undo.

export const TONE: Record<CardTone, { grad: string; kicker: string }> = {
  text: {
    grad: "var(--ask)",
    kicker: "text-ask",
  },
  sunset: {
    grad: "var(--link)",
    kicker: "text-link",
  },
  gold: {
    grad: "var(--hold)",
    kicker: "text-hold",
  },
  coral: {
    grad: "var(--destructive)",
    kicker: "text-destructive",
  },
  sky: {
    grad: "var(--ask)",
    kicker: "text-ask",
  },
  green: {
    grad: "var(--ok)",
    kicker: "text-ok",
  },
};

const MARK: Record<string, { letter: string; color: string; round: boolean }> =
  {
    Jobber: { letter: "J", color: "#1C4E80", round: false },
    Gusto: { letter: "g", color: "#F45D48", round: false },
    QuickBooks: { letter: "qb", color: "#2CA01C", round: true },
  };

export function SystemMark({
  system,
  size = 22,
}: {
  system: string;
  size?: number;
}) {
  const m = MARK[system];
  if (!m) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center font-extrabold text-white",
        m.round ? "rounded-full" : "rounded-md",
      )}
      style={{
        width: size,
        height: size,
        background: m.color,
        fontSize: Math.round(size * 0.45),
      }}
    >
      {m.letter}
    </span>
  );
}

const AVATAR = [
  "#F5A524",
  "#EF6A7E",
  "#9B6BF2",
  "#3EA6D8",
  "#2FA37A",
  "#E07B39",
];
export function Avatar({
  name,
  i = 0,
  size = 34,
}: {
  name: string;
  i?: number;
  size?: number;
}) {
  const ini = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full text-xs font-bold text-white"
      style={{
        width: size,
        height: size,
        background: AVATAR[i % AVATAR.length],
      }}
    >
      {ini}
    </span>
  );
}

/** What the owner chose on this screen. `saved` is false unless a Convex mutation took it. */
export type CardDecision = {
  label: string;
  /** The primary or secondary action. */
  action: "primary" | "secondary";
  saved: boolean;
};

export function CardShell({
  tone,
  icon,
  kicker,
  title,
  sub,
  children,
  actions,
  className,
}: {
  tone: CardTone;
  icon: string;
  kicker: string;
  title: string;
  sub: string;
  children?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-[18px] border bg-card shadow-[0_2px_4px_rgb(26_31_54/0.05),0_24px_48px_-28px_rgb(26_31_54/0.35)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        className,
      )}
    >
      <div aria-hidden className="h-1.5" style={{ background: t.grad }} />
      <div className="flex items-start gap-4 px-5 pt-5 pb-4 sm:px-6">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-[14px] text-xl font-extrabold text-white shadow-[0_8px_18px_-10px_rgb(26_31_54/0.5)]"
          style={{ background: t.grad }}
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className={cn(
              "text-[11px] font-extrabold tracking-[0.07em] uppercase",
              t.kicker,
            )}
          >
            {kicker}
          </span>
          <h3 className="text-lg leading-snug font-semibold">{title}</h3>
          <p className="text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children && (
        <div className="flex flex-col gap-3 px-5 pb-4 sm:px-6">{children}</div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-muted/40 px-5 py-3.5 sm:px-6">
        {actions}
      </div>
    </article>
  );
}

/** One answered card, folded. Undo only when nothing was saved. */
export function FoldedCard({
  title,
  value,
  onUndo,
  note,
}: {
  title: string;
  value: string;
  onUndo?: () => void;
  note?: string;
}) {
  const undo = useRef<HTMLButtonElement>(null);
  useEffect(() => undo.current?.focus({ preventScroll: true }), []);
  return (
    <output className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border bg-card px-4 py-3 motion-safe:animate-in motion-safe:fade-in">
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full bg-ok text-white dark:text-background"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
      {note && (
        <span className="w-full pl-8 text-xs text-muted-foreground">
          {note}
        </span>
      )}
      {onUndo && (
        <Button ref={undo} variant="quiet" size="sm" onClick={onUndo}>
          <Undo2 aria-hidden />
          Undo
        </Button>
      )}
    </output>
  );
}

export function Sources({ sources }: { sources: HomeCard["sources"] }) {
  const seen = new Set<string>();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Source</span>
      {sources
        .filter((s) => {
          const k = `${s.system}-${s.recordId}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((s) => (
          <SourceChip
            key={`${s.system}-${s.recordId}`}
            system={s.system}
            recordId={s.recordId}
          />
        ))}
    </div>
  );
}

/** A HomeCard, open. `picked`/`fill` are this screen's state; the parent decides what an action does. */
export function OwnerCard({
  card,
  position,
  picked,
  onPick,
  fill,
  onFill,
  onAction,
  pending,
  error,
}: {
  card: HomeCard;
  /** "3 of 9". */
  position: string;
  picked: string | undefined;
  onPick: (key: string) => void;
  fill: string;
  onFill: (v: string) => void;
  onAction: (action: "primary" | "secondary", label: string) => void;
  pending: boolean;
  error: string | undefined;
}) {
  const needPick = card.kind === "pick" && !picked;
  const needFill =
    card.kind === "fill" && !/^\d+(\.\d{1,2})?$/.test(fill.trim());
  const choice = card.options.find((o) => o.key === picked);
  const max = Math.max(1, ...card.bars.map((b) => b.cents));
  return (
    <CardShell
      tone={card.tone}
      icon={card.icon}
      kicker={`${position} · ${card.kicker}`}
      title={card.title}
      sub={card.sub}
      actions={
        <>
          <Button
            size="lg"
            disabled={pending || needPick || needFill}
            onClick={() =>
              onAction(
                "primary",
                card.kind === "pick" && choice
                  ? choice.value
                  : card.kind === "fill"
                    ? `$${fill.trim()}/h`
                    : card.primary,
              )
            }
          >
            {needPick ? "Pick one to continue" : card.primary}
          </Button>
          {card.secondary && (
            <Button
              size="lg"
              variant="secondary"
              disabled={pending}
              onClick={() => onAction("secondary", card.secondary ?? "")}
            >
              {card.secondary}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{card.foot}</span>
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
      {card.kind === "pick" && (
        <fieldset
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(${card.options.length > 2 ? 9 : 12}rem, 1fr))`,
          }}
        >
          <legend className="sr-only">{card.title}</legend>
          {card.options.map((o) => (
            <label
              key={o.key}
              className={cn(
                "flex min-h-24 cursor-pointer flex-col items-start gap-1.5 rounded-[14px] border-2 px-4 py-3.5 transition-[border-color,background-color] duration-(--dur-hover)",
                "has-focus-visible:outline-2 has-focus-visible:outline-ring",
                picked === o.key
                  ? "border-sunset-2 bg-accent shadow-[0_8px_20px_-12px_rgb(255_122_61/0.6)]"
                  : "border-border bg-background/60 hover:border-muted-foreground/40",
              )}
            >
              <input
                type="radio"
                name={`pick-${card.id}`}
                value={o.key}
                checked={picked === o.key}
                onChange={() => onPick(o.key)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
                {o.system && <SystemMark system={o.system} />}
                {o.kicker}
              </span>
              <span className="text-xl font-bold tabular-nums">{o.value}</span>
              <span className="text-sm text-muted-foreground">{o.hint}</span>
            </label>
          ))}
        </fieldset>
      )}
      {card.kind === "fill" && card.fill && (
        <div className="flex flex-col gap-2">
          <label className="flex max-w-xs items-center gap-2 rounded-control border-2 bg-background px-3 py-2 has-focus-visible:border-sunset-2">
            <span className="text-sm text-muted-foreground">
              {card.fill.label}
            </span>
            <span className="ml-auto font-semibold">$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={fill}
              onChange={(e) => onFill(e.target.value)}
              className="w-20 bg-transparent text-right text-lg font-semibold tabular-nums outline-none"
            />
            <span className="text-muted-foreground">/h</span>
          </label>
          {card.fill.hint && (
            <span className="text-sm text-muted-foreground">
              {card.fill.hint}
            </span>
          )}
        </div>
      )}
      {card.kind === "facts" && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {card.facts.map((f, i) => (
            <div
              key={`${f.label}-${i}`}
              className="flex items-center gap-3 rounded-control bg-muted/60 px-3 py-2.5"
            >
              {f.person && <Avatar name={f.label} i={i} />}
              <div className="flex min-w-0 flex-col">
                <dt className="truncate text-sm text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="font-semibold tabular-nums">{f.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
      {card.kind === "bars" && (
        <figure className="flex flex-col gap-2">
          <div className="flex h-36 items-end gap-3 rounded-control bg-muted/60 px-4 pt-3 pb-2">
            {card.bars.map((b, i) => (
              <div
                key={`${b.label}-${i}`}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <Money
                  cents={b.cents}
                  className={cn(
                    "text-xs font-semibold",
                    b.now ? "text-destructive" : "text-muted-foreground",
                  )}
                />
                <span
                  className="block w-full max-w-12 rounded-t-[7px] rounded-b-[2px] motion-safe:animate-in motion-safe:slide-in-from-bottom-4"
                  style={{
                    height: `${Math.max(4, Math.round((b.cents / max) * 80))}px`,
                    background: b.now ? TONE.coral.grad : "var(--border)",
                  }}
                />
                <span className="text-xs text-muted-foreground">{b.label}</span>
              </div>
            ))}
          </div>
          <figcaption className="text-xs text-muted-foreground">
            Gross per payroll: Gusto records, then this cycle's engine draft.
          </figcaption>
        </figure>
      )}
      {card.kind === "diff" && (
        <dl className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 gap-y-2 rounded-control bg-muted/60 px-4 py-3 text-sm">
          {card.diff.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="text-right tabular-nums text-muted-foreground line-through decoration-muted-foreground/50">
                {d.before}
              </dd>
              <dd className="text-right font-bold tabular-nums">{d.after}</dd>
            </div>
          ))}
        </dl>
      )}
      <Sources sources={card.sources} />
    </CardShell>
  );
}
