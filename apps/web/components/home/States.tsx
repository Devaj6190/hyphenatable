"use client";

import { Button } from "@/components/ui/button";
import { objectWord } from "@/lib/home";
import { cn } from "@/lib/utils";
import type { SyncProblem } from "@/lib/view-types/home";
import { SystemMark } from "./Card";

// PR 8 error states. A short pull blocks only what its missing records could touch; Gusto disconnected locks
// Gate 1 and the drafts while checks, cards and answers keep going. Real runs come from syncRuns (complete=false);
// the demo can show an example with made-up counts, and says so.

export type SyncBannerState = "partial" | "busy" | "full";

export function SyncIncompleteBanner({
  problems,
  example,
  state,
  onRetry,
  note,
}: {
  problems: SyncProblem[];
  /** True for the demo example: counts are made up and labelled. */
  example: boolean;
  state: SyncBannerState;
  onRetry: () => void;
  note: string | null;
}) {
  const full = state === "full";
  const main = problems[0];
  const blocked = full
    ? [
        {
          t: `All ${main?.expected ?? ""} ${objectWord(main?.object ?? "")} are in. Checks re-ran.`,
          ok: true,
        },
        { t: "Gate 1 can go ahead once your cards are answered.", ok: true },
      ]
    : example
      ? [
          { t: "Pay for the people with entries on Oct 22 or 23", ok: false },
          {
            t: "Checks on those two days (overtime, long shifts, overlaps)",
            ok: false,
          },
          { t: "Gate 1 and the Gusto draft", ok: false },
          { t: "Your cards and the manager's list for Oct 10 – 21", ok: true },
        ]
      : [
          ...problems.map((p) => ({
            t: `Anything that uses ${p.system} ${objectWord(p.object)}`,
            ok: false,
          })),
          { t: "Gate 1 and the Gusto draft", ok: false },
          { t: "Cards about records that did come through", ok: true },
        ];
  return (
    <section
      aria-live="polite"
      className={cn(
        "flex flex-col gap-4 rounded-[18px] border p-5 sm:p-6",
        full ? "border-ok/30 bg-ok-soft/50" : "border-hold/40 bg-hold-soft/50",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-[11px] text-lg font-extrabold text-white",
            full ? "bg-ok" : "bg-hold",
          )}
        >
          {full ? "✓" : "!"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              "text-[11px] font-extrabold tracking-[0.07em] uppercase",
              full ? "text-ok" : "text-hold",
            )}
          >
            {main?.system ?? "Sync"} sync {full ? "complete" : "incomplete"}
            {example && " · example, counts are made up"}
          </span>
          <span className="text-xl font-semibold">
            {full
              ? `Sync finished: ${main?.expected} of ${main?.expected} ${objectWord(main?.object ?? "")}`
              : `We pulled ${main?.pulled} of ${main?.expected ?? "?"} ${objectWord(main?.object ?? "")}`}
          </span>
          <span className="text-muted-foreground">
            {full
              ? "Everything is in. Nothing was blocked for long."
              : `${main?.system} says ${main?.expected ?? "more"} exist for this cycle, but only ${main?.pulled} came through. Pay for anyone those could affect waits. Nothing is guessed.`}
          </span>
        </div>
        <Button
          variant={full ? "secondary" : "primary"}
          disabled={state !== "partial"}
          onClick={onRetry}
        >
          {full
            ? "Synced"
            : state === "busy"
              ? "Syncing…"
              : "Try the sync again"}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="flex flex-col gap-2 rounded-card bg-card p-4">
          {problems.map((p) => (
            <li
              key={`${p.source}-${p.object}`}
              className="flex flex-col gap-1.5"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <SystemMark system={p.system} size={20} />
                {p.system} {objectWord(p.object)}
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold",
                    full ? "bg-ok-soft text-ok" : "bg-hold-soft text-hold",
                  )}
                >
                  {full ? "Complete" : "Incomplete"}
                </span>
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    full ? "bg-ok" : "bg-hold",
                  )}
                  style={{
                    width: `${full || !p.expected ? 100 : Math.round((p.pulled / p.expected) * 100)}%`,
                  }}
                />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {full ? p.expected : p.pulled} of {p.expected ?? "unknown"}
                {p.error && ` · ${p.error}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 rounded-card bg-card p-4">
          <span className="text-sm font-semibold">What this blocks</span>
          <span className="text-xs text-muted-foreground">
            Only what the missing records could touch. Everything else keeps
            going.
          </span>
          <ul className="flex flex-col gap-1.5 text-sm">
            {blocked.map((b) => (
              <li key={b.t} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    b.ok ? "bg-ok" : "bg-destructive",
                  )}
                />
                <span className="flex-1">{b.t}</span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    b.ok ? "text-ok" : "text-destructive",
                  )}
                >
                  {b.ok ? (full ? "Unblocked" : "Keep going") : "Blocked"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        RollPay never fills a draft from a partial pull. Every sync records what
        it pulled against what the source says exists.{note ? ` ${note}` : ""}
      </p>
    </section>
  );
}

export function GustoBanner({
  connected,
  example,
  error,
  onReconnect,
}: {
  connected: boolean;
  example: boolean;
  error: string | null;
  onReconnect: () => void;
}) {
  return (
    <section
      aria-live="polite"
      className={cn(
        "flex flex-col gap-4 rounded-[18px] border p-5 sm:p-6",
        connected
          ? "border-ok/30 bg-ok-soft/50"
          : "border-destructive/30 bg-destructive-soft/60",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <SystemMark system="Gusto" size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              "text-[11px] font-extrabold tracking-[0.07em] uppercase",
              connected ? "text-ok" : "text-destructive",
            )}
          >
            Gusto {connected ? "connected" : "disconnected"}
            {example && " · example"}
          </span>
          <span className="text-xl font-semibold">
            {connected
              ? "Reconnected. Rates and people re-checked."
              : "Gusto needs you to sign in again"}
          </span>
          <span className="text-muted-foreground">
            {connected
              ? "Your answers still stand."
              : `${error ? `${error}. ` : "The connection expired. "}RollPay can't read rates or fill the draft. Your checks, cards and answers are saved.`}
          </span>
        </div>
        {!connected && <Button onClick={onReconnect}>Reconnect Gusto</Button>}
      </div>
      {!connected && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-card bg-card p-4 text-sm">
            <span className="font-semibold">Still works</span>
            {[
              "Pulling hours from Jobber",
              "Checks and your cards",
              "The manager's list and answers",
              "Job profit from QuickBooks",
            ].map((w) => (
              <span key={w} className="flex items-center gap-2">
                <span aria-hidden className="text-ok">
                  ✓
                </span>
                {w}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 rounded-card bg-card p-4 text-sm">
            <span className="font-semibold">Waits for Gusto</span>
            {[
              "Pay rates and who is active",
              "Filling the regular draft",
              "Filling the off-cycle draft",
            ].map((w) => (
              <span key={w} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-destructive"
                />
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
