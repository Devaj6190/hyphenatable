"use client";

import { ChevronRight, ExternalLink, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import type { DataKind } from "@/components/DataLabel";
import { type Recheck, recheckSentence } from "@/components/JobberRecheck";
import { SimulatedChip } from "@/components/SimulatedChip";
import { Button } from "@/components/ui/button";
import { WorkerThread } from "@/components/WorkerThread";
import { DEMO_MODE } from "@/lib/demo";
import { cn } from "@/lib/utils";
import type { ManagerItem, SourceRef } from "@/lib/view-types/manager";
import type { ItemState } from "./inboxState";

// One inbox item: a header row that opens it, then why + source records, then either the fix-in-Jobber flow
// (I updated it → checking → fixed / still wrong) or the one-tap options. Hours, jobs and record ids only.

/** The JobberRecheck state behind an item's checking / still-wrong / fixed copy. */
export function recheckOf(item: ManagerItem, s: ItemState): Recheck {
  const n = item.sources.filter((x) => x.system === "Jobber").length;
  if (s.st === "checking")
    return DEMO_MODE
      ? { state: "syncing", pulled: 0, expected: n }
      : { state: "waiting" };
  if (s.st === "still-there" || s.st === "fixed")
    return { state: s.st, at: s.at, pulled: n, expected: n };
  return { state: "idle" };
}

const MARK: Record<string, string> = {
  Jobber: "J",
  QuickBooks: "qb",
  Gusto: "G",
};

/** "Jobber · a-te-0106, a-te-0146 · rule a-rule-02": every record the flag names, grouped by system. */
export function SourceLine({
  sources,
  ruleId,
}: {
  sources: SourceRef[];
  ruleId: string | null;
}) {
  const systems = [...new Set(sources.map((s) => s.system))];
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {systems.map((sys) => (
        <span key={sys} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center text-[8px] font-extrabold text-white",
              sys === "QuickBooks"
                ? "rounded-full bg-[#2CA01C]"
                : "rounded-sm bg-[#1C4E80]",
            )}
          >
            {MARK[sys]}
          </span>
          {sys} ·{" "}
          {sources
            .filter((s) => s.system === sys)
            .map((s) => s.recordId)
            .join(", ")}
        </span>
      ))}
      {ruleId && <span>Rule {ruleId}</span>}
    </p>
  );
}

export function InboxItem({
  item,
  state,
  open,
  onToggle,
  onUpdated,
  onAnswer,
  ownerName,
  workerAnswer,
  timeZone,
  dataKind,
}: {
  item: ManagerItem;
  state: ItemState;
  open: boolean;
  onToggle: () => void;
  onUpdated: () => void;
  onAnswer: (option: number) => void;
  ownerName: string;
  /** What the worker answered on their own page, if they did. */
  workerAnswer: string | null;
  timeZone: string;
  dataKind: DataKind;
}) {
  const bodyId = useId();
  // Fix items start in the Jobber flow; answer items start on the options. Either can switch.
  const [mode, setMode] = useState<"fix" | "pick">(
    item.kind === "fix" ? "fix" : "pick",
  );
  const [pick, setPick] = useState<number | null>(null);
  const wrong = state.st === "still-there";
  const checking = state.st === "checking";
  const recheck = recheckOf(item, state);
  const isFixPick = pick !== null && pick === item.fixOption;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-card bg-card transition-shadow duration-(--dur-hover)",
        open
          ? "border-[1.5px] border-foreground shadow-raised"
          : "border shadow-card",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold",
            wrong
              ? "bg-destructive-soft text-destructive"
              : item.kind === "fix"
                ? "bg-ask-soft text-ask"
                : "bg-accent text-link",
          )}
        >
          {wrong ? "!" : item.kind === "fix" ? "J" : "?"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-bold tracking-[0.04em] text-muted-foreground uppercase">
            {item.category}
            {wrong && " · still wrong"}
            {checking && " · checking"}
          </span>
          <span className="text-[0.9375rem] leading-snug font-semibold">
            {item.title}
          </span>
          {item.when && (
            <span className="text-xs text-muted-foreground">{item.when}</span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-(--dur-tab) ease-out-soft",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div
          id={bodyId}
          className="flex animate-in flex-col gap-3 px-3.5 pb-3.5 duration-(--dur-tab) fade-in slide-in-from-top-1"
        >
          <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Why we're asking:</span>{" "}
              {item.why}
            </p>
            {item.rows.length > 0 && (
              <ul className="flex flex-col gap-1">
                {item.rows.map((r) => (
                  <li
                    key={r.recordId}
                    className="flex justify-between gap-2 rounded-lg bg-card px-2.5 py-2 text-[0.8125rem] tabular-nums"
                  >
                    <span className="text-muted-foreground">{r.recordId}</span>
                    <span className="text-right font-semibold">{r.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <SourceLine sources={item.sources} ruleId={item.ruleId} />
          </div>

          {workerAnswer && (
            <p className="rounded-xl bg-ask-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-ask">
              <span className="font-semibold">
                {item.worker ?? "The worker"} answered:
              </span>{" "}
              {workerAnswer}. Fix Jobber to match, or tell us below.
            </p>
          )}

          {item.thread && (
            <WorkerThread
              thread={item.thread}
              title="Replies"
              dataKind={dataKind}
              timezone={timeZone}
            />
          )}

          {checking ? (
            <div aria-live="polite" className="flex flex-col gap-2">
              <p className="flex min-h-12 items-center gap-2.5 rounded-xl bg-muted px-3.5 text-[0.9375rem] font-semibold">
                <LoaderCircle
                  aria-hidden
                  className="size-[18px] animate-spin text-sunset-2 motion-reduce:animate-none"
                />
                {DEMO_MODE ? "Checking Jobber…" : "Waiting for the next sync"}
              </p>
              <p className="text-xs text-muted-foreground">
                {recheckSentence(
                  recheck,
                  item.sources.map((s) => s.recordId),
                  item.checkId,
                  timeZone,
                )}
              </p>
            </div>
          ) : mode === "fix" && item.fix ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-snug">
                <span className="font-semibold">In Jobber:</span> {item.fix}
              </p>
              {wrong && (
                <p
                  aria-live="polite"
                  className="animate-in rounded-[10px] bg-destructive-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-destructive fade-in"
                >
                  <span className="font-semibold">Still wrong in Jobber.</span>{" "}
                  {recheckSentence(
                    recheck,
                    item.sources.map((s) => s.recordId),
                    item.checkId,
                    timeZone,
                  )}{" "}
                  Save in Jobber, then tap Check again.
                  {DEMO_MODE && <SimulatedChip className="ml-1 align-middle" />}
                </p>
              )}
              {item.link && (
                <a
                  href={item.link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="pressable flex min-h-[46px] items-center justify-center gap-2 rounded-xl border bg-card text-[0.9375rem] font-semibold outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-[#1C4E80] text-[10px] font-extrabold text-white"
                  >
                    J
                  </span>
                  {item.link.label}
                  <ExternalLink aria-hidden className="size-3.5 opacity-60" />
                </a>
              )}
              {item.link && !item.link.recordLevel && (
                <p className="text-xs text-muted-foreground">
                  No direct link to the record yet. Look for{" "}
                  {item.sources.map((s) => s.recordId).join(", ")}.
                </p>
              )}
              <Button
                size="lg"
                className="min-h-[50px] rounded-xl text-base font-bold"
                onClick={onUpdated}
              >
                {wrong ? "Check again" : "I updated it"}
              </Button>
              {item.kind === "fix" ? (
                <Button
                  variant="quiet"
                  className="h-auto min-h-10 text-sm whitespace-normal"
                  onClick={() => setMode("pick")}
                >
                  Can't fix it in Jobber now? Tell us which is right
                </Button>
              ) : (
                <Button
                  variant="quiet"
                  className="min-h-9 text-[0.8125rem] text-muted-foreground"
                  onClick={() => {
                    setPick(null);
                    setMode("pick");
                  }}
                >
                  ‹ Back to the question
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p id={`${bodyId}-q`} className="text-sm font-bold">
                {item.question}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${bodyId}-q`}
                className="flex flex-col gap-2"
              >
                {item.options.map((o, k) => (
                  // biome-ignore lint/a11y/useSemanticElements: a full-width tap target with its own dot; aria-checked carries the state.
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={pick === k}
                    onClick={() => setPick(k)}
                    className={cn(
                      "pressable flex min-h-[46px] items-center gap-2.5 rounded-xl border-2 px-3.5 py-2 text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      pick === k
                        ? "border-sunset-2 bg-accent font-semibold"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 rounded-full bg-card",
                        pick === k
                          ? "border-[5px] border-sunset-2"
                          : "border-[1.5px] border-input",
                      )}
                    />
                    {o}
                  </button>
                ))}
              </div>
              <Button
                size="lg"
                className="mt-1 min-h-12 rounded-xl text-[0.9375rem] font-bold"
                disabled={pick === null}
                onClick={() => {
                  if (pick === null) return;
                  if (isFixPick) setMode("fix");
                  else onAnswer(pick);
                }}
              >
                {pick === null
                  ? "Pick one"
                  : isFixPick
                    ? "OK, I'll fix it in Jobber"
                    : "Send answer"}
              </Button>
              {item.kind === "fix" && (
                <Button
                  variant="quiet"
                  className="min-h-9 text-[0.8125rem] text-muted-foreground"
                  onClick={() => setMode("fix")}
                >
                  ‹ Back to fixing it in Jobber
                </Button>
              )}
              <p className="text-xs leading-snug text-muted-foreground">
                {item.kind === "fix"
                  ? `Your answer goes to ${ownerName} to approve. Jobber stays as is until you fix it there.`
                  : `Goes to ${ownerName}. Nothing changes in Jobber.`}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
