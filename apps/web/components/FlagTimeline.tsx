import type { ReactNode } from "react";
import { AgentChip, agentFromActor } from "@/components/AgentChip";
import type { FlagEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A step that has not happened yet: the decision waiting on a person, or the next sync. Never an event. */
export type TimelineStep = { who: string; when: string; text: string };

// The item's audit trail: recorded events (solid dots), then what is waiting now (amber ring) and what comes next
// (hollow dot). Events added in this session but not saved are marked so.
export function FlagTimeline({
  events,
  timeZone,
  now,
  next,
  unsavedIds = [],
}: {
  events: FlagEvent[];
  timeZone: string;
  now?: TimelineStep | null;
  next?: TimelineStep | null;
  unsavedIds?: string[];
}) {
  const when = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  if (events.length === 0 && !now && !next)
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  const pending = [
    now && { ...now, kind: "now" as const },
    next && { ...next, kind: "next" as const },
  ].filter((s) => !!s);
  const last = events.length + pending.length - 1;

  return (
    <ol className="flex flex-col">
      {events.map((e, i) => {
        const unsaved = unsavedIds.includes(e.id);
        return (
          <Row
            key={e.id}
            dot="done"
            isLast={i === last}
            className={
              unsaved
                ? "animate-in duration-(--dur-sheet) ease-out-soft fade-in slide-in-from-top-1"
                : undefined
            }
          >
            <span className="flex flex-wrap items-center gap-2">
              <AgentChip agent={unsaved ? "you" : agentFromActor(e.actor)} />
              <time dateTime={e.at} className="text-xs text-muted-foreground">
                {unsaved
                  ? "Just now · not saved (fixture)"
                  : when.format(new Date(e.at))}
              </time>
            </span>
            <span className="text-sm leading-snug">{e.summary}</span>
          </Row>
        );
      })}
      {pending.map((s, i) => (
        <Row key={s.kind} dot={s.kind} isLast={events.length + i === last}>
          <span className="flex flex-wrap items-center gap-2">
            <AgentChip
              agent={s.kind === "now" ? "you" : "controller"}
              label={s.who}
            />
            <span className="text-xs text-muted-foreground">{s.when}</span>
          </span>
          <span
            className={cn(
              "text-sm leading-snug",
              s.kind === "next" && "text-muted-foreground",
            )}
          >
            {s.text}
          </span>
        </Row>
      ))}
    </ol>
  );
}

function Row({
  dot,
  isLast,
  className,
  children,
}: {
  dot: "done" | "now" | "next";
  isLast: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={cn("flex gap-3.5", className)}>
      <span aria-hidden className="flex w-3 shrink-0 flex-col items-center">
        <span
          className={cn(
            "mt-1 size-3 shrink-0 rounded-full",
            dot === "done" && "bg-muted-foreground",
            dot === "now" && "bg-hold ring-4 ring-hold-soft",
            dot === "next" && "border-2 border-dashed border-input bg-card",
          )}
        />
        {!isLast && <span className="mt-1 w-0.5 flex-1 bg-border" />}
      </span>
      <span className="flex min-w-0 flex-col gap-1.5 pb-5">
        {dot === "now" && <span className="sr-only">Waiting now:</span>}
        {dot === "next" && <span className="sr-only">Next:</span>}
        {children}
      </span>
    </li>
  );
}
